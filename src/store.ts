import { randomInt, randomUUID } from "node:crypto";
import { ticketPrepMinutes } from "../sandbox/fire-time-solver/solver.ts";
import type { AppConfig } from "./config.ts";
import type { DriveInOrder, NewOrderInput, OrderStatus, UnavailableItem } from "./types.ts";

const orders = new Map<string, DriveInOrder>();
const orderNumbers = new Set<string>();

/** Demo 86 list. Resets when the process restarts. Mirrors drivein_unavailable. */
const unavailable = new Map<string, UnavailableItem>([
  [
    "onion-rings",
    {
      sku: "onion-rings",
      name: "Onion Rings",
      station: "fryer",
      reason: "Fryer basket is down for this demo.",
      flagged_by: "kitchen",
      created_at: "2026-11-05T15:00:00.000Z",
    },
  ],
]);

export function listUnavailable(): UnavailableItem[] {
  return [...unavailable.values()];
}

export function unavailableBySku(sku: string): UnavailableItem | undefined {
  return unavailable.get(sku);
}

export function createOrder(input: NewOrderInput): DriveInOrder {
  const now = new Date().toISOString();
  const order: DriveInOrder = {
    id: randomUUID(),
    order_number: nextOrderNumber(),
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
  orders.set(order.id, order);
  return clone(order);
}

export function getOrder(id: string): DriveInOrder | undefined {
  const order = orders.get(id);
  return order ? clone(order) : undefined;
}

export function listOrders(): DriveInOrder[] {
  return [...orders.values()].map(clone);
}

/** Move due tickets from waiting to firing, and finished fires to ready. */
export function promote(now = new Date()): void {
  const stamp = now.toISOString();
  for (const order of orders.values()) {
    if (
      order.status === "confirmed" &&
      order.kitchen_start_at &&
      new Date(order.kitchen_start_at).getTime() <= now.getTime()
    ) {
      order.status = "cooking";
      order.updated_at = stamp;
    }
    if (
      order.status === "cooking" &&
      order.ready_by &&
      new Date(order.ready_by).getTime() <= now.getTime()
    ) {
      order.status = "ready";
      order.updated_at = stamp;
    }
  }
}

export function activeFireWindows(exceptId?: string): { fire_at: string; ready_by: string }[] {
  const windows: { fire_at: string; ready_by: string }[] = [];
  for (const order of orders.values()) {
    if (order.id === exceptId) continue;
    if (order.status !== "confirmed" && order.status !== "cooking") continue;
    if (!order.kitchen_start_at || !order.ready_by) continue;
    windows.push({ fire_at: order.kitchen_start_at, ready_by: order.ready_by });
  }
  return windows;
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
): DriveInOrder | undefined {
  const order = orders.get(id);
  if (!order) return undefined;
  order.kitchen_start_at = patch.kitchen_start_at;
  order.ready_by = patch.ready_by;
  order.prep_minutes = patch.prep_minutes;
  order.buffer_minutes = patch.buffer_minutes;
  order.schedule_reason = patch.reason;
  order.status = patch.status;
  order.updated_at = new Date().toISOString();
  return clone(order);
}

export function setScheduleReason(id: string, reason: string): DriveInOrder | undefined {
  const order = orders.get(id);
  if (!order) return undefined;
  order.schedule_reason = reason;
  order.updated_at = new Date().toISOString();
  return clone(order);
}

/**
 * Guest is at the stall. A ticket that has not started cooking rush-fires now.
 * Prep length is the slowest station already stored, or the max item prep.
 */
export function markHere(id: string): DriveInOrder | undefined {
  const order = orders.get(id);
  if (!order) return undefined;
  if (order.status === "completed" || order.status === "no_show") return clone(order);
  const now = new Date();
  order.guest_here = true;
  order.arrived_at = now.toISOString();
  if (order.status === "confirmed") {
    const prep = order.prep_minutes ?? ticketPrepMinutes(order.items);
    order.prep_minutes = prep;
    order.kitchen_start_at = now.toISOString();
    order.ready_by = new Date(now.getTime() + prep * 60_000).toISOString();
    order.status = "cooking";
    order.order_type = "now";
    order.schedule_reason = "Guest is at the stall. Rush fire — cooking started now.";
  }
  order.updated_at = now.toISOString();
  return clone(order);
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
  const waiting: BoardCard[] = [];
  const firing: BoardCard[] = [];
  const ready: BoardCard[] = [];
  for (const order of orders.values()) {
    const card = toCard(order);
    if (order.status === "confirmed") waiting.push(card);
    else if (order.status === "cooking") firing.push(card);
    else if (order.status === "ready") ready.push(card);
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

function nextOrderNumber(): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `R66-${randomInt(10000, 100000)}`;
    if (!orderNumbers.has(candidate)) {
      orderNumbers.add(candidate);
      return candidate;
    }
  }
  throw new Error("Could not mint an order number.");
}

function clone(order: DriveInOrder): DriveInOrder {
  return structuredClone(order);
}
