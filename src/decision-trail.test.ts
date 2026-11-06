import assert from "node:assert/strict";
import { test } from "node:test";
import { SAMPLE_INPUT, solveFireTime } from "../sandbox/fire-time-solver/solver.ts";
import { trailForEarlyArrival, trailFromSchedule } from "./decision-trail.ts";

test("a schedule trail keeps solver times separate from wording", () => {
  const decision = solveFireTime(SAMPLE_INPUT);
  const trail = trailFromSchedule({
    arrival: "Thu, Nov 5, 6:10 PM CST",
    decision,
    explanation: {
      mode: "demo",
      live: false,
      source: "deterministic",
      model: null,
      text: "Solver sentence.",
      warning: null,
    },
  });
  assert.equal(trail.solver.fire_at, decision.fire_at);
  assert.equal(trail.solver.ready_by, decision.ready_by);
  assert.equal(trail.explanation.source, "deterministic");
  assert.equal(trail.explanation.live, false);
  assert.ok(trail.solver.changes.length > 0);
});

test("an early check-in records that the planned fire was replaced", () => {
  const trail = trailForEarlyArrival({
    arrival: "Thu, Nov 5, 6:10 PM CST",
    previousFire: "2026-11-05T23:59:00.000Z",
    previousReady: "2026-11-06T00:07:00.000Z",
    prepMinutes: 8,
    fireAt: "2026-11-05T23:40:00.000Z",
    readyBy: "2026-11-05T23:48:00.000Z",
  });
  assert.match(trail.solver.changes.join(" "), /arrived before the grill/i);
  assert.match(trail.solver.changes.join(" "), /earlier fire time was replaced/i);
  assert.equal(trail.solver.fire_at, "2026-11-05T23:40:00.000Z");
  assert.equal(trail.explanation.source, "deterministic");
  assert.equal(trail.explanation.live, false);
});
