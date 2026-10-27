import{decodeFunctionData,decodeFunctionResult,encodeFunctionData}from"viem";
import{ENGINE_VERSION,ERC20_ABI,LIMITS,NETWORK,OFFICIAL_SOURCES,USDC}from"./constants.js";
import{digest}from"./digest.js";
import{ceilBuffer,formatUnits,parseDecimal,toQuantity}from"./math.js";
import{validateSender}from"./parser.js";
import{withChainMcp}from"./mcp.js";

const asError=value=>value?.error?Object.assign(new Error(value.error.message||"RPC error."),{code:value.error.code??null,data:value.error.data??null}):value;
const required=(value,label)=>{if(value==null)throw new Error(label+" was unavailable.");return asError(value);};
const blockInfo=raw=>({hex:raw.number,decimal:BigInt(raw.number).toString(),hash:raw.hash,timestamp:new Date(Number(BigInt(raw.timestamp))*1000).toISOString()});
const supportsBlock=(tools,name)=>Object.hasOwn(tools.find(x=>x.name===name)?.inputSchema?.properties||{},"block");
const traceItem=(trace,tool,args,started,result,error,pinned)=>trace.push({step:trace.length+1,tool,args,startedAt:started,completedAt:new Date().toISOString(),status:error?"FAILED":"OK",pinned,error:error?{message:error.message,code:error.code??null,data:error.data??null}:null,result:error?null:result});
async function execute(call,trace,tool,args,pinned=false){
  const started=new Date().toISOString();
  try{const result=required(await call(tool,args),tool);traceItem(trace,tool,args,started,result,null,pinned);return result;}
  catch(error){traceItem(trace,tool,args,started,null,error,pinned);throw error;}
}
function callError(error){
  const message=String(error?.message||error),data=error?.data??null,code=error?.code??null;
  const evm=/execution reverted|\brevert(?:ed)?\b/i.test(message)||code===3;
  return{kind:evm?"EVM_REVERT":/timeout|fetch failed|network/i.test(message)?"TRANSPORT_ERROR":"RPC_ERROR",message,code,data};
}
function material(parsed,sender,token,decimals,atomic,tx){return{sender,recipient:parsed.canonical.recipient,chainId:NETWORK.chainId,asset:parsed.canonical.asset,tokenContract:token||null,decimals,amount:parsed.canonical.amount,atomicAmount:atomic,transaction:{to:tx.to,value:tx.value,data:tx.data}};}
export async function validatePayment(parsed,senderInput,injected=null,now=new Date()){
  if(parsed?.status!=="PARSED")throw new Error("Draft must be fully parsed before live validation.");
  const sender=validateSender(senderInput),trace=[];
  const run=async({call,tools})=>{
    const chain=await execute(call,trace,"get_chain_info",{},false);
    if(chain.chainId!==NETWORK.chainId)throw new Error("Chain MCP returned chain "+chain.chainId+"; expected "+NETWORK.chainId+".");
    const rawBlock=await execute(call,trace,"get_block",{block:"latest",includeTransactions:false},false),block=blockInfo(rawBlock);
    const pin=(tool,args)=>supportsBlock(tools,tool)?{...args,block:block.hex}:args;
    const senderBalance=await execute(call,trace,"get_balance",pin("get_balance",{address:sender}),supportsBlock(tools,"get_balance"));
    const gasPrice=await execute(call,trace,"get_gas_price",{},false);
    if(!/^\d+$/.test(String(senderBalance.balanceWei??"")))throw new Error("Native balance result was missing or malformed.");
    if(!/^\d+$/.test(String(gasPrice.gasPriceWei??"")))throw new Error("Gas price result was missing or malformed.");
    const recipient=parsed.canonical.recipient,recipientCode=await execute(call,trace,"get_code",pin("get_code",{address:recipient}),supportsBlock(tools,"get_code"));
    if(typeof recipientCode.code!=="string")throw new Error("Recipient bytecode result was unavailable.");
    let token=null,decimals=18,symbol=NETWORK.nativeSymbol,name=NETWORK.nativeSymbol,tokenBalanceRaw=null,optionalMetadata=null,tx,simulation,transferRoundTrip=null,amountRaw;
    const asset=parsed.canonical.asset;
    if(asset==="PROS"){
      amountRaw=parseDecimal(parsed.canonical.amount,18).toString();
      tx={from:sender,to:recipient,value:toQuantity(amountRaw),data:"0x"};
      try{const result=await execute(call,trace,"eth_call",pin("eth_call",{transaction:tx}),supportsBlock(tools,"eth_call"));simulation={kind:"SUCCESS",returnData:result.result??null};}
      catch(error){simulation=callError(error);}
    }else{
      token=(asset==="USDC"?USDC.address:parsed.canonical.tokenContract);
      if(!token)throw new Error("An ERC-20 token contract is required.");
      const code=await execute(call,trace,"get_code",pin("get_code",{address:token}),supportsBlock(tools,"get_code"));
      if(code.code==="0x"||code.code==="0x0")throw new Error("Token address has no deployed bytecode at the observation block.");
      const read=async function(functionName,args=[]){const data=encodeFunctionData({abi:ERC20_ABI,functionName,args});const value=await execute(call,trace,"eth_call",pin("eth_call",{transaction:{to:token,data}}),supportsBlock(tools,"eth_call"));return decodeFunctionResult({abi:ERC20_ABI,functionName,data:value.result});};
      decimals=Number(await read("decimals"));if(!Number.isInteger(decimals)||decimals<0||decimals>255)throw new Error("Token decimals were invalid.");
      symbol=String(await read("symbol"));if(!symbol.trim())throw new Error("Token symbol was missing.");
      try{name=String(await read("name"));}catch(error){name=null;optionalMetadata="Token name() was unavailable: "+error.message;}
      tokenBalanceRaw=(await read("balanceOf",[sender])).toString();
      amountRaw=parseDecimal(parsed.canonical.amount,decimals).toString();
      const data=encodeFunctionData({abi:ERC20_ABI,functionName:"transfer",args:[recipient,BigInt(amountRaw)]});
      const decoded=decodeFunctionData({abi:ERC20_ABI,data});
      transferRoundTrip={functionName:decoded.functionName,recipient:String(decoded.args[0]).toLowerCase(),amountRaw:decoded.args[1].toString()};
      if(transferRoundTrip.recipient!==recipient||transferRoundTrip.amountRaw!==amountRaw)throw new Error("Encoded ERC-20 transfer failed independent round-trip decoding.");
      tx={from:sender,to:token,value:"0x0",data};
      try{
        const result=await execute(call,trace,"eth_call",pin("eth_call",{transaction:tx}),supportsBlock(tools,"eth_call"));
        if(typeof result.result!=="string"||result.result==="0x")simulation={kind:"NON_STANDARD_EMPTY_RETURN",returnData:result.result??null};
        else{try{const ok=decodeFunctionResult({abi:ERC20_ABI,functionName:"transfer",data:result.result});simulation={kind:ok===true?"SUCCESS":"ERC20_FALSE",returnData:result.result};}catch{simulation={kind:"MALFORMED_RETURN",returnData:result.result};}}
      }catch(error){simulation=callError(error);}
    }
    let estimate;
    try{estimate=await execute(call,trace,"estimate_gas",{transaction:tx},false);}catch(error){estimate={error:callError(error)};}
    const gas=/^\d+$/.test(String(estimate.gas??""))?BigInt(estimate.gas):null,price=BigInt(gasPrice.gasPriceWei),buffered=gas===null?null:ceilBuffer(gas,LIMITS.gasBufferBps),maxCost=buffered===null?null:buffered*price,nativeBalance=BigInt(senderBalance.balanceWei),amount=BigInt(amountRaw);
    const issues=[],warnings=[];
    if(simulation.kind!=="SUCCESS")issues.push({code:simulation.kind,message:simulation.message||"Exact simulation did not establish a successful payment."});
    if(gas===null||maxCost===null)issues.push({code:"GAS_ESTIMATE_UNAVAILABLE",message:"Gas estimate is unavailable."});
    if(asset==="PROS"&&maxCost!==null&&nativeBalance<amount+maxCost)issues.push({code:"INSUFFICIENT_NATIVE_BALANCE",message:"Native balance cannot cover payment value plus buffered gas."});
    if(asset!=="PROS"&&BigInt(tokenBalanceRaw)<amount)issues.push({code:"INSUFFICIENT_TOKEN_BALANCE",message:"Token balance is insufficient."});
    if(asset!=="PROS"&&maxCost!==null&&nativeBalance<maxCost)issues.push({code:"INSUFFICIENT_GAS_BALANCE",message:"Native balance is insufficient for buffered gas."});
    if(sender===recipient)warnings.push("Self-transfer: sender and recipient are identical.");
    if(token&&recipient===token)warnings.push("Recipient is the token contract; review carefully.");
    if(asset!=="PROS")warnings.push("Token hooks, transfer fees, rebasing, or proxy behavior can make recipient outcomes differ.");
    if(optionalMetadata)warnings.push(optionalMetadata);
    const paymentMaterial=material(parsed,sender,token,decimals,amountRaw,tx),materialDigest=await digest(paymentMaterial);
    const validation={
      id:crypto.randomUUID(),engineVersion:ENGINE_VERSION,status:issues.length?"BLOCKED":"VALIDATED",historical:false,
      parsed,sender,network:NETWORK,asset:{kind:asset==="PROS"?"NATIVE":"ERC20",symbol,name,contract:token,decimals,registrySource:asset==="USDC"?USDC.source:null},
      amount:{human:parsed.canonical.amount,atomic:amountRaw},balances:{nativeWei:nativeBalance.toString(),native:formatUnits(nativeBalance,18),tokenRaw:tokenBalanceRaw,token:tokenBalanceRaw===null?null:formatUnits(tokenBalanceRaw,decimals)},
      transaction:tx,transferRoundTrip,simulation,gas:{estimate:gas?.toString()??null,bufferedLimit:buffered?.toString()??null,gasPriceWei:price.toString(),maximumCostWei:maxCost?.toString()??null,source:"get_gas_price; estimate_gas",estimatePinned:false,gasPricePinned:false},
      block,observation:{capturedAt:now.toISOString(),ethCallPinned:supportsBlock(tools,"eth_call"),balancePinned:supportsBlock(tools,"get_balance"),estimateGasPinned:false,expiresAt:new Date(now.getTime()+LIMITS.ttlMs).toISOString()},
      material:paymentMaterial,materialDigest,issues,warnings,sources:OFFICIAL_SOURCES,toolTrace:trace,
      disclosure:"NOT SENT / NO SIGNATURE. A public sender address does not prove control."
    };
    validation.validationDigest=await digest({materialDigest,status:validation.status,block:block.hash,balances:validation.balances,gas:validation.gas,simulation});
    return validation;
  };
  if(injected)return run(injected);
  return withChainMcp(run);
}
export async function createReview(validation,accepted,now=new Date()){
  if(!accepted)throw Object.assign(new Error("Review confirmation is required."),{status:409});
  if(validation?.status!=="VALIDATED")throw Object.assign(new Error("Only a successful live validation can be reviewed."),{status:409});
  if(Date.parse(validation.observation.expiresAt)<=now.getTime())throw Object.assign(new Error("Validation expired; validate again."),{status:409});
  return{accepted:true,statement:"I reviewed the recipient, amount, asset, network and estimated fee.",materialDigest:validation.materialDigest,validationDigest:validation.validationDigest,reviewedAt:now.toISOString()};
}
export async function prepareUnsigned(previousValidation,review,freshValidation,now=new Date()){
  if(!previousValidation||!review||!freshValidation)throw Object.assign(new Error("Validation and review are required."),{status:409});
  if(previousValidation.historical||freshValidation.historical)throw Object.assign(new Error("Historical validations cannot authorize preparation."),{status:409});
  if(previousValidation.status!=="VALIDATED"||freshValidation.status!=="VALIDATED")throw Object.assign(new Error("Fresh live validation did not pass."),{status:409});
  if(Date.parse(previousValidation.observation.expiresAt)<=now.getTime())throw Object.assign(new Error("Reviewed validation expired."),{status:409});
  if(review.materialDigest!==previousValidation.materialDigest||review.validationDigest!==previousValidation.validationDigest)throw Object.assign(new Error("Review is not bound to this validation."),{status:409});
  if(freshValidation.materialDigest!==previousValidation.materialDigest)throw Object.assign(new Error("Payment fields changed after review."),{status:409});
  const tx=freshValidation.transaction;
  return{kind:"UNSIGNED_TRANSACTION",unsigned:true,signed:false,broadcast:false,authorizedByValidationId:freshValidation.id,reviewedAt:review.reviewedAt,preparedAt:now.toISOString(),transaction:{chainId:NETWORK.chainId,from:tx.from,to:tx.to,value:tx.value,data:tx.data,gas:toQuantity(freshValidation.gas.bufferedLimit)},walletMustPopulate:["nonce","fee fields"],warning:"NOT SENT / NO SIGNATURE. Revalidation does not guarantee later execution."};
}
