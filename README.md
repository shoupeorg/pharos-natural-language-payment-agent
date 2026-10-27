# Pharos Natural-Language Payment Agent

A read-only payment preparation desk for Pharos Pacific Mainnet. It turns free text into a transparent interpretation receipt, validates the exact payment with the official Pharos Chain MCP, requires human review, revalidates, and returns an unsigned transaction. It cannot sign or broadcast.

## Architecture

instruction + public sender
→ deterministic parser
→ specific clarification when needed
→ official Chain MCP validation
→ review summary and interpretation receipt
→ server revalidation and digest gate
→ unsigned transaction without nonce, signature, or broadcast

Chain validation covers chain identity, pinned block, bytecode, token metadata, balances, exact calldata, eth_call, gas estimate, and gas price. The estimate and gas price remain explicitly unpinned because their discovered schemas do not accept a block.

## Verified network and registry
- Pharos Pacific Mainnet: chain ID 1672, native PROS, RPC https://rpc.pharos.xyz.
- Official MCP: https://mcp.pharos.xyz/mcp.
- Circle USDC: 0xc879c018db60520f4355c26ed1a6d572cdac1815, verified live as USDC, 6 decimals.
- Registry source: https://www.circle.com/blog/now-available-usdc-cctp-on-pharos
- MCP source: https://github.com/PharosNetwork/pharos-mcp

## Reviewer flow
1. Enter a public sender and natural-language instruction.
2. Select INTERPRET PAYMENT.
3. Answer any question in 2. CLARIFICATIONS.
4. Select VALIDATE LIVE.
5. Inspect the full summary, exact atomic amount, balances, sources, block semantics, simulation, and maximum buffered gas cost.
6. Check I reviewed the recipient, amount, asset, network and estimated fee.
7. Select CONFIRM REVIEW.
8. Select PREPARE UNSIGNED TRANSACTION.

Any clarification or changed draft invalidates the prior validation and review. Preparation performs another live validation. The exported transaction intentionally omits nonce and fee fields for a wallet to populate.

## Development
- npm install
- npm test
- npm run build
- node src/cli.js --sender 0x... --instruction "Send 0.000001 PROS to 0x..." --validate

## Limits
- Only Pharos Pacific Mainnet is supported.
- Name resolution is unavailable; hexadecimal addresses are required.
- eth_call, balances, and bytecode are pinned when the discovered schema supports block. estimate_gas and gas price are unpinned.
- Arbitrary ERC-20 symbol and name labels are not authenticity guarantees.
- Fee-on-transfer, rebasing, proxy upgrades, and token hooks can make outcomes differ.
- A successful read-only simulation does not guarantee later execution and does not change chain state.
- Public sender addresses do not prove ownership.
