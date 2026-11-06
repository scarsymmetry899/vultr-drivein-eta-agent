import { randomInt, randomUUID } from "node:crypto";
import { ticketPrepMinutes } from "../sandbox/fire-time-solver/solver.ts";
import { openDatabase } from "./db.ts";
import type { AppConfig } from "./config.ts";
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
  created_at: string;
  updated_at: string;
}

const ORDER_SELECT = `SELECT id, order_number, customer_name, car_plate, car_model, car_color, items,
  special_notes, eta_time, eta_timestamp, kitchen_start_at, ready_by, prep_minutes, buffer_minutes,
  subtotal_cents, sales_tax_cents, grand_total_cents, currency, status, order_type, guest_here,
  arrived_at, schedule_reason, created_at, updated_at FROM drivein_orders`;

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
      created_at: now,
      updated_at: now,
    };
    try {
      db.prepare(
        `INSERT INTO drivein_orders (
          id, order_number, customer_name, car_plate, car_model, car_color, items, special_notes,
          eta_time, eta_timestamp, kitchen_start_at, ready_by, prep_minutes, buffer_minutes,
          subtotal_cents, sales_tax_cents, grand_total_cents, currency, status, order_type,
          guest_here, arrived_at, schedule_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, 'USD', 'confirmed', ?, 0, NULL, NULL, ?, ?)`,
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

export function getOrder(id: string): DriveInOrder | undefined {
  const row = openDatabase().prepare(`${ORDER_SELECT} WHERE id = ?`).get(id) as OrderRow | undefined;
  return row ? fromRow(row) : undefined;
}

export function findOrder(orderNumber: string, carPlate: string): DriveInOrder | undefined {
  const row = openDatabase()
    .prepare(`${ORDER_SELECT} WHERE order_number = ? AND car_plate = ?`)
    .get(orderNumber, carPlate) as OrderRow | undefined;
  return row ? fromRow(row) : undefined;
}

/** Due fires move to cooking. Finished fires move to ready. Both updates are conditional. */
export function promote(now = new Date()): void {
  const db = openDatabase();
  const stamp = now.toISOString();
  db.prepare(
    `UPDATE drivein_orders
     SET status = 'cooking', updated_at = ?
     WHERE status = 'confirmed' AND kitchen_start_at IS NOT NULL AND kitchen_start_at <= ?`,
  ).run(stamp, stamp);
  db.prepare(
    `UPDATE drivein_orders
     SET status = 'ready', updated_at = ?
     WHERE status = 'cooking' AND ready_by IS NOT NULL AND ready_by <= ?`,
  ).run(stamp, stamp);
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
  },
): { order: DriveInOrder | undefined; changed: boolean } {
  const stamp = new Date().toISOString();
  const result = openDatabase()
    .prepare(
      `UPDATE drivein_orders
       SET kitchen_start_at = ?, ready_by = ?, prep_minutes = ?, buffer_minutes = ?,
           schedule_reason = ?, status = ?, updated_at = ?
       WHERE id = ? AND status = 'confirmed'`,
    )
    .run(
      patch.kitchen_start_at,
      patch.ready_by,
      patch.prep_minutes,
      patch.buffer_minutes,
      patch.reason,
      patch.status,
      stamp,
      id,
    );
  return { order: getOrder(id), changed: Number(result.changes) === 1 };
}

export function setScheduleReason(id: string, reason: string): DriveInOrder | undefined {
  const stamp = new Date().toISOString();
  openDatabase()
    .prepare(
      `UPDATE drivein_orders SET schedule_reason = ?, updated_at = ?
       WHERE id = ? AND status = 'confirmed'`,
    )
    .run(reason, stamp, id);
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
             status = 'cooking', order_type = 'now', schedule_reason = ?, updated_at = ?
         WHERE id = ? AND status = 'confirmed'`,
      )
      .run(
        stamp,
        prep,
        stamp,
        ready,
        "Guest is at the stall. Rush fire — cooking started now.",
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
  return getOrder(id);
}

export function markReady(id: string): { order: DriveInOrder | undefined; changed: boolean } {
  const stamp = new Date().toISOString();
  const result = openDatabase()
    .prepare(
      `UPDATE drivein_orders SET status = 'ready', updated_at = ? WHERE id = ? AND status = 'cooking'`,
    )
    .run(stamp, id);
  return { order: getOrder(id), changed: Number(result.changes) === 1 };
}

export function markPickedUp(id: string): { order: DriveInOrder | undefined; changed: boolean } {
  const stamp = new Date().toISOString();
  const result = openDatabase()
    .prepare(
      `UPDATE drivein_orders SET status = 'completed', updated_at = ? WHERE id = ? AND status = 'ready'`,
    )
    .run(stamp, id);
  return { order: getOrder(id), changed: Number(result.changes) === 1 };
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
}

export function kitchenBoard(config: AppConfig, now = new Date()): {
  as_of: string;
  timezone: string;
  drive_in: string;
  waiting: BoardCard[];
  firing: BoardCard[];
  ready: BoardCard[];
} {
  promote(now);
  const rows = openDatabase()
    .prepare(`${ORDER_SELECT} WHERE status IN ('confirmed', 'cooking', 'ready')`)
    .all() as unknown as OrderRow[];
  const waiting: BoardCard[] = [];
  const firing: BoardCard[] = [];
  const ready: BoardCard[] = [];
  for (const row of rows) {
    const card = toCard(fromRow(row));
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
  };
}

function toCard(order: DriveInOrder): BoardCard {
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
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
