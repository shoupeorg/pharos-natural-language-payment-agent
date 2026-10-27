import{ENGINE_VERSION,LIMITS,NETWORK,OFFICIAL_SOURCES,USDC}from"./constants.js";
import{createReview,prepareUnsigned,validatePayment}from"./engine.js";
import{exportJson,exportMarkdown}from"./exports.js";
import{parseInstruction,validateSender}from"./parser.js";
import*as store from"./store.js";

const json=(value,status=200,headers={})=>new Response(JSON.stringify(value,null,2),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,"0")).join("");
const parseBody=async request=>{try{return await request.json();}catch{throw Object.assign(new Error("Valid JSON body required."),{status:400});}};
const rate=new Map();
function limited(ip){const now=Date.now(),entry=rate.get(ip)||{start:now,count:0};if(now-entry.start>60000){entry.start=now;entry.count=0;}entry.count++;rate.set(ip,entry);return entry.count>LIMITS.ratePerMinute;}
async function auth(request,env){const id=request.headers.get("x-workspace-id"),cap=request.headers.get("x-workspace-capability");if(!id||!cap||!await store.authenticate(env.DB,id,await hash(cap)))throw Object.assign(new Error("Workspace authentication required."),{status:401});return id;}
async function draftFor(request,env,id){const workspaceId=await auth(request,env),draft=await store.getDraft(env.DB,workspaceId,id);if(!draft)throw Object.assign(new Error("Draft not found."),{status:404});return draft;}
const touch=draft=>({...draft,updatedAt:new Date().toISOString()});

export default{async fetch(request,env){
  const url=new URL(request.url);
  try{
    if(url.pathname.startsWith("/api/")&&limited(request.headers.get("cf-connecting-ip")||"local"))return json({error:"Public rate limit exceeded."},429);
    if(url.pathname==="/api/meta")return json({engineVersion:ENGINE_VERSION,network:NETWORK,registry:{USDC},sources:OFFICIAL_SOURCES,readOnly:true,signing:false,broadcast:false});
    if(url.pathname==="/api/workspaces"&&request.method==="POST"){const id=crypto.randomUUID(),capability=(crypto.randomUUID()+crypto.randomUUID()).replace(/-/g,""),now=new Date().toISOString();await store.createWorkspace(env.DB,id,await hash(capability),now);return json({workspaceId:id,capability},201);}
    if(url.pathname==="/api/drafts"&&request.method==="POST"){
      const workspaceId=await auth(request,env),body=await parseBody(request),sender=validateSender(body.sender),parsed=parseInstruction(body.instruction,body.clarifications||{}),now=new Date().toISOString();
      const draft={id:crypto.randomUUID(),workspaceId,sender,instruction:parsed.instruction,clarifications:body.clarifications||{},parsed,validation:null,review:null,unsignedTransaction:null,status:parsed.status,createdAt:now,updatedAt:now};
      return json(await store.createDraft(env.DB,draft),201);
    }
    if(url.pathname==="/api/drafts"&&request.method==="GET"){const workspaceId=await auth(request,env);return json({drafts:await store.listDrafts(env.DB,workspaceId)});}
    const match=url.pathname.match(/^\/api\/drafts\/([^/]+)(?:\/(clarify|validate|review|prepare|export))?$/);
    if(match){
      let draft=await draftFor(request,env,match[1]),action=match[2];
      if(!action&&request.method==="GET")return json(draft);
      if(action==="clarify"&&request.method==="POST"){const body=await parseBody(request);draft.clarifications={...draft.clarifications,...body};draft.parsed=parseInstruction(draft.instruction,draft.clarifications);draft.validation=null;draft.review=null;draft.unsignedTransaction=null;draft.status=draft.parsed.status;return json(await store.updateDraft(env.DB,touch(draft)));}
      if(action==="validate"&&request.method==="POST"){draft.validation=await validatePayment(draft.parsed,draft.sender);draft.review=null;draft.unsignedTransaction=null;draft.status=draft.validation.status;return json(await store.updateDraft(env.DB,touch(draft)));}
      if(action==="review"&&request.method==="POST"){const body=await parseBody(request);draft.review=await createReview(draft.validation,body.accepted===true);draft.status="REVIEWED";return json(await store.updateDraft(env.DB,touch(draft)));}
      if(action==="prepare"&&request.method==="POST"){const fresh=await validatePayment(draft.parsed,draft.sender);draft.unsignedTransaction=await prepareUnsigned(draft.validation,draft.review,fresh);draft.validation=fresh;draft.status="PREPARED_UNSIGNED";return json(await store.updateDraft(env.DB,touch(draft)));}
      if(action==="export"&&request.method==="GET"){const format=url.searchParams.get("format")||"json",text=format==="md"?exportMarkdown(draft):exportJson(draft);return new Response(text,{headers:{"content-type":format==="md"?"text/markdown; charset=utf-8":"application/json; charset=utf-8","content-disposition":"attachment; filename=payment-"+draft.id+"."+format}});}
    }
    return env.ASSETS.fetch(request);
  }catch(error){return json({error:error.message||"Unexpected error."},error.status||400);}
}};
