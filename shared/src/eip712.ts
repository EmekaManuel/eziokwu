import type { Address, Hex } from "viem";
import { EIP712_DOMAIN_NAME, EIP712_DOMAIN_VERSION } from "./config";

export function bountyBoardDomain(chainId: number, verifyingContract: Address) {
  return { name: EIP712_DOMAIN_NAME, version: EIP712_DOMAIN_VERSION, chainId, verifyingContract } as const;
}

/** Must match CLAIM_TYPEHASH / SUBMIT_TYPEHASH in BountyBoard.sol field for field. */
export const claimTypes = {
  Claim: [
    { name: "bountyId", type: "uint256" },
    { name: "worker", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const submitTypes = {
  Submit: [
    { name: "bountyId", type: "uint256" },
    { name: "worker", type: "address" },
    { name: "submissionHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function claimTypedData(a: {
  chainId: number;
  board: Address;
  bountyId: bigint;
  worker: Address;
  nonce: bigint;
  deadline: bigint;
}) {
  return {
    domain: bountyBoardDomain(a.chainId, a.board),
    types: claimTypes,
    primaryType: "Claim" as const,
    message: { bountyId: a.bountyId, worker: a.worker, nonce: a.nonce, deadline: a.deadline },
  };
}

export function submitTypedData(a: {
  chainId: number;
  board: Address;
  bountyId: bigint;
  worker: Address;
  submissionHash: Hex;
  nonce: bigint;
  deadline: bigint;
}) {
  return {
    domain: bountyBoardDomain(a.chainId, a.board),
    types: submitTypes,
    primaryType: "Submit" as const,
    message: {
      bountyId: a.bountyId,
      worker: a.worker,
      submissionHash: a.submissionHash,
      nonce: a.nonce,
      deadline: a.deadline,
    },
  };
}
