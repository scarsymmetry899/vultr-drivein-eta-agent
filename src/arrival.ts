/** Close-arrival checks. Coordinates are used to decide and then dropped. Nothing here stores a fix. */

const CLOSE_M = 400;
const OUTLIER_M = 8_000;
const MAX_ACCURACY_M = 100;
const STALE_MS = 90_000;
const FUTURE_MS = 30_000;

export type ArrivalSource = "sim-close" | "sim-far" | "device";

export interface ArrivalAssessment {
  credible: boolean;
  code:
    | "sim-close"
    | "sim-far"
    | "device-close"
    | "not-close"
    | "stale"
    | "inaccurate"
    | "outlier"
    | "bad-fix";
  note: string;
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earth = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const aLat = (lat1 * Math.PI) / 180;
  const bLat = (lat2 * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat) * Math.cos(bLat) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
}

function fresh(recordedAt: string, now: Date): "ok" | "stale" | "bad-fix" {
  const when = new Date(recordedAt);
  if (Number.isNaN(when.getTime())) return "bad-fix";
  const delta = now.getTime() - when.getTime();
  if (delta > STALE_MS || delta < -FUTURE_MS) return "stale";
  return "ok";
}

export function assessApproach(input: {
  source: ArrivalSource;
  recordedAt: string;
  now?: Date;
  accuracyM?: number | null;
  lat?: number | null;
  lng?: number | null;
  lotLat: number;
  lotLng: number;
}): ArrivalAssessment {
  const now = input.now ?? new Date();
  const age = fresh(input.recordedAt, now);
  if (age === "bad-fix") {
    return { credible: false, code: "bad-fix", note: "The arrival report had no usable time. The scheduled fire was left in place." };
  }
  if (age === "stale") {
    return { credible: false, code: "stale", note: "The arrival report was stale. The scheduled fire was left in place." };
  }
  if (input.source === "sim-close") {
    return {
      credible: true,
      code: "sim-close",
      note: "Simulated close arrival. This is a labeled demo, not a device GPS reading, and it is not a verified live fix.",
    };
  }
  if (input.source === "sim-far") {
    return {
      credible: false,
      code: "sim-far",
      note: "Simulated far arrival. The scheduled fire was left in place. This is not a device GPS reading.",
    };
  }
  const accuracy = input.accuracyM;
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > MAX_ACCURACY_M) {
    return {
      credible: false,
      code: "inaccurate",
      note: "The browser reading was too coarse to treat as a close arrival. The scheduled fire was left in place.",
    };
  }
  const lat = input.lat;
  const lng = input.lng;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { credible: false, code: "bad-fix", note: "The browser reading had no position. The scheduled fire was left in place." };
  }
  const distance = distanceMeters(lat, lng, input.lotLat, input.lotLng);
  if (distance > OUTLIER_M) {
    return {
      credible: false,
      code: "outlier",
      note: "The browser reading was too far from the lot to use. The scheduled fire was left in place. The position was not stored.",
    };
  }
  if (distance > CLOSE_M) {
    return {
      credible: false,
      code: "not-close",
      note: "The browser reading is not close enough to start the grill. The scheduled fire was left in place. The position was not stored.",
    };
  }
  return {
    credible: true,
    code: "device-close",
    note: "Browser-reported close arrival. This is not a verified live GPS fix. The position was not stored.",
  };
}
