/** The product name. Change it here (and the EIP-712 domain below + contract before mainnet deploy). */
export const APP_NAME = "Eziokwu";

export const TOKEN_SYMBOL = "G$";
export const CELO_CHAIN_ID = 42220;

/**
 * EIP-712 domain name hard-coded in BountyBoard's constructor. It is deliberately NOT derived from
 * APP_NAME: renaming the product must not silently change a deployed contract's domain. An on-chain
 * test compares this with `eip712Domain()`.
 */
export const EIP712_DOMAIN_NAME = "Eziokwu BountyBoard";
export const EIP712_DOMAIN_VERSION = "1";

export type DeployEnv = "dev" | "prod";

/** GoodDollar addresses on Celo, verified against docs.gooddollar.org. */
export const GOODDOLLAR = {
  prod: {
    gd: "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A",
    identity: "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42",
  },
  dev: {
    gd: "0xFa51eFDc0910CCdA91732e6806912Fa12e2FD475",
    identity: "0xF25fA0D4896271228193E782831F6f3CFCcF169C",
  },
} as const satisfies Record<DeployEnv, { gd: `0x${string}`; identity: `0x${string}` }>;

/** Approximate naira value of 1 G$, shown next to every amount. Override with NGN_PER_GD. */
export const DEFAULT_NGN_PER_GD = 0.15;
