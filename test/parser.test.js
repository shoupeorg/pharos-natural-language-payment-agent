import test from"node:test";import assert from"node:assert/strict";
import{parseInstruction,normalizeAddress}from"../src/parser.js";import{parseDecimal}from"../src/math.js";
const A="0x4117b9737f64d816be36f6c18c72409c98e4737c",T="0xc879c018db60520f4355c26ed1a6d572cdac1815";
test("natural phrasing variations preserve field provenance",()=>{
  for(const text of["Send 1 USDC to "+A,"Pay "+A+" 0.5 USDC","Transfer 0.001 PROS to "+A]){const p=parseInstruction(text);assert.equal(p.status,"PARSED");assert.ok(p.provenance.amount.text);assert.ok(p.provenance.asset.text);assert.ok(p.provenance.recipient.text);}
});
test("missing amount asks a specific follow-up and clarification resolves same draft",()=>{
  const first=parseInstruction("Send USDC to "+A);assert.equal(first.status,"NEEDS_CLARIFICATION");assert.match(first.questions[0].question,/exact decimal amount/i);
  const second=parseInstruction(first.instruction,{amount:"0.25"});assert.equal(second.status,"PARSED");assert.equal(second.provenance.amount.kind,"clarification");
});
test("conflicts, ambiguous separators, USD and unsupported network fail closed",()=>{
  assert.equal(parseInstruction("Send 1 or 2 USDC to "+A).status,"BLOCKED");
  assert.equal(parseInstruction("Send 1,000 USDC to "+A).status,"BLOCKED");
  assert.equal(parseInstruction("Send 1 USD to "+A).status,"BLOCKED");
  assert.equal(parseInstruction("Send 1 USDC to "+A+" on Ethereum").status,"BLOCKED");
});
test("contract role is distinct from recipient regardless of order",()=>{
  const p=parseInstruction("Pay "+A+" 1 token "+T);assert.equal(p.status,"PARSED");assert.equal(p.canonical.recipient,A);assert.equal(p.canonical.tokenContract,T);
});
test("zero, names and malformed mixed checksum are rejected",()=>{
  assert.equal(parseInstruction("Send 1 PROS to 0x0000000000000000000000000000000000000000").status,"BLOCKED");
  assert.equal(parseInstruction("Send 1 PROS to alice.eth").status,"BLOCKED");
  assert.throws(()=>normalizeAddress("0x4117B9737f64d816be36f6c18c72409c98e4737c","Recipient"),/checksum/);
});
test("exact decimal arithmetic rejects precision and scientific notation",()=>{
  assert.equal(parseDecimal("0.000001",6).toString(),"1");assert.throws(()=>parseDecimal("0.0000001",6),/exceeds/);assert.throws(()=>parseDecimal("1e3",18),/plain decimal/);
});
