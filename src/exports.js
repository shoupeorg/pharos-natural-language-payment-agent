export const exportJson=draft=>JSON.stringify({...draft,exportLabel:"HISTORICAL SAVED PAYMENT INTERPRETATION RECEIPT"},null,2);
export function exportMarkdown(draft){
  const v=draft.validation,p=draft.parsed;
  return["# Pharos Natural-Language Payment Agent","","**HISTORICAL SAVED PAYMENT INTERPRETATION RECEIPT**","", "- Draft: "+draft.id,"- Status: "+draft.status,"- Instruction: "+draft.instruction,"- Sender: "+draft.sender,"- Recipient: "+(p?.canonical?.recipient||"UNRESOLVED"),"- Asset: "+(p?.canonical?.asset||"UNRESOLVED"),"- Amount: "+(p?.canonical?.amount||"UNRESOLVED"),"- Chain: Pharos Pacific Mainnet / 1672","", "## Interpretation provenance",JSON.stringify(p?.provenance||{},null,2),"", "## Live validation",JSON.stringify(v||null,null,2),"", "## Unsigned transaction",JSON.stringify(draft.unsignedTransaction||null,null,2),"","> NOT SENT / NO SIGNATURE. Public sender addresses do not prove control."].join("\n");
}
