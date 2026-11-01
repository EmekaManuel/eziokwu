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
- [x] DEV DEPLOY DONE (Celo 42220, dev G$/Identity): BountyBoard 0x197773354317E55f4fAA31874Ea27a25B857226e, tx 0x6f01f5dc...7639, block 81602626, 0.54 CELO. On-chain owner/verifier/feeRecipient/feeBps/gd/identity verified. Placeholders: owner/verifier/feeRecipient are throwaway dev keys (see ~/.eziokwu-dev-keys.json, outside repo). Source NOT verified on Celoscan.
- [x] E2E on dev (2026-11-01): link -> verify (dev Identity) -> approve -> claim (gasless) -> submit (gasless) -> accept -> worker +9.7 G$, feeRecipient +0.3 G$. Bounty #1 via scripts/dev-requester.sh.
- [ ] Gas: createBounty ~560k gas = ~0.11 CELO at 200 gwei; relayer claims/submits cost real CELO, needs a funding/limits plan. Verifier address needs CELO to resolve.
- [ ] Mini App task page still hard-codes "Price check"; task specs (title/item/unit/location) come with stage 4
- [ ] Before prod: new deploy with multisig owner, real UBI Pool as feeRecipient; rename check of EIP-712 domain

## Stage 3: Relayer + EIP-712 + Mini App  (DONE, awaiting "continue")
- [x] /shared: APP_NAME constant, ABI (generated), EIP-712 types, link message, submission hashing, G$/NGN formatting
- [x] /api: Telegram initData auth, wallet linking, relayer (claimFor/submitFor), CELO top-up (flag + per-address + daily cap), submissions store
- [x] /web Mini App: link, verify (citizen-sdk), approve, task claim + submit. Builds clean.
- [x] 33 API tests against a local anvil chain; contract tests unchanged
- [ ] NOT tested: the Mini App UI inside real Telegram with a real wallet / real face verification (needs bot + deployed contract)

- [ ] Task spec/title/photo/location in the task page arrive with stages 4-5
- [ ] Need: Telegram bot token, WalletConnect project id, relayer key (funded), deployed BountyBoard

## Stage 4: Telegram bot + DB schema + location feed  (BUILT + tested, awaiting review / "continue")
- [x] /db package: Prisma 6 schema + migration (User, Link, Nonce, Topup, Task, Blob, Claim); tasksNear (bbox in SQL, exact haversine in code)
- [x] /api: PgStore/PgBlobStore/PgTaskStore replace memory when DATABASE_URL is set; same contract test runs on both stores (incl. races: nonce, wallet link, top-up cap; removing the advisory lock makes the cap test fail)
- [x] Task descriptions: Task table; specHash = keccak256(canonical JSON) is the on-chain specHash; GET /v1/tasks/:bountyId; Mini App recomputes the hash and warns on mismatch
- [x] /bot package (grammY): /start /help /link /tasks /mytasks /earnings /tier /notify /forgetme, location feed (open tasks only, nearest first, net-of-fee reward), daily nudge with opt-out + 403 handling; 13 tests with real Postgres + fake chain
- [x] Bot can run inside the API (BOT_ENABLED=true, long polling) or standalone (pnpm --filter @eziokwu/bot start). ONE poller per token.
- [x] scripts/dev-db.sh (local Postgres :5433), api/scripts/task.ts (create/link task description), dev-requester.sh create takes SPEC_HASH
- [ ] NOT done (moved to stage 5 with the verifier, because verification needs the media): photo + live-location capture, voice note submissions, file storage
- [ ] NOT tested: bot against real Telegram (needs the NEW bot token + BOT_ENABLED=true + WEB_APP_URL); Mini App task-description UI not looked at in a browser
- [ ] Rate limiting on bot commands (grammY throttler) not added
- [ ] Hosting: Render needs a Postgres + DATABASE_URL, start = migrate deploy then api start
## Stage 5: Verifier pipeline + review queue
## Stage 6: Price-index job + /prices
## Stage 7: Requester API + MCP + dashboard
## Stage 8: Indexer + /stats + README + e2e test
