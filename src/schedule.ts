import { explainDecision, parseUtterance } from "../agent/inference.ts";
import type { Explanation, ParseResult } from "../agent/inference.ts";
import { loadMenu } from "./menu.ts";
import { runContainmentProbe, runSolver, SandboxUnavailableError } from "./sandbox-runner.ts";
import type { Isolation, ProbeReport } from "./sandbox-runner.ts";
import type { AppConfig } from "./config.ts";
import {
  activeFireWindows,
  applySchedule,
  getOrder,
  setScheduleReason,
} from "./store.ts";
import { trailFromSchedule } from "./decision-trail.ts";
import { HOSTILE_DEMO_INPUT } from "../sandbox/fire-time-solver/solver.ts";
import type { SolveResult } from "../sandbox/fire-time-solver/types.ts";
import type { DriveInOrder } from "./types.ts";

export interface ScheduleResponse {
  applied: boolean;
  runner: "inprocess" | "docker";
  isolation: Isolation;
  runner_warning: string | null;
  decision: SolveResult;
  explanation: Explanation;
  parse: (ParseResult & { applied_to_order: false }) | null;
  order: DriveInOrder | null;
}

/** Compute fire_at for one stored order. The inference call explains; it does not set the clock. */
export async function scheduleOrder(
  orderId: string,
  config: AppConfig,
  utterance?: string,
): Promise<ScheduleResponse | { error: string; status: number }> {
  const existing = getOrder(orderId);
  if (!existing) return { error: "Order not found.", status: 404 };
  if (existing.status === "completed" || existing.status === "no_show") {
    return { error: "That ticket is already closed.", status: 409 };
  }
  // A second schedule must not push a live ticket back to waiting.
  if (existing.status === "cooking" || existing.status === "ready") {
    const decision: SolveResult = {
      decision: "fire",
      fire_at: existing.kitchen_start_at,
      ready_by: existing.ready_by,
      prep_minutes: existing.prep_minutes ?? 0,
      buffer_minutes: existing.buffer_minutes ?? config.bufferMinutes,
      queue_delay_minutes: 0,
      reason: existing.schedule_reason ?? "This ticket is already on the grill.",
      warnings: [],
      containment: "scheduled",
      contained: false,
      host_effects: "none",
      executed_payload: false,
      rule: null,
    };
    const explanation = await explainDecision({
      orderNumber: existing.order_number,
      carPlate: existing.car_plate,
      decision,
    });
    return {
      applied: false,
      runner: config.sandboxRunner,
      isolation: "none",
      runner_warning: "Ticket is already firing, so the solver was not run again.",
      decision,
      explanation,
      parse: await maybeParse(utterance),
      order: existing,
    };
  }

  const now = new Date();
  let outcome;
  try {
    outcome = await runSolver(
    {
      eta: existing.eta_timestamp,
      now: now.toISOString(),
      items: existing.items.map((item) => ({
        sku: item.sku,
        name: item.name,
        qty: item.qty,
        prep_minutes: item.prep_minutes,
        station: item.station,
      })),
      buffer_minutes: config.bufferMinutes,
      open: config.open,
      close: config.close,
      timezone: config.timezone,
      capacity_n: config.capacity,
      active_fires: activeFireWindows(existing.id),
      raw_note: existing.special_notes,
    },
    config,
    );
  } catch (error) {
    if (error instanceof SandboxUnavailableError) {
      return { error: error.message, status: 503 };
    }
    throw error;
  }

  const explanation = await explainDecision({
    orderNumber: existing.order_number,
    carPlate: existing.car_plate,
    decision: outcome.result,
  });
  const parse = await maybeParse(utterance);

  const trail = JSON.stringify(
    trailFromSchedule({
      arrival: existing.eta_time,
      decision: outcome.result,
      explanation,
    }),
  );

  if (outcome.result.decision === "refuse" || !outcome.result.fire_at || !outcome.result.ready_by) {
    const order = setScheduleReason(existing.id, outcome.result.reason, trail) ?? existing;
    return {
      applied: false,
      runner: outcome.runner,
      isolation: outcome.isolation,
      runner_warning: outcome.warning,
      decision: outcome.result,
      explanation,
      parse,
      order,
    };
  }

  const fireAt = new Date(outcome.result.fire_at);
  const status = fireAt.getTime() <= now.getTime() ? "cooking" : "confirmed";
  const saved = applySchedule(existing.id, {
    kitchen_start_at: outcome.result.fire_at,
    ready_by: outcome.result.ready_by,
    prep_minutes: outcome.result.prep_minutes,
    buffer_minutes: outcome.result.buffer_minutes,
    reason: outcome.result.reason,
    status,
    decision_trail: trail,
  });

  return {
    applied: saved.changed,
    runner: outcome.runner,
    isolation: outcome.isolation,
    runner_warning: saved.changed
      ? outcome.warning
      : "The ticket changed before the schedule could be saved.",
    decision: outcome.result,
    explanation,
    parse,
    order: saved.order ?? null,
  };
}

/**
 * Containment drill for the later demo video.
 * The fixture string is classified by the solver and is not passed to a shell.
 * No order is created or changed.
 */
export async function runContainmentDrill(
  config: AppConfig,
): Promise<ScheduleResponse | { error: string; status: number }> {
  let outcome;
  try {
    outcome = await runSolver(HOSTILE_DEMO_INPUT, config);
  } catch (error) {
    if (error instanceof SandboxUnavailableError) return { error: error.message, status: 503 };
    throw error;
  }
  const kept = outcome;
  const explanation = await explainDecision({
    orderNumber: "DRILL",
    carPlate: "—",
    decision: kept.result,
  });
  return {
    applied: false,
    runner: kept.runner,
    isolation: kept.isolation,
    runner_warning: kept.warning,
    decision: kept.result,
    explanation,
    parse: null,
    order: null,
  };
}

export async function runBoundaryProbe(
  config: AppConfig,
): Promise<{ report: ProbeReport; isolation: "docker" } | { error: string; status: number; isolation: Isolation }> {
  try {
    const report = await runContainmentProbe(config);
    return { report, isolation: "docker" };
  } catch (error) {
    if (error instanceof SandboxUnavailableError) {
      return {
        error: error.message,
        status: config.sandboxRunner === "docker" ? 503 : 200,
        isolation: config.sandboxRunner === "docker" ? "docker" : "none",
      };
    }
    throw error;
  }
}

async function maybeParse(utterance: string | undefined): Promise<ScheduleResponse["parse"]> {
  if (!utterance || !utterance.trim()) return null;
  const menu = loadMenu().items.map((item) => ({ sku: item.sku, name: item.name }));
  const parsed = await parseUtterance(utterance.trim().slice(0, 500), menu);
  return { ...parsed, applied_to_order: false };
}
