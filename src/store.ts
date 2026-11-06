import { randomInt, randomUUID } from "node:crypto";
import { parseTrail, trailForEarlyArrival } from "./decision-trail.ts";
import type { DecisionTrail } from "./decision-trail.ts";
import { serviceCue, withAction } from "./service-log.ts";
import type { ServiceAction } from "./service-log.ts";
import { describeArrivalHours, ticketPrepMinutes } from "../sandbox/fire-time-solver/solver.ts";
import type { ArrivalAssessment } from "./arrival.ts";
import { paymentLabel, staffDemoMark, type PaymentState } from "./payment.ts";
import { openDatabase } from "./db.ts";
import { loadConfig, type AppConfig } from "./config.ts";
import type { DriveInOrder, NewOrderInput, OrderItem, OrderStatus, UnavailableItem } from "./types.ts";

interface OrderRow {
  id: string;
  order_number: string;
  customer_name: string;
  car_plate: string;
  car_model: string;
  car_color: string;
  items: string;
  special_notes: string;
  eta_time: string;
  eta_timestamp: string;
  kitchen_start_at: string | null;
  ready_by: string | null;
  prep_minutes: number | null;
  buffer_minutes: number | null;
  subtotal_cents: number;
  sales_tax_cents: number;
  grand_total_cents: number;
  currency: "USD";
  status: OrderStatus;
  order_type: "preorder" | "now";
  guest_here: number;
  arrived_at: string | null;
  schedule_reason: string | null;
  decision_trail: string | null;
  fire_hold: number;
  arrival_opt_in: number;
  payment_state: PaymentState;
  created_at: string;
  updated_at: string;
}

const ORDER_SELECT = `SELECT id, order_number, customer_name, car_plate, car_model, car_color, items,
  special_notes, eta_time, eta_timestamp, kitchen_start_at, ready_by, prep_minutes, buffer_minutes,
  subtotal_cents, sales_tax_cents, grand_total_cents, currency, status, order_type, guest_here,
  arrived_at, schedule_reason, decision_trail, fire_hold, arrival_opt_in, payment_state,
  created_at, updated_at FROM drivein_orders`;

export function listUnavailable(): UnavailableItem[] {
  const rows = openDatabase()
    .prepare(
      `SELECT sku, item_name, station, reason, flagged_by, created_at
       FROM drivein_unavailable WHERE resolved = 0 ORDER BY item_name`,
    )
    .all() as {
    sku: string;
    item_name: string;
    station: string | null;
    reason: string | null;
    flagged_by: string | null;
    created_at: string;
  }[];
  return rows.map((row) => ({
    sku: row.sku,
    name: row.item_name,
    station: row.station ?? "",
    reason: row.reason ?? "",
    flagged_by: row.flagged_by ?? "",
    created_at: row.created_at,
  }));
}

export function unavailableBySku(sku: string): UnavailableItem | undefined {
  return listUnavailable().find((item) => item.sku === sku);
}

export function createOrder(input: NewOrderInput): DriveInOrder {
  const db = openDatabase();
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const order: DriveInOrder = {
      id: randomUUID(),
      order_number: `R66-${randomInt(10000, 100000)}`,
      customer_name: input.customer_name,
      car_plate: input.car_plate,
      car_model: input.car_model,
      car_color: input.car_color,
      items: input.items.map((item) => ({ ...item, allergens: [...item.allergens] })),
      special_notes: input.special_notes,
      eta_time: input.eta_time,
      eta_timestamp: input.eta_timestamp,
      kitchen_start_at: null,
      ready_by: null,
      prep_minutes: null,
      buffer_minutes: null,
      subtotal_cents: input.subtotal_cents,
      sales_tax_cents: input.sales_tax_cents,
      grand_total_cents: input.subtotal_cents + input.sales_tax_cents,
      currency: "USD",
      status: "confirmed",
      order_type: input.order_type,
      guest_here: false,
      arrived_at: null,
      schedule_reason: null,
      decision_trail: null,
      fire_hold: false,
      arrival_opt_in: input.arrival_opt_in,
      payment_state: input.payment_state,
      payment_label: paymentLabel(input.payment_state),
      created_at: now,
      updated_at: now,
    };
    try {
      db.prepare(
        `INSERT INTO drivein_orders (
          id, order_number, customer_name, car_plate, car_model, car_color, items, special_notes,
          eta_time, eta_timestamp, kitchen_start_at, ready_by, prep_minutes, buffer_minutes,
          subtotal_cents, sales_tax_cents, grand_total_cents, currency, status, order_type,
          guest_here, arrived_at, schedule_reason, fire_hold, arrival_opt_in, payment_state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, 'USD', 'confirmed', ?, 0, NULL, NULL, 0, ?, ?, ?, ?)`,
      ).run(
        order.id,
        order.order_number,
        order.customer_name,
        order.car_plate,
        order.car_model,
        order.car_color,
        JSON.stringify(order.items),
        order.special_notes,
        order.eta_time,
        order.eta_timestamp,
        order.subtotal_cents,
        order.sales_tax_cents,
        order.grand_total_cents,
        order.order_type,
        order.arrival_opt_in ? 1 : 0,
        order.payment_state,
        order.created_at,
        order.updated_at,
      );
      return order;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("UNIQUE") && attempt < 19) continue;
      throw error;
    }
  }
  throw new Error("Could not mint an order number.");
}

function readOrder(id: string): DriveInOrder | undefined {
  const row = openDatabase().prepare(`${ORDER_SELECT} WHERE id = ?`).get(id) as OrderRow | undefined;
  return row ? fromRow(row) : undefined;
}

export function getOrder(id: string): DriveInOrder | undefined {
  promoteDueFires();
  return readOrder(id);
}

export function findOrder(orderNumber: string, carPlate: string): DriveInOrder | undefined {
  const row = openDatabase()
    .prepare(`${ORDER_SELECT} WHERE order_number = ? AND car_plate = ?`)
    .get(orderNumber, carPlate) as OrderRow | undefined;
  return row ? fromRow(row) : undefined;
}

/**
 * Due scheduled fires move to cooking unless staff are holding the ticket.
 * Passing ready_by does not mark the bag ready. That stays a staff action.
 * The long-running server calls this every few seconds. A read of one ticket does too.
 */
export function promoteDueFires(now = new Date()): string[] {
  const stamp = now.toISOString();
  const due = openDatabase()
    .prepare(
      `SELECT id FROM drivein_orders
       WHERE status = 'confirmed' AND fire_hold = 0
         AND kitchen_start_at IS NOT NULL AND kitchen_start_at <= ?`,
    )
    .all(stamp) as { id: string }[];
  const started: string[] = [];
  for (const row of due) {
    const result = openDatabase()
      .prepare(
        `UPDATE drivein_orders SET status = 'cooking', updated_at = ?
         WHERE id = ? AND status = 'confirmed' AND fire_hold = 0
           AND kitchen_start_at IS NOT NULL AND kitchen_start_at <= ?`,
      )
      .run(stamp, row.id, stamp);
    if (Number(result.changes) !== 1) continue;
    remember(row.id, {
      at: stamp,
      actor: "solver",
      step: "auto_fire",
      result: "done",
      note: "The scheduled fire time arrived. Cooking started. Kitchen staff still mark the bag ready.",
    });
    started.push(row.id);
  }
  return started;
}

export function activeFireWindows(exceptId?: string): { fire_at: string; ready_by: string }[] {
  const rows = openDatabase()
    .prepare(
      `SELECT id, kitchen_start_at, ready_by FROM drivein_orders
       WHERE status IN ('confirmed', 'cooking')
         AND kitchen_start_at IS NOT NULL AND ready_by IS NOT NULL`,
    )
    .all() as { id: string; kitchen_start_at: string; ready_by: string }[];
  return rows
    .filter((row) => row.id !== exceptId)
    .map((row) => ({ fire_at: row.kitchen_start_at, ready_by: row.ready_by }));
}

export function applySchedule(
  id: string,
  patch: {
    kitchen_start_at: string;
    ready_by: string;
    prep_minutes: number;
    buffer_minutes: number;
    reason: string;
    status: OrderStatus;
    decision_trail: string | null;
  },
): { order: DriveInOrder | undefined; changed: boolean } {
  const stamp = new Date().toISOString();
  const result = openDatabase()
    .prepare(
      `UPDATE drivein_orders
       SET kitchen_start_at = ?, ready_by = ?, prep_minutes = ?, buffer_minutes = ?,
           schedule_reason = ?, decision_trail = ?, status = ?, updated_at = ?
       WHERE id = ? AND status = 'confirmed'`,
    )
    .run(
      patch.kitchen_start_at,
      patch.ready_by,
      patch.prep_minutes,
      patch.buffer_minutes,
      patch.reason,
      patch.decision_trail,
      patch.status,
      stamp,
      id,
    );
  return { order: getOrder(id), changed: Number(result.changes) === 1 };
}

export function setScheduleReason(id: string, reason: string, decisionTrail: string | null): DriveInOrder | undefined {
  const stamp = new Date().toISOString();
  openDatabase()
    .prepare(
      `UPDATE drivein_orders SET schedule_reason = ?, decision_trail = ?, updated_at = ?
       WHERE id = ? AND status = 'confirmed'`,
    )
    .run(reason, decisionTrail, stamp, id);
  return getOrder(id);
}

/**
 * Guest is at the stall. The first confirmed → cooking update wins.
 * A second call only records arrival and does not move the fire clock.
 */
export function markHere(id: string): DriveInOrder | undefined {
  const existing = getOrder(id);
  if (!existing) return undefined;
  if (existing.status === "completed" || existing.status === "no_show") return existing;
  if (existing.fire_hold && existing.status === "confirmed") return existing;
  const now = new Date();
  const stamp = now.toISOString();
  const db = openDatabase();
  if (existing.status === "confirmed") {
    const prep = existing.prep_minutes ?? ticketPrepMinutes(existing.items);
    const ready = new Date(now.getTime() + prep * 60_000).toISOString();
    const result = db
      .prepare(
        `UPDATE drivein_orders
         SET guest_here = 1, arrived_at = ?, prep_minutes = ?, kitchen_start_at = ?, ready_by = ?,
             status = 'cooking', order_type = 'now', schedule_reason = ?, decision_trail = ?, updated_at = ?
         WHERE id = ? AND status = 'confirmed'`,
      )
      .run(
        stamp,
        prep,
        stamp,
        ready,
        "Guest is at the stall. Rush fire — cooking started now.",
        JSON.stringify(
          trailForEarlyArrival({
            arrival: existing.eta_time,
            previousFire: existing.kitchen_start_at,
            previousReady: existing.ready_by,
            prepMinutes: prep,
            fireAt: stamp,
            readyBy: ready,
            timeZone: loadConfig().timezone,
          }),
        ),
        stamp,
        id,
      );
    if (Number(result.changes) === 1) return getOrder(id);
  }
  db.prepare(
    `UPDATE drivein_orders
     SET guest_here = 1, arrived_at = COALESCE(arrived_at, ?), updated_at = ?
     WHERE id = ? AND status IN ('cooking', 'ready')`,
  ).run(stamp, stamp, id);
  remember(id, {
    at: stamp,
    actor: "guest",
    step: "check_in",
    result: "unchanged",
    note: "Checked in again. The fire time stayed where it was.",
  });
  return getOrder(id);
}

export interface ApproachResult {
  order: DriveInOrder | undefined;
  applied: boolean;
  refired: boolean;
  code: string;
  note: string;
}

/** Opt-in close arrival. A repeated report never moves a fire that already started. */
export function applyApproach(id: string, assessment: ArrivalAssessment, config: AppConfig, now = new Date()): ApproachResult {
  const existing = getOrder(id);
  if (!existing) return { order: undefined, applied: false, refired: false, code: "missing", note: "Order not found." };
  if (!existing.arrival_opt_in) {
    return {
      order: existing,
      applied: false,
      refired: false,
      code: "opt-out",
      note: "Close-arrival watch is off. The scheduled fire still stands, or use I'm at the stall.",
    };
  }
  if (existing.status === "cooking" || existing.status === "ready" || existing.status === "completed") {
    return {
      order: existing,
      applied: false,
      refired: false,
      code: "already-started",
      note: "The grill already started. Another arrival report did not move the fire time.",
    };
  }
  if (existing.fire_hold) {
    return {
      order: existing,
      applied: false,
      refired: false,
      code: "held",
      note: "Kitchen staff are holding this fire. The arrival report did not start cooking.",
    };
  }
  if (!assessment.credible) {
    return { order: existing, applied: false, refired: false, code: assessment.code, note: assessment.note };
  }
  const hours = describeArrivalHours(now, config.open, config.close, config.timezone);
  if (!hours.ok) {
    return {
      order: existing,
      applied: false,
      refired: false,
      code: "closed",
      note: "The lot is closed, so a close arrival did not start the grill. The scheduled fire was left in place.",
    };
  }
  if (cookingCount() >= config.capacity) {
    return {
      order: existing,
      applied: false,
      refired: false,
      code: "full",
      note: "The kitchen is at capacity. Early fire was not started. The scheduled time still stands.",
    };
  }
  const started = rushFire(existing, now, {
    actor: "guest",
    step: "approach",
    note: assessment.note,
  });
  return {
    order: started.order,
    applied: started.changed,
    refired: false,
    code: started.changed ? assessment.code : "unchanged",
    note: started.changed ? assessment.note : "The fire time stayed where it was.",
  };
}

export function setArrivalWatch(id: string, enabled: boolean): DriveInOrder | undefined {
  const stamp = new Date().toISOString();
  openDatabase()
    .prepare(`UPDATE drivein_orders SET arrival_opt_in = ?, updated_at = ? WHERE id = ? AND status = 'confirmed'`)
    .run(enabled ? 1 : 0, stamp, id);
  return getOrder(id);
}

export function setFireHold(id: string, held: boolean): { order: DriveInOrder | undefined; changed: boolean } {
  const existing = getOrder(id);
  if (!existing) return { order: undefined, changed: false };
  if (existing.status !== "confirmed") return { order: existing, changed: false };
  const stamp = new Date().toISOString();
  const result = openDatabase()
    .prepare(`UPDATE drivein_orders SET fire_hold = ?, updated_at = ? WHERE id = ? AND status = 'confirmed'`)
    .run(held ? 1 : 0, stamp, id);
  const changed = Number(result.changes) === 1 && existing.fire_hold !== held;
  if (changed) {
    remember(id, {
      at: stamp,
      actor: "kitchen",
      step: "hold",
      result: held ? "done" : "unchanged",
      note: held
        ? "Kitchen staff held the scheduled fire. It will not start until they release it."
        : "Kitchen staff released the hold. The scheduled fire can start when it is due.",
    });
  }
  return { order: getOrder(id), changed };
}

export function markDemoPayment(id: string): { order: DriveInOrder | undefined; changed: boolean; error?: string } {
  const existing = getOrder(id);
  if (!existing) return { order: undefined, changed: false, error: "Order not found." };
  const next = staffDemoMark(existing.payment_state);
  if (typeof next !== "string") return { order: existing, changed: false, error: next.error };
  if (next === existing.payment_state) return { order: existing, changed: false };
  const stamp = new Date().toISOString();
  openDatabase()
    .prepare(`UPDATE drivein_orders SET payment_state = ?, updated_at = ? WHERE id = ?`)
    .run(next, stamp, id);
  remember(id, {
    at: stamp,
    actor: "kitchen",
    step: "payment",
    result: "done",
    note: "Marked the demo payment adapter. This is not a charge.",
  });
  return { order: getOrder(id), changed: true };
}

export function staffStart(id: string): { order: DriveInOrder | undefined; changed: boolean; note: string } {
  const existing = getOrder(id);
  if (!existing) return { order: undefined, changed: false, note: "Order not found." };
  if (existing.status !== "confirmed") {
    return { order: existing, changed: false, note: "The grill has already moved on." };
  }
  openDatabase().prepare(`UPDATE drivein_orders SET fire_hold = 0, updated_at = ? WHERE id = ? AND status = 'confirmed'`).run(new Date().toISOString(), id);
  const open = readOrder(id);
  if (!open) return { order: undefined, changed: false, note: "Order not found." };
  const started = rushFire({ ...open, fire_hold: false }, new Date(), {
    actor: "kitchen",
    step: "check_in",
    note: "Kitchen staff started the fire. A hold does not block this.",
  });
  return {
    order: started.order,
    changed: started.changed,
    note: started.changed ? "Kitchen staff started the fire." : "The fire time stayed where it was.",
  };
}

function cookingCount(): number {
  const row = openDatabase().prepare(`SELECT COUNT(*) AS n FROM drivein_orders WHERE status = 'cooking'`).get() as { n: number };
  return Number(row.n);
}

function rushFire(
  existing: DriveInOrder,
  now: Date,
  action: { actor: "guest" | "kitchen"; step: "check_in" | "approach"; note: string },
): { order: DriveInOrder | undefined; changed: boolean } {
  const stamp = now.toISOString();
  const prep = existing.prep_minutes ?? ticketPrepMinutes(existing.items);
  const ready = new Date(now.getTime() + prep * 60_000).toISOString();
  const result = openDatabase()
    .prepare(
      `UPDATE drivein_orders
       SET guest_here = 1, arrived_at = ?, prep_minutes = ?, kitchen_start_at = ?, ready_by = ?,
           status = 'cooking', order_type = 'now', schedule_reason = ?, decision_trail = ?, fire_hold = 0, updated_at = ?
       WHERE id = ? AND status = 'confirmed' AND fire_hold = 0`,
    )
    .run(
      stamp,
      prep,
      stamp,
      ready,
      action.note,
      JSON.stringify(
        trailForEarlyArrival({
          arrival: existing.eta_time,
          previousFire: existing.kitchen_start_at,
          previousReady: existing.ready_by,
          prepMinutes: prep,
          fireAt: stamp,
          readyBy: ready,
          timeZone: loadConfig().timezone,
        }),
      ),
      stamp,
      existing.id,
    );
  if (Number(result.changes) !== 1) return { order: getOrder(existing.id), changed: false };
  remember(existing.id, {
    at: stamp,
    actor: action.actor,
    step: action.step,
    result: "done",
    note: action.note,
  });
  return { order: getOrder(existing.id), changed: true };
}

export function markReady(id: string): { order: DriveInOrder | undefined; changed: boolean } {
  const stamp = new Date().toISOString();
  const result = openDatabase()
    .prepare(
      `UPDATE drivein_orders SET status = 'ready', updated_at = ? WHERE id = ? AND status = 'cooking'`,
    )
    .run(stamp, id);
  const changed = Number(result.changes) === 1;
  if (changed) {
    remember(id, {
      at: stamp,
      actor: "kitchen",
      step: "ready",
      result: "done",
      note: "Marked the bag ready.",
    });
  }
  return { order: getOrder(id), changed };
}

export function markPickedUp(id: string): { order: DriveInOrder | undefined; changed: boolean } {
  const stamp = new Date().toISOString();
  const result = openDatabase()
    .prepare(
      `UPDATE drivein_orders SET status = 'completed', updated_at = ? WHERE id = ? AND status = 'ready'`,
    )
    .run(stamp, id);
  const changed = Number(result.changes) === 1;
  if (changed) {
    remember(id, {
      at: stamp,
      actor: "kitchen",
      step: "picked_up",
      result: "done",
      note: "Marked the bag picked up.",
    });
  }
  return { order: getOrder(id), changed };
}

function remember(id: string, action: ServiceAction): void {
  const order = readOrder(id);
  if (!order) return;
  const trail = withAction(order.decision_trail ?? blankTrail(order), action);
  openDatabase().prepare("UPDATE drivein_orders SET decision_trail = ? WHERE id = ?").run(JSON.stringify(trail), id);
}

function blankTrail(order: DriveInOrder): DecisionTrail {
  return {
    solver: {
      arrival: order.eta_time,
      prep_minutes: order.prep_minutes,
      buffer_minutes: order.buffer_minutes,
      fire_at: order.kitchen_start_at,
      ready_by: order.ready_by,
      decision: "fire",
      changes: [],
    },
    explanation: {
      mode: "demo",
      source: "deterministic",
      live: false,
      text: "",
      warning: null,
    },
    actions: [],
  };
}

export interface BoardCard {
  id: string;
  order_number: string;
  customer_name: string;
  car_plate: string;
  car_color: string;
  car_model: string;
  items: { name: string; qty: number }[];
  eta_time: string;
  eta_timestamp: string;
  kitchen_start_at: string | null;
  ready_by: string | null;
  status: OrderStatus;
  guest_here: boolean;
  grand_total_cents: number;
  currency: "USD";
  special_notes: string;
  schedule_reason: string | null;
  decision_changes: string[];
  /** Planned fire time an early check-in replaced, if any. */
  fire_moved_from: string | null;
  next_step: string;
  exception: string | null;
  last_action: string | null;
  fire_hold: boolean;
  payment_label: string;
}

export function kitchenBoard(config: AppConfig, now = new Date()): {
  as_of: string;
  timezone: string;
  drive_in: string;
  waiting: BoardCard[];
  firing: BoardCard[];
  ready: BoardCard[];
  picked_up_today: number;
  sandbox_flags: string[];
} {
  promoteDueFires(now);
  const rows = openDatabase()
    .prepare(`${ORDER_SELECT} WHERE status IN ('confirmed', 'cooking', 'ready')`)
    .all() as unknown as OrderRow[];
  const waiting: BoardCard[] = [];
  const firing: BoardCard[] = [];
  const ready: BoardCard[] = [];
  for (const row of rows) {
    const card = toCard(fromRow(row), now);
    if (row.status === "confirmed") waiting.push(card);
    else if (row.status === "cooking") firing.push(card);
    else ready.push(card);
  }
  const byEta = (a: BoardCard, b: BoardCard) => a.eta_timestamp.localeCompare(b.eta_timestamp);
  const byReady = (a: BoardCard, b: BoardCard) =>
    (a.ready_by ?? a.eta_timestamp).localeCompare(b.ready_by ?? b.eta_timestamp);
  waiting.sort(byEta);
  firing.sort(byReady);
  ready.sort(byReady);
  return {
    as_of: now.toISOString(),
    timezone: config.timezone,
    drive_in: config.driveIn,
    waiting,
    firing,
    ready,
    picked_up_today: pickedUpToday(config.timezone, now),
    sandbox_flags: [
      "--network=none",
      "--read-only",
      "--cap-drop=ALL",
      "no-new-privileges",
      `--memory=${config.sandboxMemory}`,
      `--pids-limit=${config.sandboxPids}`,
      `--cpus=${config.sandboxCpus}`,
      "--user node",
    ],
  };
}

/** Tickets closed as picked up on the lot's calendar day. */
function pickedUpToday(timeZone: string, now: Date): number {
  const day = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  const today = day(now);
  const since = new Date(now.getTime() - 26 * 3_600_000).toISOString();
  const rows = openDatabase()
    .prepare(`SELECT updated_at FROM drivein_orders WHERE status = 'completed' AND updated_at >= ?`)
    .all(since) as unknown as { updated_at: string }[];
  return rows.filter((row) => day(new Date(row.updated_at)) === today).length;
}

function toCard(order: DriveInOrder, now: Date): BoardCard {
  const cue = serviceCue({
    status: order.status,
    kitchen_start_at: order.kitchen_start_at,
    ready_by: order.ready_by,
    eta_timestamp: order.eta_timestamp,
    now,
  });
  const actions = order.decision_trail?.actions ?? [];
  return {
    id: order.id,
    order_number: order.order_number,
    customer_name: order.customer_name,
    car_plate: order.car_plate,
    car_color: order.car_color,
    car_model: order.car_model,
    items: order.items.map((item) => ({ name: item.name, qty: item.qty })),
    eta_time: order.eta_time,
    eta_timestamp: order.eta_timestamp,
    kitchen_start_at: order.kitchen_start_at,
    ready_by: order.ready_by,
    status: order.status,
    guest_here: order.guest_here,
    grand_total_cents: order.grand_total_cents,
    currency: order.currency,
    special_notes: order.special_notes,
    schedule_reason: order.schedule_reason,
    decision_changes: order.decision_trail?.solver.changes ?? [],
    fire_moved_from: order.decision_trail?.solver.previous_fire_at ?? null,
    next_step: cue.next_step,
    exception: cue.exception,
    last_action: actions.length ? actions[actions.length - 1]?.note ?? null : null,
    fire_hold: order.fire_hold,
    payment_label: order.payment_label,
  };
}

function fromRow(row: OrderRow): DriveInOrder {
  const items = JSON.parse(row.items) as OrderItem[];
  return {
    id: row.id,
    order_number: row.order_number,
    customer_name: row.customer_name,
    car_plate: row.car_plate,
    car_model: row.car_model,
    car_color: row.car_color,
    items,
    special_notes: row.special_notes,
    eta_time: row.eta_time,
    eta_timestamp: row.eta_timestamp,
    kitchen_start_at: row.kitchen_start_at,
    ready_by: row.ready_by,
    prep_minutes: row.prep_minutes,
    buffer_minutes: row.buffer_minutes,
    subtotal_cents: row.subtotal_cents,
    sales_tax_cents: row.sales_tax_cents,
    grand_total_cents: row.grand_total_cents,
    currency: "USD",
    status: row.status,
    order_type: row.order_type,
    guest_here: row.guest_here === 1,
    arrived_at: row.arrived_at,
    schedule_reason: row.schedule_reason,
    fire_hold: row.fire_hold === 1,
    arrival_opt_in: row.arrival_opt_in === 1,
    payment_state: row.payment_state,
    payment_label: paymentLabel(row.payment_state),
    decision_trail: parseTrail(row.decision_trail),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
