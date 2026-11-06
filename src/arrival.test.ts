import assert from "node:assert/strict";
import { test } from "node:test";
import { assessApproach, distanceMeters } from "./arrival.ts";
import { parsePaymentChoice, paymentLabel, staffDemoMark } from "./payment.ts";

const lot = { lotLat: 30.25, lotLng: -97.749 };
const now = new Date("2026-11-06T19:00:00.000Z");

test("a labeled close simulation is credible and a far one is not", () => {
  const close = assessApproach({ source: "sim-close", recordedAt: now.toISOString(), now, ...lot });
  assert.equal(close.credible, true);
  assert.match(close.note, /not a device GPS/);
  const far = assessApproach({ source: "sim-far", recordedAt: now.toISOString(), now, ...lot });
  assert.equal(far.credible, false);
  assert.equal(far.code, "sim-far");
});

test("a stale, coarse, or distant browser reading does not count as close", () => {
  const stale = assessApproach({
    source: "device",
    recordedAt: new Date(now.getTime() - 10 * 60_000).toISOString(),
    now,
    accuracyM: 20,
    lat: 30.2501,
    lng: -97.749,
    ...lot,
  });
  assert.equal(stale.code, "stale");
  const coarse = assessApproach({
    source: "device",
    recordedAt: now.toISOString(),
    now,
    accuracyM: 800,
    lat: 30.2501,
    lng: -97.749,
    ...lot,
  });
  assert.equal(coarse.code, "inaccurate");
  const outlier = assessApproach({
    source: "device",
    recordedAt: now.toISOString(),
    now,
    accuracyM: 15,
    lat: 37.7,
    lng: -122.4,
    ...lot,
  });
  assert.equal(outlier.code, "outlier");
  assert.match(outlier.note, /not stored/);
  const near = distanceMeters(30.2502, -97.749, lot.lotLat, lot.lotLng);
  assert.ok(near < 400);
  const close = assessApproach({
    source: "device",
    recordedAt: now.toISOString(),
    now,
    accuracyM: 15,
    lat: 30.2502,
    lng: -97.749,
    ...lot,
  });
  assert.equal(close.credible, true);
  assert.match(close.note, /not a verified live GPS/);
});

test("payment choices cannot pretend a card was charged", () => {
  assert.equal(parsePaymentChoice(undefined), "pay_at_window");
  assert.equal(parsePaymentChoice("demo_unpaid"), "demo_unpaid");
  assert.equal(typeof parsePaymentChoice("paid"), "object");
  assert.equal(typeof parsePaymentChoice("demo_marked"), "object");
  assert.equal(staffDemoMark("pay_at_window") instanceof Object, true);
  assert.equal(staffDemoMark("demo_unpaid"), "demo_marked");
  assert.match(paymentLabel("demo_marked"), /not a payment/);
});
