import { GOODDOLLAR, bountyBoardAbi } from "@eziokwu/shared";
import { buildApp } from "./app";
import { makeClients } from "./clients";
import { loadConfig } from "./config";
import { Relayer, topupPolicyFrom } from "./relayer";
import { MemoryBlobStore, MemoryStore } from "./store";

const config = loadConfig();
const { publicClient, walletClient } = makeClients(config);
const { gd, identity } = GOODDOLLAR[config.DEPLOY_ENV];

const deployed = !/^0x0{40}$/.test(config.BOUNTY_BOARD);
if (deployed) {
  // Fail fast if the board was deployed against different G$/Identity than DEPLOY_ENV says.
  const [boardGd, boardIdentity] = await Promise.all([
    publicClient.readContract({ address: config.BOUNTY_BOARD, abi: bountyBoardAbi, functionName: "gd" }),
    publicClient.readContract({ address: config.BOUNTY_BOARD, abi: bountyBoardAbi, functionName: "identity" }),
  ]);
  if (boardGd.toLowerCase() !== gd.toLowerCase() || boardIdentity.toLowerCase() !== identity.toLowerCase()) {
    throw new Error(`BountyBoard ${config.BOUNTY_BOARD} uses different G$/Identity than DEPLOY_ENV=${config.DEPLOY_ENV}`);
  }
} else {
  console.warn("BOUNTY_BOARD is the zero address: running in PRE-DEPLOY mode. Linking works; claims, status reads and top-ups need a deployed board.");
}

// TODO(stage 4): swap MemoryStore for the Prisma/Postgres store; links must survive restarts.
const store = new MemoryStore();
const relayer = new Relayer({ publicClient, walletClient, board: config.BOUNTY_BOARD, gd, identity, store, topup: topupPolicyFrom(config) });
const app = await buildApp({ config, store, blobs: new MemoryBlobStore(), relayer, publicClient, board: config.BOUNTY_BOARD, boardDeployed: deployed });

await app.listen({ port: config.PORT, host: "0.0.0.0" });
console.log(`api on :${config.PORT}; relayer ${relayer.address}; env ${config.DEPLOY_ENV}; topup ${config.TOPUP_ENABLED ? "ON" : "off"}`);
