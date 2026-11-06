import assert from "node:assert/strict";
import { test } from "node:test";
import { describeArrivalHours, solveFireTime, SAMPLE_INPUT } from "../sandbox/fire-time-solver/solver.ts";
import { parseOrderBody } from "./validate.ts";
import { loadConfig } from "./config.ts";

process.env.DATABASE_PATH = ":memory:";
process.env.DRIVEIN_TIMEZONE = "America/Chicago";
process.env.DRIVEIN_OPEN = "11:00";
process.env.DRIVEIN_CLOSE = "22:00";

const config = loadConfig();

function orderAt(eta: string, now: string) {
  return parseOrderBody(
    {
      customer_name: "Mina Cole",
      car_plate: "TX-4400",
      car_color: "blue",
      eta,
      items: [{ sku: "classic-burger", qty: 1 }],
    },
    config,
    new Date(now),
  );
}

test("10:55 PM Austin is after close, including when the instant was entered as 10:25 AM India time", () => {
  const eta = "2026-11-06T10:25:00+05:30";
  const austin = describeArrivalHours(new Date(eta), "11:00", "22:00", "America/Chicago");
  assert.equal(austin.ok, false);
  if (!austin.ok) assert.match(austin.reason, /10:55 PM CST/);
  const parsed = orderAt(eta, "2026-11-05T20:00:00-06:00");
  assert.ok("error" in parsed);
  if ("error" in parsed) assert.match(parsed.error, /outside open hours/);
});

test("a 9:30 PM Austin preorder is accepted while the same evening is still open", () => {
  const parsed = orderAt("2026-11-05T21:30:00-06:00", "2026-11-05T18:00:00-06:00");
  assert.ok(!("error" in parsed));
  if (!("error" in parsed)) {
    assert.equal(parsed.order_type, "preorder");
    assert.match(parsed.eta_time, /9:30 PM CST/);
  }
});

test("ordering after close for the next open afternoon is still a preorder", () => {
  const parsed = orderAt("2026-11-06T16:00:00-06:00", "2026-11-05T22:30:00-06:00");
  assert.ok(!("error" in parsed));
  if (!("error" in parsed)) assert.equal(parsed.order_type, "preorder");
});

test("summer close uses central daylight time", () => {
  const late = describeArrivalHours(new Date("2026-07-15T22:55:00-05:00"), "11:00", "22:00", "America/Chicago");
  assert.equal(late.ok, false);
  if (!late.ok) assert.match(late.reason, /10:55 PM CDT/);
  const open = describeArrivalHours(new Date("2026-07-15T18:00:00-05:00"), "11:00", "22:00", "America/Chicago");
  assert.equal(open.ok, true);
});

test("the March spring-forward afternoon is open and 10:55 PM CDT is not", () => {
  const during = describeArrivalHours(new Date("2026-03-08T18:00:00-05:00"), "11:00", "22:00", "America/Chicago");
  assert.equal(during.ok, true);
  const late = describeArrivalHours(new Date("2026-03-08T22:55:00-05:00"), "11:00", "22:00", "America/Chicago");
  assert.equal(late.ok, false);
});

test("the November fall-back afternoon is standard time", () => {
  const during = describeArrivalHours(new Date("2026-11-01T18:00:00-06:00"), "11:00", "22:00", "America/Chicago");
  assert.equal(during.ok, true);
  if (during.ok) assert.match(during.label, /CST/);
  const early = describeArrivalHours(new Date("2026-11-01T10:30:00-06:00"), "11:00", "22:00", "America/Chicago");
  assert.equal(early.ok, false);
});

test("a bare datetime without an offset is rejected", () => {
  const parsed = orderAt("2026-11-05T22:55", "2026-11-05T18:00:00-06:00");
  assert.ok("error" in parsed);
  if ("error" in parsed) assert.match(parsed.error, /timezone offset/);
});

test("the solver also refuses a 10:55 PM Austin arrival", () => {
  const result = solveFireTime({
    ...SAMPLE_INPUT,
    now: "2026-11-05T20:00:00-06:00",
    eta: "2026-11-05T22:55:00-06:00",
  });
  assert.equal(result.decision, "refuse");
  assert.match(result.reason, /outside open hours/);
});
