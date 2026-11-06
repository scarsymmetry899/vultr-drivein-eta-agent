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
    /** Set when an early check-in replaced a planned fire time. */
    previous_fire_at?: string | null;
    previous_ready_by?: string | null;
    arrived_at?: string | null;
  };
  explanation: {
    mode: string;
    source: "deterministic" | "vultr";
    live: boolean;
    model?: string | null;
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
      model: input.explanation.live ? input.explanation.model : null,
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
  timeZone?: string;
}): DecisionTrail {
  const at = (iso: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: input.timeZone ?? "America/Chicago",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  const changes: string[] = [];
  if (input.previousFire) {
    changes.push(
      `You arrived before the grill was scheduled to start. You checked in at ${at(input.fireAt)}, ahead of the planned fire at ${at(input.previousFire)}. Cooking started at check-in.`,
    );
    changes.push(
      `The earlier fire time was replaced: fire ${at(input.previousFire)} → ${at(input.fireAt)}` +
        (input.previousReady ? `, ready ${at(input.previousReady)} → ${at(input.readyBy)}.` : `, ready ${at(input.readyBy)}.`),
    );
  } else {
    changes.push(
      `You arrived before the grill was scheduled to start. You checked in at ${at(input.fireAt)} before the grill was timed. Cooking started at check-in.`,
    );
  }
  changes.push(`Prep is ${input.prepMinutes} min, so the bag is due at ${at(input.readyBy)}.`);
  return {
    solver: {
      arrival: input.arrival,
      prep_minutes: input.prepMinutes,
      buffer_minutes: null,
      fire_at: input.fireAt,
      ready_by: input.readyBy,
      decision: "fire",
      changes,
      previous_fire_at: input.previousFire,
      previous_ready_by: input.previousReady,
      arrived_at: input.fireAt,
    },
    explanation: {
      mode: "demo",
      source: "deterministic",
      live: false,
      model: null,
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
