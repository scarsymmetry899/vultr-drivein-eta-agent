import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { alwaysOpenHours, describeArrivalHours, solveFireTime, SAMPLE_INPUT } from "../sandbox/fire-time-solver/solver.ts";
import { applyApproach } from "./store.ts";
import { closeDatabase } from "./db.ts";
import { loadConfig } from "./config.ts";
import { parseOrderBody } from "./validate.ts";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "r66-24h-")), "orders.sqlite");
process.env.DRIVEIN_TIMEZONE = "America/Chicago";
process.env.DRIVEIN_OPEN = "00:00";
process.env.DRIVEIN_CLOSE = "24:00";
process.env.KITCHEN_CAPACITY = "3";
process.env.SANDBOX_RUNNER = "inprocess";
process.env.INFERENCE_MODE = "demo";

const day = { ...SAMPLE_INPUT, open: "00:00", close: "24:00" };

test("00:00 and 24:00 are the whole day, and 00:00 to 00:00 is not", () => {
  assert.equal(alwaysOpenHours("00:00", "24:00"), true);
  assert.equal(alwaysOpenHours("00:00", "00:00"), false);
  const same = solveFireTime({ ...day, open: "00:00", close: "00:00" });
  assert.equal(same.decision, "refuse");
  assert.match(same.reason, /24:00/);
});

test("midnight, the next morning, and both fall-back hours are open", () => {
  const midnight = describeArrivalHours(new Date("2026-11-07T00:00:00-06:00"), "00:00", "24:00", "America/Chicago");
  assert.equal(midnight.ok, true);
  if (midnight.ok) assert.match(midnight.label, /12:00 AM CST/);
  const morning = describeArrivalHours(new Date("2026-11-07T03:10:00-06:00"), "00:00", "24:00", "America/Chicago");
  assert.equal(morning.ok, true);
  const first = describeArrivalHours(new Date("2026-11-01T01:30:00-05:00"), "00:00", "24:00", "America/Chicago");
  const second = describeArrivalHours(new Date("2026-11-01T01:30:00-06:00"), "00:00", "24:00", "America/Chicago");
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) {
    assert.match(first.label, /CDT/);
    assert.match(second.label, /CST/);
  }
});

test("the spring-forward gap is a real later instant and stays open", () => {
  const afterJump = describeArrivalHours(new Date("2026-03-08T03:30:00-05:00"), "00:00", "24:00", "America/Chicago");
  assert.equal(afterJump.ok, true);
  if (afterJump.ok) assert.match(afterJump.label, /3:30 AM CDT/);
});

test("a 12:30 AM arrival keeps the prep lead and can start before midnight", () => {
  const result = solveFireTime({
    ...day,
    now: "2026-11-06T23:00:00-06:00",
    eta: "2026-11-07T00:05:00-06:00",
    items: [{ sku: "classic-burger", name: "Classic Burger", qty: 1, prep_minutes: 8, station: "grill" }],
    buffer_minutes: 3,
  });
  assert.equal(result.decision, "fire");
  assert.equal(result.prep_minutes, 8);
  assert.equal(result.fire_at, new Date("2026-11-06T23:54:00-06:00").toISOString());
  assert.equal(result.ready_by, new Date("2026-11-07T00:02:00-06:00").toISOString());
  assert.equal(result.warnings.some((line) => line.includes("before open")), false);
});

test("an overnight order is accepted and a past arrival is not", () => {
  const config = loadConfig();
  assert.equal(config.open, "00:00");
  assert.equal(config.close, "24:00");
  const parsed = parseOrderBody(
    {
      customer_name: "Mina Cole",
      car_plate: "TX-2400",
      car_color: "blue",
      eta: "2026-11-07T00:10:00-06:00",
      items: [{ sku: "classic-burger", qty: 1 }],
    },
    config,
    new Date("2026-11-06T23:40:00-06:00"),
  );
  assert.equal("error" in parsed, false);
  const past = parseOrderBody(
    {
      customer_name: "Mina Cole",
      car_plate: "TX-2401",
      car_color: "blue",
      eta: "2026-11-06T22:00:00-06:00",
      items: [{ sku: "classic-burger", qty: 1 }],
    },
    config,
    new Date("2026-11-06T23:40:00-06:00"),
  );
  assert.equal("error" in past, true);
});

test("a close arrival at 3:30 AM is not refused for hours", async () => {
  const config = loadConfig();
  const { createOrder } = await import("./store.ts");
  const made = createOrder({
    customer_name: "Mina Cole",
    car_plate: "TX-2430",
    car_model: "",
    car_color: "blue",
    items: [
      {
        sku: "classic-burger",
        name: "Classic Burger",
        qty: 1,
        price_cents: 899,
        prep_minutes: 8,
        station: "grill",
        allergens: [],
      },
    ],
    special_notes: "",
    eta_timestamp: "2026-11-07T04:00:00-06:00",
    eta_time: "Sat, Nov 7, 4:00 AM CST",
    subtotal_cents: 899,
    sales_tax_cents: 74,
    order_type: "preorder",
    arrival_opt_in: true,
    payment_state: "pay_at_window",
  });
  const approach = applyApproach(
    made.id,
    { credible: true, code: "sim-close", note: "Simulated close arrival." },
    config,
    new Date("2026-11-07T03:30:00-06:00"),
  );
  assert.equal(approach.code, "sim-close");
  assert.equal(approach.applied, true);
  assert.equal(approach.order?.status, "cooking");
  assert.equal(approach.order?.guest_here, false);
  assert.equal(approach.refired, false);
  closeDatabase();
});
