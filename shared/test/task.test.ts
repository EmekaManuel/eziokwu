import { describe, expect, it } from "vitest";
import { canonicalTask, distanceMeters, formatDistance, hashTask, type TaskSpec } from "../src";

const spec: TaskSpec = {
  kind: "price",
  title: "Rice price",
  description: "Price of a 50 kg bag of rice at your nearest market.",
  item: "Rice, 50 kg bag",
  unit: "bag",
  currency: "NGN",
  marketName: "Mile 12",
  city: "Lagos",
  lat: 6.6018,
  lng: 3.3515,
  radiusM: 5000,
};

describe("task spec hash", () => {
  it("is stable and changes if any field changes", () => {
    expect(hashTask(spec)).toBe(hashTask({ ...spec }));
    for (const change of [{ title: "Rice" }, { description: "x" }, { lat: 6.6019 }, { radiusM: 100 }, { item: null }] as Partial<TaskSpec>[])
      expect(hashTask({ ...spec, ...change })).not.toBe(hashTask(spec));
  });
  it("does not depend on object key order", () => {
    const shuffled = Object.fromEntries(Object.entries(spec).reverse()) as unknown as TaskSpec;
    expect(canonicalTask(shuffled)).toBe(canonicalTask(spec));
  });
});

describe("distance", () => {
  it("is ~0 for the same point and close to the known Lagos-Ibadan distance", () => {
    expect(distanceMeters(spec, spec)).toBeCloseTo(0, 3);
    const lagos = { lat: 6.5244, lng: 3.3792 };
    const ibadan = { lat: 7.3775, lng: 3.947 };
    const km = distanceMeters(lagos, ibadan) / 1000;
    expect(km).toBeGreaterThan(105);
    expect(km).toBeLessThan(115);
  });
  it("formats short and long distances", () => {
    expect(formatDistance(450)).toBe("450 m");
    expect(formatDistance(2340)).toBe("2.3 km");
    expect(formatDistance(48_000)).toBe("48 km");
  });
});
