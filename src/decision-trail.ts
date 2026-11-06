import type { Explanation } from "../agent/inference.ts";
import type { SolveResult } from "../sandbox/fire-time-solver/types.ts";

/** Numbers come from the solver. Wording is separate and may be demo text or a checked model sentence. */
export interface DecisionTrail {
  solver: {
    arrival: string;
    prep_minutes: number | null;
    buffer_minutes: number | null;
    fire_at: string | null;
    ready_by: string | null;
    decision: string;
    changes: string[];
  };
  explanation: {
    mode: string;
    source: "deterministic" | "vultr";
    live: boolean;
    text: string;
    warning: string | null;
  };
}

export function trailFromSchedule(input: {
  arrival: string;
  decision: SolveResult;
  explanation: Explanation;
}): DecisionTrail {
  const changes = [...input.decision.warnings];
  if (changes.length === 0 && input.decision.decision === "fire") {
    changes.push("Fire and ready follow the arrival, minus prep and the hold buffer. Nothing else moved the clock.");
  }
  if (input.decision.decision === "delay" && !changes.some((line) => line.includes("later than"))) {
    changes.push("Ready time is later than the arrival.");
  }
  return {
    solver: {
      arrival: input.arrival,
      prep_minutes: input.decision.prep_minutes,
      buffer_minutes: input.decision.buffer_minutes,
      fire_at: input.decision.fire_at,
      ready_by: input.decision.ready_by,
      decision: input.decision.decision,
      changes,
    },
    explanation: {
      mode: input.explanation.mode,
      source: input.explanation.source,
      live: input.explanation.live,
      text: input.explanation.text,
      warning: input.explanation.warning,
    },
  };
}

export function trailForEarlyArrival(input: {
  arrival: string;
  previousFire: string | null;
  previousReady: string | null;
  prepMinutes: number;
  fireAt: string;
  readyBy: string;
}): DecisionTrail {
  const changes = [
    "You arrived before the grill was scheduled to start. Cooking started at check-in.",
  ];
  if (input.previousFire) {
    changes.push("The earlier fire time was replaced. It is not the clock on this ticket anymore.");
  }
  return {
    solver: {
      arrival: input.arrival,
      prep_minutes: input.prepMinutes,
      buffer_minutes: null,
      fire_at: input.fireAt,
      ready_by: input.readyBy,
      decision: "fire",
      changes,
    },
    explanation: {
      mode: "demo",
      source: "deterministic",
      live: false,
      text: "This sentence is from the check-in rule, not from a model.",
      warning: null,
    },
  };
}

export function parseTrail(raw: string | null | undefined): DecisionTrail | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as DecisionTrail;
    if (!value?.solver || !Array.isArray(value.solver.changes)) return null;
    return value;
  } catch {
    return null;
  }
}
