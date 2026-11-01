# Eziokwu: TODO

Product name lives in one constant (to be created in the shared config at stage 3; the contract's
EIP-712 domain name is "Eziokwu BountyBoard" and must be changed before mainnet deploy if renaming).

## Stage 1: Contract + Foundry tests  (DONE, awaiting "continue")
- [x] BountyBoard.sol (Solidity 0.8.28 build, ^0.8.24 pragma, OZ 5.4)
- [x] Mocks: MockGD, MockIdentity
- [x] Unit tests (54), fuzz tests, invariant suite (5 invariants, all terminal claim states reached)
- [x] Mutation check: removing the bond refund is caught by the balance invariant
- [x] Slither: 3 low/informational findings, none actionable
- [ ] Open: confirm UBI Pool address with GoodDollar (feeRecipient)
- [x] Decided: requester-rejected bonds go to feeRecipient (no incentive to reject honest work); verifier-rejected bonds go to requester; self-dealing accepted and documented

- Brief goals (for /stats later): 300 verified workers, 45% weekly retention, 1,500 tasks/week by month 3, 5 external requesters

## Stage 2: Deploy scripts  (DONE, awaiting "continue"; NOTHING BROADCAST)
- [x] contracts/script/Deploy.s.sol (DEPLOY_ENV=dev|prod|local), .env.example, Makefile
- [x] 9 script tests; dry-run against live Celo for dev and prod passes (G$ decimals=18, Identity ABI present)
- [ ] Before any real deploy: set FEE_RECIPIENT (UBI pool), OWNER (multisig), VERIFIER; import deployer keystore; get explicit go-ahead
- [ ] Optional: Celoscan API key for --verify
## Stage 3: Relayer + EIP-712 + Mini App  (DONE, awaiting "continue")
- [x] /shared: APP_NAME constant, ABI (generated), EIP-712 types, link message, submission hashing, G$/NGN formatting
- [x] /api: Telegram initData auth, wallet linking, relayer (claimFor/submitFor), CELO top-up (flag + per-address + daily cap), submissions store
- [x] /web Mini App: link, verify (citizen-sdk), approve, task claim + submit. Builds clean.
- [x] 33 API tests against a local anvil chain; contract tests unchanged
- [ ] NOT tested: the Mini App UI inside real Telegram with a real wallet / real face verification (needs bot + deployed contract)
- [ ] Stage 4 swaps MemoryStore for Postgres (links currently lost on API restart)
- [ ] Task spec/title/photo/location in the task page arrive with stages 4-5
- [ ] Need: Telegram bot token, WalletConnect project id, relayer key (funded), deployed BountyBoard

## Stage 4: Telegram bot + DB schema + location feed
## Stage 5: Verifier pipeline + review queue
## Stage 6: Price-index job + /prices
## Stage 7: Requester API + MCP + dashboard
## Stage 8: Indexer + /stats + README + e2e test
