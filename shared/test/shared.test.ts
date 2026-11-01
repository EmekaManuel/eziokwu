import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { APP_NAME, canonicalSubmission, formatAmount, hashSubmission, linkMessage, type SubmissionPayload } from "../src";

const base: SubmissionPayload = {
  v: 1,
  bountyId: "7",
  worker: "0xAbCdEf0000000000000000000000000000000001",
  answer: { price: 1200, item: "rice", note: "" },
  capturedAt: 1_700_000_000,
};

describe("link message", () => {
  it("uses the app-name constant and the agreed format", () => {
    expect(linkMessage(123, "abc")).toBe(`${APP_NAME} link:123:abc`);
    expect(linkMessage(123, "abc")).toBe("Eziokwu link:123:abc");
  });
});

describe("submission hashing", () => {
  it("is independent of answer key order and worker address case", () => {
    const reordered = { ...base, worker: base.worker.toLowerCase() as `0x${string}`, answer: { note: "", item: "rice", price: 1200 } };
    expect(canonicalSubmission(reordered)).toBe(canonicalSubmission(base));
    expect(hashSubmission(reordered)).toBe(hashSubmission(base));
  });
  it("changes when any field changes", () => {
    const h = hashSubmission(base);
    expect(hashSubmission({ ...base, answer: { ...base.answer, price: 1201 } })).not.toBe(h);
    expect(hashSubmission({ ...base, bountyId: "8" })).not.toBe(h);
  });
});

describe("amount formatting", () => {
  it("shows G$ with an approximate naira value", () => {
    expect(formatAmount(parseEther("1000"), 0.15)).toBe("1,000 G$ (≈ ₦150)");
    expect(formatAmount(parseEther("10"), 0.15)).toBe("10 G$ (≈ ₦1.5)");
  });
  it("respects a configured rate", () => {
    expect(formatAmount(parseEther("100"), 2)).toBe("100 G$ (≈ ₦200)");
  });
});
