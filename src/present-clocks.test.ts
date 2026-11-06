import assert from "node:assert/strict";
import { test } from "node:test";
import { presentIsoClocks, serviceFootnote } from "../public/js/clocks.js";
import { serviceCue, shareFlight, withAction } from "./service-log.ts";

const LIVE_SENTENCE =
  "Order R66-17299 for plate TST-0001 is scheduled to fire at 2026-11-06T18:19:00.000Z and be ready by 2026-11-06T18:27:00.000Z, with 8 minutes of prep time due to the slowest station.";

test("model wording shows Austin time and leaves a solver timestamp alone", () => {
  const shown = presentIsoClocks(LIVE_SENTENCE);
  assert.match(shown, /12:19 PM CST/);
  assert.match(shown, /12:27 PM CST/);
  assert.equal(shown.includes("2026-11-06T18:19:00.000Z"), false);
  assert.equal(shown.includes("2026-11-06T18:27:00.000Z"), false);
  const solver = { fire_at: "2026-11-06T18:19:00.000Z", ready_by: "2026-11-06T18:27:00.000Z" };
  assert.equal(solver.fire_at, "2026-11-06T18:19:00.000Z");
  assert.equal(solver.ready_by, "2026-11-06T18:27:00.000Z");
});

test("an offset timestamp is the same Austin clock", () => {
  assert.equal(presentIsoClocks("Fire at 2026-11-06T12:19:00-06:00."), "Fire at 12:19 PM CST.");
});

test("a verified live reply is named, and a restart is not implied to keep it", () => {
  const verified = serviceFootnote({
    live_call_verified: true,
    live_call_model: "deepseek-v4.1-flash-1017",
    inference_mode: "live",
  });
  assert.match(verified, /deepseek-v4\.1-flash-1017/);
  assert.match(verified, /clears on restart/);
  assert.equal(verified.includes("not a live model"), false);
  const selected = serviceFootnote({ live_call_verified: false, inference_mode: "live" });
  assert.match(selected, /has not accepted a model reply/);
  assert.equal(selected.includes("not a live model"), false);
  const demo = serviceFootnote({ live_call_verified: false, inference_mode: "demo" });
  assert.match(demo, /deterministic until a live reply is accepted/);
  assert.equal(demo.includes("not a live model"), false);
});

test("overdue and late tickets stay with a person", () => {
  const overdue = serviceCue({
    status: "cooking",
    kitchen_start_at: "2026-11-06T18:00:00.000Z",
    ready_by: "2026-11-06T18:08:00.000Z",
    eta_timestamp: "2026-11-06T18:20:00.000Z",
    now: new Date("2026-11-06T18:15:00.000Z"),
  });
  assert.equal(overdue.owner, "kitchen");
  assert.match(overdue.exception ?? "", /will not mark it ready by itself/);
  const late = serviceCue({
    status: "ready",
    kitchen_start_at: "2026-11-06T17:00:00.000Z",
    ready_by: "2026-11-06T17:08:00.000Z",
    eta_timestamp: "2026-11-06T17:10:00.000Z",
    now: new Date("2026-11-06T17:30:00.000Z"),
  });
  assert.match(late.exception ?? "", /stays open until someone marks it picked up/);
  const waiting = serviceCue({
    status: "confirmed",
    kitchen_start_at: null,
    ready_by: null,
    eta_timestamp: "2026-11-06T20:00:00.000Z",
    now: new Date("2026-11-06T18:00:00.000Z"),
  });
  assert.equal(waiting.owner, "guest");
  assert.equal(waiting.exception, null);
});

test("a second schedule waits for the one already running", async () => {
  let started = 0;
  const first = shareFlight("order-1", async () => {
    started += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return "timed";
  });
  const second = shareFlight("order-1", async () => {
    started += 1;
    return "again";
  });
  assert.equal(await first, "timed");
  assert.equal(await second, "timed");
  assert.equal(started, 1);
});

test("the same action is not recorded twice", () => {
  const once = withAction({ actions: [] }, {
    at: "2026-11-06T18:00:00.000Z",
    actor: "kitchen",
    step: "ready",
    result: "done",
    note: "Marked the bag ready.",
  });
  const twice = withAction(once, {
    at: "2026-11-06T18:01:00.000Z",
    actor: "kitchen",
    step: "ready",
    result: "done",
    note: "Marked the bag ready.",
  });
  assert.equal(twice.actions?.length, 1);
});
