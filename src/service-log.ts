export type ServiceActor = "guest" | "solver" | "kitchen";
export type ServiceStep = "schedule" | "check_in" | "ready" | "picked_up" | "refused" | "auto_fire" | "approach" | "hold" | "payment";
export type ServiceResult = "done" | "refused" | "unchanged";

export interface ServiceAction {
  at: string;
  actor: ServiceActor;
  step: ServiceStep;
  result: ServiceResult;
  note: string;
}

export interface ServiceCue {
  owner: ServiceActor;
  next_step: string;
  exception: string | null;
}

const flights = new Map<string, Promise<unknown>>();

/** One in-flight piece of work per key. A second caller waits for the first. */
export function shareFlight<T>(key: string, start: () => Promise<T>): Promise<T> {
  const existing = flights.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const run = start().finally(() => {
    if (flights.get(key) === run) flights.delete(key);
  });
  flights.set(key, run);
  return run;
}

export function withAction<T extends { actions?: ServiceAction[] }>(trail: T, action: ServiceAction): T {
  const prior = trail.actions ?? [];
  const last = prior[prior.length - 1];
  if (last && last.actor === action.actor && last.step === action.step && last.result === action.result) return trail;
  return { ...trail, actions: [...prior, action].slice(-12) };
}

/** Who acts next, and which exceptions stay with a person. */
export function serviceCue(input: {
  status: string;
  kitchen_start_at: string | null;
  ready_by: string | null;
  eta_timestamp: string;
  now?: Date;
  fire_hold?: boolean;
}): ServiceCue {
  const now = input.now ?? new Date();
  const eta = Date.parse(input.eta_timestamp);
  const ready = input.ready_by ? Date.parse(input.ready_by) : Number.NaN;
  if (input.status === "cooking") {
    const overdue = Number.isFinite(ready) && ready < now.getTime();
    return {
      owner: "kitchen",
      next_step: "Kitchen staff mark the bag ready when it is actually bagged.",
      exception: overdue
        ? "Past ready. A person decides whether the bag is actually ready. The board will not mark it ready by itself."
        : null,
    };
  }
  if (input.status === "ready") {
    const late = Number.isFinite(eta) && eta + 10 * 60_000 < now.getTime();
    return {
      owner: "kitchen",
      next_step: "Kitchen staff hand off the bag, then mark it picked up.",
      exception: late
        ? "The car is late. Staff hold the bag. The ticket stays open until someone marks it picked up."
        : null,
    };
  }
  if (input.status === "completed") {
    return { owner: "kitchen", next_step: "Kitchen staff marked this picked up.", exception: null };
  }
  if (input.fire_hold) {
    return {
      owner: "kitchen",
      next_step: "Staff must release the hold or deliberately start this ticket.",
      exception: "Kitchen staff are holding the fire.",
    };
  }
  if (input.kitchen_start_at && Date.parse(input.kitchen_start_at) <= now.getTime()) {
    return {
      owner: "kitchen",
      next_step: "Staff must free a grill slot before this ticket can start.",
      exception: "The scheduled fire is due, but the kitchen is at capacity. This ticket is still waiting.",
    };
  }
  if (!input.kitchen_start_at) {
    return {
      owner: "guest",
      next_step: "Guest times the grill. Staff do not set this clock.",
      exception: Number.isFinite(eta) && eta < now.getTime()
        ? "The arrival time passed before the grill was timed. Leave it, or the guest checks in. Staff do not invent a fire time."
        : null,
    };
  }
  return {
    owner: "solver",
    next_step: "The solver owns the fire time. Kitchen staff take the bag after it fires, or after the guest checks in early.",
    exception: Number.isFinite(eta) && eta < now.getTime()
      ? "The arrival time passed before the grill fired. Leave it waiting, or the guest checks in. Staff do not invent a fire time."
      : null,
  };
}
