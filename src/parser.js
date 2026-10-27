import{getAddress,isAddress,zeroAddress}from"viem";
import{NETWORK,USDC,LIMITS}from"./constants.js";

const span=(text,start,end,kind)=>({text:text.slice(start,end),start,end,kind});
const question=field=>({
  field,
  question:field==="amount"?"What exact decimal amount should be paid?":field==="asset"?"Which asset: PROS, USDC, or an ERC-20 contract address?":"What is the recipient's hexadecimal address?"
});
export function normalizeAddress(value,label){
  const raw=String(value||"").trim();
  if(/\.(eth|xyz)$/i.test(raw))throw new Error(label+" name resolution is unavailable; provide a hexadecimal address.");
  if(!isAddress(raw,{strict:false}))throw new Error(label+" is not a valid EVM address.");
  const checksummed=getAddress(raw);
  if(raw!==raw.toLowerCase()&&raw!==raw.toUpperCase()&&raw!==checksummed)throw new Error(label+" has an invalid mixed-case checksum.");
  if(checksummed.toLowerCase()===zeroAddress)throw new Error(label+" cannot be the zero address.");
  return checksummed.toLowerCase();
}
export function validateSender(value){return normalizeAddress(value,"Sender");}
export function parseInstruction(instruction,clarifications={}){
  const text=String(instruction??"").trim();
  if(!text)throw new Error("Payment instruction is required.");
  if(new TextEncoder().encode(text).length>LIMITS.instructionBytes)throw new Error("Instruction exceeds 4096 bytes.");
  const issues=[],provenance={};
  if(/\b(ethereum|sepolia|atlantic|polygon|arbitrum|base|bsc)\b/i.test(text)&&!/pharos pacific/i.test(text))issues.push({code:"UNSUPPORTED_NETWORK",message:"Only Pharos Pacific Mainnet is supported."});
  const contractMatch=text.match(/(?:token|erc-?20|contract)\s+(0x[0-9a-fA-F]{40})/i);
  const contractStart=contractMatch?contractMatch.index+contractMatch[0].lastIndexOf(contractMatch[1]):-1;
  const addressMatches=[...text.matchAll(/0x[0-9a-fA-F]{40}|[A-Za-z0-9-]+\.(?:eth|xyz)/g)].filter(m=>m.index!==contractStart);
  let recipient=clarifications.recipient||null;
  if(!recipient){
    if(addressMatches.length===1){const m=addressMatches[0];recipient=m[0];provenance.recipient=span(text,m.index,m.index+m[0].length,"instruction");}
    else if(addressMatches.length>1)issues.push({code:"AMBIGUOUS_RECIPIENT",message:"Multiple recipient-like addresses were found; identify the intended recipient."});
  }else provenance.recipient={text:recipient,kind:"clarification"};
  const amountMatches=[...text.matchAll(/(?<![\w.])-?\d[\d,_]*(?:\.\d+)?(?![\w.])/g)].filter(m=>m[0]!=="1672");
  let amount=clarifications.amount||null;
  if(!amount){
    const values=[...new Set(amountMatches.map(m=>m[0]))];
    if(values.length===1){const m=amountMatches[0];amount=m[0];provenance.amount=span(text,m.index,m.index+m[0].length,"instruction");}
    else if(values.length>1)issues.push({code:"AMBIGUOUS_AMOUNT",message:"Conflicting amounts were found: "+values.join(", ")+"."});
  }else provenance.amount={text:amount,kind:"clarification"};
  if(amount&&/[,_]/.test(amount))issues.push({code:"AMBIGUOUS_SEPARATOR",message:"Amount separators such as comma or underscore are ambiguous; enter an ungrouped decimal."});
  if(amount&&(/^-/ .test(amount)||/^0(?:\.0*)?$/.test(amount)))issues.push({code:"INVALID_AMOUNT",message:"Amount must be greater than zero."});
  let asset=clarifications.asset||null,tokenContract=clarifications.tokenContract||null;
  const symbols=[...new Set([...text.matchAll(/\b(PROS|USDC|USD)\b/gi)].map(m=>m[1].toUpperCase()))];
  if(!asset){
    if(contractMatch){asset="ERC20";tokenContract=contractMatch[1];provenance.asset={text:contractMatch[0],kind:"instruction"};}
    else if(symbols.length===1&&symbols[0]!=="USD"){asset=symbols[0];const m=text.match(new RegExp("\\b"+asset+"\\b","i"));provenance.asset=span(text,m.index,m.index+m[0].length,"instruction");}
    else if(symbols.includes("USD"))issues.push({code:"USD_NOT_USDC",message:"A USD amount is not automatically USDC; specify USDC or a token contract."});
    else if(symbols.length>1)issues.push({code:"AMBIGUOUS_ASSET",message:"Conflicting assets were found: "+symbols.join(", ")+"."});
  }else provenance.asset={text:asset,kind:"clarification"};
  const missing=[];if(!amount)missing.push("amount");if(!asset)missing.push("asset");if(!recipient)missing.push("recipient");
  let normalizedRecipient=null,normalizedToken=null;
  if(recipient)try{normalizedRecipient=normalizeAddress(recipient,"Recipient");}catch(error){issues.push({code:"INVALID_RECIPIENT",message:error.message});}
  if(tokenContract)try{normalizedToken=normalizeAddress(tokenContract,"Token contract");}catch(error){issues.push({code:"INVALID_TOKEN_CONTRACT",message:error.message});}
  if(asset&&asset.toUpperCase()==="USDC")normalizedToken=USDC.address;
  if(asset&&asset.toUpperCase()==="ERC20"&&!normalizedToken&&!missing.includes("asset"))missing.push("asset");
  const canonical={network:NETWORK.name,chainId:NETWORK.chainId,amount,asset:asset?asset.toUpperCase():null,recipient:normalizedRecipient,tokenContract:normalizedToken};
  return{instruction:text,canonical,clarifications,provenance,issues,questions:[...new Set(missing)].map(question),status:issues.length?"BLOCKED":missing.length?"NEEDS_CLARIFICATION":"PARSED",parser:"deterministic rules; no LLM"};
}
