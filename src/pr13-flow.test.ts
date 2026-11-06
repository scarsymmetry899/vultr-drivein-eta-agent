import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { closeDatabase, openDatabase } from "./db.ts";
import { createApp } from "./server.ts";

process.env.SANDBOX_RUNNER = "inprocess";
process.env.INFERENCE_MODE = "demo";
process.env.KITCHEN_TOKEN = "preview-test-token";
process.env.KITCHEN_CAPACITY = "3";
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "r66-pr13-")), "orders.sqlite");
delete process.env.VULTR_INFERENCE_API_KEY;

function pit(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("x-kitchen-token", "preview-test-token");
  return { ...init, headers };
}

function chicagoMinutes(date: Date): number {
  const bag: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  const hour = bag.hour === "24" ? 0 : Number(bag.hour);
  return hour * 60 + Number(bag.minute);
}

function futureEta(now = new Date()): string {
  for (let minutes = 70; minutes <= 17 * 60; minutes += 15) {
    const candidate = new Date(now.getTime() + minutes * 60_000);
    const clock = chicagoMinutes(candidate);
    if (clock >= 12 * 60 && clock <= 20 * 60) return candidate.toISOString();
  }
  throw new Error("Could not find an open arrival slot.");
}

async function listen(): Promise<{ base: string; close: () => Promise<void> }> {
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return {
    base: `http://127.0.0.1:${(address as AddressInfo).port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function order(base: string, plate: string, extra: Record<string, unknown> = {}) {
  const response = await fetch(`${base}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customer_name: "Mina Cole",
      car_plate: plate,
      car_color: "blue",
      eta: futureEta(),
      items: [{ sku: "classic-burger", qty: 1 }],
      ...extra,
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return body.order as { id: string; order_number: string; car_plate: string };
}

async function schedule(base: string, id: string) {
  const response = await fetch(`${base}/api/agent/schedule`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order_id: id }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body.order as { kitchen_start_at: string; ready_by: string; status: string };
}

test("a ticket read and the scheduler tick both start a due fire, and neither marks it ready", async () => {
  const { base, close } = await listen();
  try {
    const byRead = await order(base, "TX-9101");
    const byTick = await order(base, "TX-9102");
    await schedule(base, byRead.id);
    await schedule(base, byTick.id);
    const past = new Date(Date.now() - 60_000).toISOString();
    const readyPast = new Date(Date.now() - 30_000).toISOString();
    openDatabase()
      .prepare(`UPDATE drivein_orders SET kitchen_start_at = ?, ready_by = ? WHERE id = ?`)
      .run(past, readyPast, byRead.id);

    const read = await (await fetch(`${base}/api/orders/${byRead.id}`)).json();
    assert.equal(read.order.status, "cooking");
    assert.equal(read.order.ready_by, readyPast);

    openDatabase()
      .prepare(`UPDATE drivein_orders SET kitchen_start_at = ?, ready_by = ? WHERE id = ?`)
      .run(past, readyPast, byTick.id);
    const beforeTick = openDatabase()
      .prepare(`SELECT status FROM drivein_orders WHERE id = ?`)
      .get(byTick.id) as { status: string };
    assert.equal(beforeTick.status, "confirmed");
    const { promoteDueFires } = await import("./store.ts");
    const started = promoteDueFires();
    assert.ok(started.includes(byTick.id));
    const afterTick = openDatabase()
      .prepare(`SELECT status, ready_by FROM drivein_orders WHERE id = ?`)
      .get(byTick.id) as { status: string; ready_by: string };
    assert.equal(afterTick.status, "cooking");
    assert.equal(afterTick.ready_by, readyPast);

    const lookup = await fetch(
      `${base}/api/orders/lookup?order_number=${byTick.order_number}&car_plate=${byTick.car_plate}`,
    );
    assert.equal((await lookup.json()).order.status, "cooking");
  } finally {
    await close();
  }
});

test("hold blocks the scheduled fire and the stall check-in, and staff start overrides the hold", async () => {
  const { base, close } = await listen();
  try {
    const ticket = await order(base, "TX-9103");
    await schedule(base, ticket.id);
    const denied = await fetch(`${base}/api/orders/${ticket.id}/hold`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ held: true }),
    });
    assert.equal(denied.status, 401);
    const held = await fetch(`${base}/api/orders/${ticket.id}/hold`, pit({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ held: true }),
    }));
    assert.equal(held.status, 200);
    const past = new Date(Date.now() - 60_000).toISOString();
    openDatabase()
      .prepare(`UPDATE drivein_orders SET kitchen_start_at = ?, ready_by = ? WHERE id = ?`)
      .run(past, past, ticket.id);
    const duringHold = await (await fetch(`${base}/api/orders/${ticket.id}`)).json();
    assert.equal(duringHold.order.status, "confirmed");
    const here = await fetch(`${base}/api/orders/${ticket.id}/here`, { method: "POST" });
    assert.equal(here.status, 409);
    const still = await here.json();
    assert.equal(still.order.status, "confirmed");
    const startDenied = await fetch(`${base}/api/orders/${ticket.id}/start`, { method: "POST" });
    assert.equal(startDenied.status, 401);
    const start = await fetch(`${base}/api/orders/${ticket.id}/start`, pit({ method: "POST" }));
    const started = await start.json();
    assert.equal(start.status, 200);
    assert.equal(started.order.status, "cooking");
    assert.equal(started.order.fire_hold, false);
    const tooSoon = await fetch(`${base}/api/orders/${ticket.id}/picked-up`, pit({ method: "POST" }));
    assert.equal(tooSoon.status, 409);
    const earlyReady = await fetch(`${base}/api/orders/${ticket.id}/ready`, { method: "POST" });
    assert.equal(earlyReady.status, 401);
    const ready = await fetch(`${base}/api/orders/${ticket.id}/ready`, pit({ method: "POST" }));
    assert.equal(ready.status, 200);
    assert.equal((await ready.json()).order.status, "ready");
    const picked = await fetch(`${base}/api/orders/${ticket.id}/picked-up`, pit({ method: "POST" }));
    assert.equal(picked.status, 200);
    assert.equal((await picked.json()).order.status, "completed");
    const repeat = await fetch(`${base}/api/orders/${ticket.id}/picked-up`, pit({ method: "POST" }));
    assert.equal(repeat.status, 409);
  } finally {
    await close();
  }
});

test("capacity, invalid GPS, privacy, and the demo payment marker", async () => {
  const { base, close } = await listen();
  try {
    const filler = await order(base, "TX-9104");
    await schedule(base, filler.id);
    await fetch(`${base}/api/orders/${filler.id}/here`, { method: "POST" });
    const cooking = openDatabase()
      .prepare(`SELECT COUNT(*) AS n FROM drivein_orders WHERE status = 'cooking'`)
      .get() as { n: number };
    process.env.KITCHEN_CAPACITY = String(Math.max(1, Number(cooking.n)));

    const watched = await order(base, "TX-9105", { arrival_opt_in: true, payment: "demo_unpaid" });
    const payDenied = await fetch(`${base}/api/orders/${watched.id}/demo-payment`, { method: "POST" });
    assert.equal(payDenied.status, 401);
    const pay = await fetch(`${base}/api/orders/${watched.id}/demo-payment`, pit({ method: "POST" }));
    const payBody = await pay.json();
    assert.equal(pay.status, 200);
    assert.equal(payBody.live_charge, false);
    assert.equal(payBody.order.payment_state, "demo_marked");
    assert.match(payBody.order.payment_label, /not a payment/);
    const payAgain = await fetch(`${base}/api/orders/${watched.id}/demo-payment`, pit({ method: "POST" }));
    assert.equal((await payAgain.json()).changed, false);
    const scheduled = await schedule(base, watched.id);
    const full = await fetch(`${base}/api/orders/${watched.id}/approach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "sim-close", recorded_at: new Date().toISOString() }),
    });
    const fullBody = await full.json();
    assert.equal(fullBody.applied, false);
    assert.equal(fullBody.code, "full");
    assert.equal(fullBody.order.kitchen_start_at, scheduled.kitchen_start_at);
    assert.equal(fullBody.order.status, "confirmed");

    process.env.KITCHEN_CAPACITY = "20";
    const secretLat = 37.771234;
    const stale = await fetch(`${base}/api/orders/${watched.id}/approach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "device",
        recorded_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        accuracy_m: 12,
        lat: secretLat,
        lng: -122.4194,
      }),
    });
    const staleBody = await stale.json();
    assert.equal(staleBody.applied, false);
    assert.equal(staleBody.code, "stale");
    assert.equal(staleBody.live_gps_verified, false);
    const staleText = JSON.stringify(staleBody);
    assert.equal(staleText.includes(String(secretLat)), false);
    const stored = openDatabase()
      .prepare(`SELECT decision_trail, payment_state FROM drivein_orders WHERE id = ?`)
      .get(watched.id) as { decision_trail: string | null; payment_state: string };
    assert.equal((stored.decision_trail ?? "").includes(String(secretLat)), false);
    assert.equal(stored.payment_state, "demo_marked");

    const ignored = await fetch(`${base}/api/orders/${filler.id}/approach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "sim-close", recorded_at: new Date().toISOString() }),
    });
    const ignoredBody = await ignored.json();
    assert.equal(ignoredBody.code, "opt-out");
    assert.equal(ignoredBody.applied, false);

    const board = await fetch(`${base}/api/kitchen/board`);
    assert.equal(board.status, 401);
    assert.equal((await board.text()).includes("TX-9105"), false);
    const openBoard = await fetch(`${base}/api/kitchen/board`, pit());
    assert.equal(openBoard.status, 200);
    const boardBody = await openBoard.json();
    assert.equal(boardBody.waiting.some((card: { car_plate: string }) => card.car_plate === "TX-9105"), true);

  } finally {
    process.env.KITCHEN_CAPACITY = "3";
    closeDatabase();
    await close();
  }
});
