import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { assessApproach } from "./arrival.ts";
import { closeDatabase, openDatabase } from "./db.ts";
import { scheduleOrder } from "./schedule.ts";
import { createApp } from "./server.ts";
import { serviceCue } from "./service-log.ts";
import { createOrder, markReady, setFireHold, staffStart } from "./store.ts";
import { loadConfig } from "./config.ts";

process.env.SANDBOX_RUNNER = "inprocess";
process.env.INFERENCE_MODE = "demo";
process.env.KITCHEN_TOKEN = "fictional-review-token";
process.env.KITCHEN_CAPACITY = "1";
process.env.DRIVEIN_OPEN = "00:00";
process.env.DRIVEIN_CLOSE = "24:00";
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "r66-release-")), "orders.sqlite");
delete process.env.VULTR_INFERENCE_API_KEY;

const fileDatabase = process.env.DATABASE_PATH;

function reset(): void {
  openDatabase().prepare("DELETE FROM drivein_orders").run();
}

function make(minutes: number) {
  return createOrder({
    customer_name: "Review Guest",
    car_plate: `REV-${Math.floor(Math.random() * 1e6)}`,
    car_model: "Civic",
    car_color: "blue",
    items: [{ sku: "classic-burger", qty: 1, name: "Classic Burger", station: "grill", prep_minutes: 8, price_cents: 699, allergens: [] }],
    special_notes: "",
    eta_time: "",
    eta_timestamp: new Date(Date.now() + minutes * 60_000).toISOString(),
    subtotal_cents: 699,
    sales_tax_cents: 58,
    order_type: "preorder",
    arrival_opt_in: false,
    payment_state: "pay_at_window",
  });
}

function cooking(): number {
  return Number((openDatabase().prepare(`SELECT COUNT(*) AS n FROM drivein_orders WHERE status = 'cooking'`).get() as { n: number }).n);
}

describe("release regressions", { concurrency: 1 }, () => {
test("guest schedule respects a staff hold, including one applied while the solver is running", async () => {
  reset();
  const held = make(1);
  setFireHold(held.id, true);
  const first = await scheduleOrder(held.id, loadConfig());
  assert.ok("order" in first && first.order);
  assert.equal(first.order.status, "confirmed");
  assert.equal(first.order.fire_hold, true);
  const waiting = make(1);
  const flight = scheduleOrder(waiting.id, loadConfig());
  setFireHold(waiting.id, true);
  const second = await flight;
  assert.ok("order" in second && second.order);
  assert.equal(second.order.status, "confirmed");
  assert.equal(second.order.fire_hold, true);
});

test("capacity includes an overdue cooking ticket, and freeing it starts the next due ticket", async () => {
  reset();
  const overdue = make(1);
  await scheduleOrder(overdue.id, loadConfig());
  const past = new Date(Date.now() - 60_000).toISOString();
  openDatabase().prepare(`UPDATE drivein_orders SET status = 'cooking', ready_by = ? WHERE id = ?`).run(past, overdue.id);
  const waiting = make(1);
  await scheduleOrder(waiting.id, loadConfig());
  assert.equal(cooking(), 1);
  const waitingRow = openDatabase().prepare(`SELECT status, kitchen_start_at FROM drivein_orders WHERE id = ?`).get(waiting.id) as { status: string; kitchen_start_at: string };
  assert.equal(waitingRow.status, "confirmed");
  assert.ok(Date.parse(waitingRow.kitchen_start_at) <= Date.now());
  markReady(overdue.id);
  const { getOrder } = await import("./store.ts");
  const next = getOrder(waiting.id);
  assert.equal(next?.status, "cooking");
});

test("two immediate schedules cannot both start when the grill has one slot", async () => {
  reset();
  const left = make(1);
  const right = make(1);
  await Promise.all([scheduleOrder(left.id, loadConfig()), scheduleOrder(right.id, loadConfig())]);
  assert.equal(cooking(), 1);
});

test("releasing a due hold returns the started ticket instead of a false refusal", async () => {
  reset();
  const order = make(1);
  await scheduleOrder(order.id, loadConfig());
  const past = new Date(Date.now() - 60_000).toISOString();
  openDatabase().prepare(`UPDATE drivein_orders SET status = 'confirmed', fire_hold = 1, kitchen_start_at = ?, ready_by = ? WHERE id = ?`).run(past, past, order.id);
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${address.port}`;
    const released = await fetch(`${base}/api/orders/${order.id}/hold`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-kitchen-token": "fictional-review-token" },
      body: JSON.stringify({ held: false }),
    });
    const body = await released.json();
    assert.equal(released.status, 200);
    assert.equal(body.changed, true);
    assert.equal(body.order.status, "cooking");
    const invalid = await fetch(`${base}/api/orders/${order.id}/hold`, {
      method: "POST",
      headers: { "x-kitchen-token": "fictional-review-token" },
    });
    assert.equal(invalid.status, 409);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("out-of-range coordinates are rejected and not stored", () => {
  const now = new Date();
  const result = assessApproach({
    source: "device",
    recordedAt: now.toISOString(),
    now,
    accuracyM: 12,
    lat: 95,
    lng: -97.749,
    lotLat: 30.25,
    lotLng: -97.749,
  });
  assert.equal(result.credible, false);
  assert.equal(result.code, "bad-fix");
  assert.equal(JSON.stringify(result).includes("95"), false);
});

test("staff start leaves a hold in place when the grill is full", async () => {
  reset();
  const active = make(1);
  const held = make(1);
  await scheduleOrder(active.id, loadConfig());
  setFireHold(held.id, true);
  const result = staffStart(held.id);
  assert.equal(result.changed, false);
  assert.equal(result.order?.status, "confirmed");
  assert.equal(result.order?.fire_hold, true);
  assert.match(result.note, /capacity/);
});

test("a due ticket that is still waiting names capacity, and a hold names staff", () => {
  const now = new Date("2026-11-07T18:00:00.000Z");
  const held = serviceCue({
    status: "confirmed",
    kitchen_start_at: "2026-11-07T17:00:00.000Z",
    ready_by: "2026-11-07T17:08:00.000Z",
    eta_timestamp: "2026-11-07T17:11:00.000Z",
    now,
    fire_hold: true,
  });
  assert.match(held.exception ?? "", /holding the fire/);
  const waiting = serviceCue({
    status: "confirmed",
    kitchen_start_at: "2026-11-07T17:00:00.000Z",
    ready_by: "2026-11-07T17:08:00.000Z",
    eta_timestamp: "2026-11-07T17:11:00.000Z",
    now,
  });
  assert.match(waiting.exception ?? "", /at capacity/);
});

test("arrival labels use one time zone for the clock and the weekday", async () => {
  const { arrivalSlotLabel } = await import("../public/js/arrival-label.js");
  const slot = new Date("2026-11-07T06:10:00.000Z");
  const now = new Date("2026-11-07T05:50:00.000Z");
  assert.equal(arrivalSlotLabel(slot, now, "America/Chicago"), "12:10 AM Sat");
  assert.equal(arrivalSlotLabel(slot, now, "Asia/Kolkata"), "11:40 AM");
});

test("the kitchen card offers a deliberate start", () => {
  const source = readFileSync(new URL("../public/kitchen.js", import.meta.url), "utf8");
  assert.match(source, /Start now \(release hold\)/);
  assert.match(source, /postStatus\(card\.id, "start"/);
});

test("opening an older SQLite file keeps the existing ticket and adds the new columns", () => {
  const path = join(mkdtempSync(join(tmpdir(), "r66-legacy-")), "legacy.sqlite");
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE drivein_orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      car_plate TEXT NOT NULL,
      car_model TEXT NOT NULL DEFAULT '',
      car_color TEXT NOT NULL DEFAULT '',
      items TEXT NOT NULL,
      special_notes TEXT NOT NULL DEFAULT '',
      eta_time TEXT NOT NULL DEFAULT '',
      eta_timestamp TEXT NOT NULL,
      kitchen_start_at TEXT,
      ready_by TEXT,
      prep_minutes INTEGER,
      buffer_minutes INTEGER,
      subtotal_cents INTEGER NOT NULL,
      sales_tax_cents INTEGER NOT NULL,
      grand_total_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'confirmed',
      order_type TEXT NOT NULL DEFAULT 'preorder',
      guest_here INTEGER NOT NULL DEFAULT 0,
      arrived_at TEXT,
      schedule_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  legacy.prepare(
    `INSERT INTO drivein_orders (
      id, order_number, customer_name, car_plate, car_model, car_color, items, special_notes,
      eta_time, eta_timestamp, subtotal_cents, sales_tax_cents, grand_total_cents, currency,
      status, order_type, guest_here, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "legacy-1",
    "R66-10001",
    "Older Guest",
    "TX-OLD1",
    "Wagon",
    "red",
    "[]",
    "no onions",
    "6:10 PM",
    "2026-11-07T00:10:00.000Z",
    699,
    58,
    757,
    "USD",
    "confirmed",
    "preorder",
    0,
    "2026-11-06T00:00:00.000Z",
    "2026-11-06T00:00:00.000Z",
  );
  legacy.close();
  closeDatabase();
  process.env.DATABASE_PATH = path;
  const row = openDatabase().prepare(`SELECT * FROM drivein_orders WHERE id = 'legacy-1'`).get() as Record<string, unknown>;
  assert.equal(row.car_plate, "TX-OLD1");
  assert.equal(row.grand_total_cents, 757);
  assert.equal(row.status, "confirmed");
  assert.equal(row.special_notes, "no onions");
  assert.equal(row.fire_hold, 0);
  assert.equal(row.arrival_opt_in, 0);
  assert.equal(row.payment_state, "pay_at_window");
  assert.equal(row.decision_trail, null);
  closeDatabase();
  process.env.DATABASE_PATH = fileDatabase;
  openDatabase();
});

test("the server interval starts a due fire without a ticket read and leaves a hold and a finished bag alone", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "r66-interval-")), "interval.sqlite");
  closeDatabase();
  process.env.DATABASE_PATH = path;
  openDatabase();
  const due = make(1);
  const held = make(1);
  const bag = make(1);
  const past = new Date(Date.now() - 60_000).toISOString();
  openDatabase().prepare(
    `UPDATE drivein_orders SET status = 'confirmed', fire_hold = 0, kitchen_start_at = ?, ready_by = ? WHERE id = ?`,
  ).run(past, new Date(Date.now() + 10 * 60_000).toISOString(), due.id);
  openDatabase().prepare(
    `UPDATE drivein_orders SET status = 'confirmed', fire_hold = 1, kitchen_start_at = ?, ready_by = ? WHERE id = ?`,
  ).run(past, past, held.id);
  openDatabase().prepare(
    `UPDATE drivein_orders SET status = 'cooking', fire_hold = 0, kitchen_start_at = ?, ready_by = ? WHERE id = ?`,
  ).run(past, past, bag.id);
  closeDatabase();
  const root = new URL("..", import.meta.url).pathname;
  const child = spawn(process.execPath, [join(root, "node_modules/tsx/dist/cli.mjs"), "src/server.ts"], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_PATH: path,
      HOST: "127.0.0.1",
      PORT: "18771",
      KITCHEN_TOKEN: "fictional-review-token",
      KITCHEN_CAPACITY: "3",
      SANDBOX_RUNNER: "inprocess",
      INFERENCE_MODE: "demo",
      DRIVEIN_OPEN: "00:00",
      DRIVEIN_CLOSE: "24:00",
    },
    stdio: "ignore",
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 7000));
    const db = new DatabaseSync(path, { readOnly: true });
    const rows = db.prepare(`SELECT id, status FROM drivein_orders`).all() as { id: string; status: string }[];
    db.close();
    const status = Object.fromEntries(rows.map((row) => [row.id, row.status]));
    assert.equal(status[due.id], "cooking");
    assert.equal(status[held.id], "confirmed");
    assert.equal(status[bag.id], "cooking");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", () => resolve(undefined)));
    process.env.DATABASE_PATH = fileDatabase;
    openDatabase();
  }
});
});
