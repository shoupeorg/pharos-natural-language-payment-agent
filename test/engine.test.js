import test from"node:test";import assert from"node:assert/strict";
import{encodeAbiParameters}from"viem";
import{parseInstruction}from"../src/parser.js";
import{validatePayment}from"../src/engine.js";
const S="0x15ddce897d76ac39c188ade4d353711a60395315",R="0x4117b9737f64d816be36f6c18c72409c98e4737c",T="0xc879c018db60520f4355c26ed1a6d572cdac1815";
const tools=["get_chain_info","get_block","get_balance","get_gas_price","get_code","eth_call","estimate_gas"].map(name=>({name,inputSchema:{properties:(["get_balance","get_code","eth_call"].includes(name)?{block:{},transaction:{}}:{transaction:{}})}}));
function adapter(options={}){
  let calls=[];
  const call=async(name,args)=>{calls.push({name,args});
    if(name==="get_chain_info")return{chainId:options.chainId??1672};
    if(name==="get_block")return{number:"0x10",hash:"0x"+"ab".repeat(32),timestamp:"0x69000000"};
    if(name==="get_balance")return{balanceWei:options.nativeBalance??"2000000000000000000"};
    if(name==="get_gas_price"){if(options.missingGasPrice)return{};return{gasPriceWei:"10000000000"};}
    if(name==="get_code")return{code:args.address.toLowerCase()===T?"0x6000":"0x"};
    if(name==="estimate_gas"){if(options.estimateError)throw new Error("timeout");return{gas:args.transaction.to.toLowerCase()===T?"79757":"21000"};}
    if(name==="eth_call"){const data=args.transaction.data||"0x";
      if(data.startsWith("0x313ce567"))return{result:encodeAbiParameters([{type:"uint8"}],[6])};
      if(data.startsWith("0x95d89b41"))return{result:encodeAbiParameters([{type:"string"}],["USDC"])};
      if(data.startsWith("0x06fdde03")){if(options.nameFailure)throw new Error("name unavailable");return{result:encodeAbiParameters([{type:"string"}],["USD Coin"]) }; }
      if(data.startsWith("0x70a08231"))return{result:encodeAbiParameters([{type:"uint256"}],[BigInt(options.tokenBalance??"2000000000")])};
      if(data.startsWith("0xa9059cbb")){if(options.revert)throw Object.assign(new Error("execution reverted: denied"),{code:3});if(options.emptyReturn)return{result:"0x"};if(options.falseReturn)return{result:encodeAbiParameters([{type:"bool"}],[false])};return{result:encodeAbiParameters([{type:"bool"}],[true])};}
      return{result:"0x"};
    }
    throw new Error("unexpected "+name);
  };return{call,tools,calls};
}
test("valid native payment uses exact transaction and pinned reads",async()=>{const a=adapter(),p=parseInstruction("Send 0.000001 PROS to "+R),v=await validatePayment(p,S,a);assert.equal(v.status,"VALIDATED");assert.equal(v.amount.atomic,"1000000000000");assert.equal(v.transaction.to,R);assert.equal(v.gas.estimate,"21000");assert.equal(v.observation.ethCallPinned,true);});
test("USDC validates metadata, balances and encoded round-trip",async()=>{const a=adapter(),p=parseInstruction("Pay "+R+" 0.000001 USDC"),v=await validatePayment(p,S,a);assert.equal(v.status,"VALIDATED");assert.equal(v.amount.atomic,"1");assert.equal(v.transferRoundTrip.recipient,R);assert.equal(v.transaction.to,T);assert.equal(v.asset.decimals,6);});
test("enough tokens but insufficient gas blocks",async()=>{const a=adapter({nativeBalance:"1"}),v=await validatePayment(parseInstruction("Pay "+R+" 1 USDC"),S,a);assert.equal(v.status,"BLOCKED");assert.ok(v.issues.some(x=>x.code==="INSUFFICIENT_GAS_BALANCE"));});
test("native amount plus buffered gas determines sufficiency",async()=>{const a=adapter({nativeBalance:"1000000000000000000"}),v=await validatePayment(parseInstruction("Send 1 PROS to "+R),S,a);assert.equal(v.status,"BLOCKED");assert.ok(v.issues.some(x=>x.code==="INSUFFICIENT_NATIVE_BALANCE"));});
test("missing reads are not explicit zero",async()=>{const a=adapter({missingGasPrice:true});await assert.rejects(()=>validatePayment(parseInstruction("Send 1 PROS to "+R),S,a),/Gas price/);});
test("revert, false and empty ERC20 results are distinct and block",async()=>{for(const option of[{revert:true,kind:"EVM_REVERT"},{falseReturn:true,kind:"ERC20_FALSE"},{emptyReturn:true,kind:"NON_STANDARD_EMPTY_RETURN"}]){const v=await validatePayment(parseInstruction("Send 1 USDC to "+R),S,adapter(option));assert.equal(v.status,"BLOCKED");assert.equal(v.simulation.kind,option.kind);}});
test("missing optional token name is disclosed without inventing metadata",async()=>{const v=await validatePayment(parseInstruction("Send 1 USDC to "+R),S,adapter({nameFailure:true}));assert.equal(v.status,"VALIDATED");assert.equal(v.asset.name,null);assert.ok(v.warnings.some(x=>/name/.test(x)));});
