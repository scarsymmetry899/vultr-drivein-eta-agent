/** One line on a ticket. Stations cook in parallel. */
export interface SolverItem {
  sku: string;
  name: string;
  qty: number;
  prep_minutes: number;
  station: string;
}

/** A ticket that already occupies the line. */
export interface FireWindow {
  fire_at: string;
  ready_by: string;
}

/**
 * Everything the solver needs. `now` is injected so a run is repeatable.
 * `raw_note` is data. The solver never passes it to a shell.
 */
export interface SolveInput {
  eta: string;
  now: string;
  items: SolverItem[];
  buffer_minutes: number;
  /** Wall clock HH:MM in `timezone`. */
  open: string;
  close: string;
  timezone: string;
  capacity_n: number;
  active_fires?: FireWindow[];
  /** Set on the containment drill. The note is still scanned. */
  hostile?: boolean;
  raw_note?: string;
}

export type SolverDecision = "fire" | "delay" | "refuse";

export type Containment = "scheduled" | "hostile-refused" | "rejected";

export interface SolveResult {
  decision: SolverDecision;
  /** ISO-8601 UTC. Null when the ticket was refused. */
  fire_at: string | null;
  ready_by: string | null;
  prep_minutes: number;
  buffer_minutes: number;
  queue_delay_minutes: number;
  reason: string;
  warnings: string[];
  /**
   * `hostile-refused` — a shell-like payload was classified and not executed.
   * `rejected` — hours, capacity, or a malformed ticket.
   * `scheduled` — fire_at / ready_by are the solver's numbers.
   */
  containment: Containment;
  /** True only when a hostile payload was refused inside the solver. */
  contained: boolean;
  /** This function does not spawn, write files, or open sockets. */
  host_effects: "none";
  executed_payload: false;
  rule: string | null;
}
