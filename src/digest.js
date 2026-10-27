const encoder=new TextEncoder();
export async function digest(value){
  const bytes=await crypto.subtle.digest("SHA-256",encoder.encode(JSON.stringify(value)));
  return[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
