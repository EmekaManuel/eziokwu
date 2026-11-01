import { keccak256, stringToBytes, type Hex } from "viem";

/** What a task asks for. `hashTask(spec)` is stored on-chain as the bounty's specHash. */
export interface TaskSpec {
  kind: "price";
  title: string;
  description: string;
  item: string | null;
  unit: string | null;
  currency: string;
  marketName: string | null;
  city: string | null;
  lat: number;
  lng: number;
  /** How close (metres) the worker must be to submit. */
  radiusM: number;
}

/** Canonical JSON with a fixed key order, so the same spec always hashes the same. */
export function canonicalTask(t: TaskSpec): string {
  return JSON.stringify({
    v: 1,
    kind: t.kind,
    title: t.title,
    description: t.description,
    item: t.item,
    unit: t.unit,
    currency: t.currency,
    marketName: t.marketName,
    city: t.city,
    lat: t.lat,
    lng: t.lng,
    radiusM: t.radiusM,
  });
}

export function hashTask(t: TaskSpec): Hex {
  return keccak256(stringToBytes(canonicalTask(t)));
}

/** Great-circle distance in metres (haversine). Accurate to well under 1% at city scale. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "450 m" or "2.3 km". */
export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}
