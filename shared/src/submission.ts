import { keccak256, stringToBytes, type Address, type Hex } from "viem";

/** Off-chain answer. The on-chain submissionHash is keccak256 of the canonical bytes below. */
export interface SubmissionPayload {
  v: 1;
  bountyId: string;
  worker: Address;
  /** Free-form answer, e.g. { price: "1200", currency: "NGN", note: "..." } */
  answer: Record<string, string | number | boolean | null>;
  /** Unix seconds when the worker produced it. */
  capturedAt: number;
}

/** Canonical JSON: fixed key order at the top level, answer keys sorted. */
export function canonicalSubmission(p: SubmissionPayload): string {
  const sortedAnswer = Object.fromEntries(Object.entries(p.answer).sort(([a], [b]) => (a < b ? -1 : 1)));
  return JSON.stringify({
    v: p.v,
    bountyId: p.bountyId,
    worker: p.worker.toLowerCase(),
    answer: sortedAnswer,
    capturedAt: p.capturedAt,
  });
}

export function hashBytes(bytes: Uint8Array): Hex {
  return keccak256(bytes);
}

export function hashSubmission(p: SubmissionPayload): Hex {
  return keccak256(stringToBytes(canonicalSubmission(p)));
}
