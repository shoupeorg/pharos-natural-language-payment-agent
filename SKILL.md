# Pharos Natural-Language Payment Agent

## Purpose
Convert one free-text payment instruction into a transparent, live-validated, human-reviewed unsigned transaction for Pharos Pacific Mainnet.

## Required flow
1. Parse the instruction deterministically and preserve word-level provenance.
2. Ask a specific clarification for every missing or conflicting amount, asset, or recipient.
3. Validate the sender, recipient, chain, contract, metadata, balances, exact calldata, simulation, gas estimate, and gas price through the official Pharos Chain MCP.
4. Present the complete payment and fee summary before preparation.
5. Require the exact review statement.
6. Revalidate and issue only an unsigned transaction bound to the reviewed material fields.

## Safety boundaries
- Never request or accept a private key, seed phrase, signature, approval, or wallet connection.
- Never sign, broadcast, fund, or deploy a contract.
- Never guess decimals, token identity, address resolution, amount, network, gas data, or balances.
- Treat missing reads as unknown, not zero.
- A public sender address is a read target and does not prove control.
- Historical evidence is review material only and cannot authorize preparation.

## Supported scope
- Native PROS transfers on chain 1672.
- Circle USDC at 0xc879c018db60520f4355c26ed1a6d572cdac1815.
- User-supplied ERC-20 contracts with live bytecode, decimals, symbol, balance, standard transfer encoding, successful simulation, and sufficient native gas.
- The parser is deterministic; it is not an LLM.
