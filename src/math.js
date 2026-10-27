export function parseDecimal(value,decimals,label="amount"){
  const s=String(value??"").trim();
  if(!s)throw new Error(label+" is required.");
  if(/[,_\s]/.test(s))throw new Error(label+" contains an ambiguous separator.");
  if(/[eE]/.test(s)||!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s))throw new Error(label+" must be a positive plain decimal string.");
  const parts=s.split("."),whole=parts[0],fraction=parts[1]||"";
  if(fraction.length>decimals)throw new Error(label+" exceeds "+decimals+" decimal places.");
  const raw=BigInt(whole)*10n**BigInt(decimals)+BigInt((fraction+"0".repeat(decimals)).slice(0,decimals)||"0");
  if(raw<=0n)throw new Error(label+" must be greater than zero.");
  if(raw>2n**256n-1n)throw new Error(label+" exceeds uint256.");
  return raw;
}
export function formatUnits(value,decimals){
  const n=BigInt(value),scale=10n**BigInt(decimals),whole=n/scale,fraction=(n%scale).toString().padStart(decimals,"0").replace(/0+$/,"");
  return fraction?whole+"."+fraction:whole.toString();
}
export const toQuantity=value=>"0x"+BigInt(value).toString(16);
export const ceilBuffer=(gas,bps)=>((BigInt(gas)*(10000n+BigInt(bps)))+9999n)/10000n;
