import assert from "node:assert/strict";
import { test } from "node:test";
import { HOSTILE_DEMO_INPUT, SAMPLE_INPUT, solveFireTime, ticketPrepMinutes } from "./solver.ts";

function at(local: string): string {
  return new Date(local).toISOString();
}

test("sample ticket fires three minutes before the ETA", () => {
  const result = solveFireTime(SAMPLE_INPUT);
  assert.equal(result.decision, "fire");
  assert.equal(result.prep_minutes, 8);
  assert.equal(result.queue_delay_minutes, 0);
  assert.equal(result.fire_at, at("2026-11-05T17:59:00-06:00"));
  assert.equal(result.ready_by, at("2026-11-05T18:07:00-06:00"));
  assert.equal(result.containment, "scheduled");
  assert.equal(result.host_effects, "none");
  assert.equal(result.executed_payload, false);
  assert.equal(result.contained, false);
});

test("parallel stations use the slowest station, extras add a minute", () => {
  const items = [
    { sku: "classic-burger", name: "Classic Burger", qty: 1, prep_minutes: 8, station: "grill" },
    { sku: "chili-dog", name: "Chili Dog", qty: 1, prep_minutes: 6, station: "grill" },
    { sku: "fries", name: "Shoestring Fries", qty: 1, prep_minutes: 4, station: "fryer" },
  ];
  assert.equal(ticketPrepMinutes(items), 9);
  const result = solveFireTime({ ...SAMPLE_INPUT, items });
  assert.equal(result.prep_minutes, 9);
  assert.equal(result.fire_at, at("2026-11-05T17:58:00-06:00"));
});

test("three burgers on the grill add two minutes", () => {
  const result = solveFireTime({
    ...SAMPLE_INPUT,
    items: [
      { sku: "classic-burger", name: "Classic Burger", qty: 3, prep_minutes: 8, station: "grill" },
    ],
  });
  assert.equal(result.prep_minutes, 10);
  assert.equal(result.fire_at, at("2026-11-05T17:57:00-06:00"));
  assert.equal(result.ready_by, at("2026-11-05T18:07:00-06:00"));
});

test("hostile note is refused and not executed", () => {
  const result = solveFireTime(HOSTILE_DEMO_INPUT);
  assert.equal(result.decision, "refuse");
  assert.equal(result.containment, "hostile-refused");
  assert.equal(result.contained, true);
  assert.equal(result.executed_payload, false);
  assert.equal(result.host_effects, "none");
  assert.equal(result.rule, "shell-rm");
  assert.equal(result.fire_at, null);
  assert.match(result.reason, /not executed/);
});

test("explicit drill flag refuses a clean note", () => {
  const result = solveFireTime({ ...SAMPLE_INPUT, hostile: true, raw_note: "See you soon." });
  assert.equal(result.rule, "containment-drill");
  assert.equal(result.contained, true);
  assert.equal(result.fire_at, null);
});

test("a normal note is not treated as hostile", () => {
  const result = solveFireTime({ ...SAMPLE_INPUT, raw_note: "No onion; extra pickles." });
  assert.equal(result.decision, "fire");
  assert.equal(result.rule, null);
});

test("arrival before open is refused", () => {
  const result = solveFireTime({
    ...SAMPLE_INPUT,
    now: "2026-11-05T09:00:00-06:00",
    eta: "2026-11-05T10:30:00-06:00",
  });
  assert.equal(result.decision, "refuse");
  assert.equal(result.containment, "rejected");
  assert.match(result.reason, /outside open hours/);
  assert.equal(result.fire_at, null);
});

test("a fire that would land before open waits until the grill opens", () => {
  const result = solveFireTime({
    ...SAMPLE_INPUT,
    now: "2026-11-05T10:00:00-06:00",
    eta: "2026-11-05T11:05:00-06:00",
  });
  assert.equal(result.decision, "delay");
  assert.equal(result.fire_at, at("2026-11-05T11:00:00-06:00"));
  assert.equal(result.ready_by, at("2026-11-05T11:08:00-06:00"));
  assert.ok(result.warnings.some((warning) => warning.includes("before open")));
});

test("one overlapping ticket slips the fire time", () => {
  const result = solveFireTime({
    ...SAMPLE_INPUT,
    capacity_n: 1,
    active_fires: [
      { fire_at: "2026-11-05T17:59:00-06:00", ready_by: "2026-11-05T18:07:00-06:00" },
    ],
  });
  assert.equal(result.decision, "delay");
  assert.equal(result.queue_delay_minutes, 10);
  assert.equal(result.fire_at, at("2026-11-05T18:09:00-06:00"));
  assert.equal(result.ready_by, at("2026-11-05T18:17:00-06:00"));
});

test("arrival after close is refused", () => {
  const result = solveFireTime({
    ...SAMPLE_INPUT,
    now: "2026-11-05T21:00:00-06:00",
    eta: "2026-11-05T22:30:00-06:00",
  });
  assert.equal(result.containment, "rejected");
  assert.match(result.reason, /outside open hours/);
});

test("firing immediately would finish after close", () => {
  const result = solveFireTime({
    ...SAMPLE_INPUT,
    now: "2026-11-05T18:05:00-06:00",
    close: "18:10",
  });
  assert.equal(result.decision, "refuse");
  assert.equal(result.containment, "rejected");
  assert.match(result.reason, /Ready time/);
});

test("a late click fires immediately", () => {
  const result = solveFireTime({
    ...SAMPLE_INPUT,
    now: "2026-11-05T18:05:00-06:00",
  });
  assert.equal(result.decision, "delay");
  assert.equal(result.fire_at, at("2026-11-05T18:05:00-06:00"));
  assert.equal(result.ready_by, at("2026-11-05T18:13:00-06:00"));
});

test("tomorrow's ETA uses tomorrow's open hours", () => {
  const result = solveFireTime({
    ...SAMPLE_INPUT,
    now: "2026-11-05T22:30:00-06:00",
    eta: "2026-11-06T11:20:00-06:00",
  });
  assert.equal(result.decision, "fire");
  assert.equal(result.fire_at, at("2026-11-06T11:09:00-06:00"));
  assert.equal(result.ready_by, at("2026-11-06T11:17:00-06:00"));
});
