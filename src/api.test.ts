import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { closeDatabase, openDatabase } from "./db.ts";
import { applyApproach, promoteDueFires } from "./store.ts";
import { loadConfig } from "./config.ts";
import { createApp } from "./server.ts";

delete process.env.VULTR_INFERENCE_API_KEY;
process.env.SANDBOX_RUNNER = "inprocess";
process.env.INFERENCE_MODE = "demo";
process.env.KITCHEN_TOKEN = "test-kitchen-token";
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "r66-")), "orders.sqlite");

function pit(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("x-kitchen-token", "test-kitchen-token");
  return { ...init, headers };
}

function chicagoMinutes(date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
  const bag: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  const hour = bag.hour === "24" ? 0 : Number(bag.hour);
  return hour * 60 + Number(bag.minute);
}

function closedEta(now = new Date()): string {
  for (let minutes = 30; minutes <= 16 * 60; minutes += 15) {
    const candidate = new Date(now.getTime() + minutes * 60_000);
    const clock = chicagoMinutes(candidate);
    if (clock >= 22 * 60 + 30 || clock < 11 * 60) return candidate.toISOString();
  }
  throw new Error("Could not find a closed arrival slot.");
}

/** An arrival inside the demo open window, far enough out that the fire stays in the future. */
function futureEta(now = new Date()): string {
  for (let minutes = 50; minutes <= 17 * 60; minutes += 15) {
    const candidate = new Date(now.getTime() + minutes * 60_000);
    const clock = chicagoMinutes(candidate);
    if (clock >= 12 * 60 && clock <= 20 * 60) return candidate.toISOString();
  }
  throw new Error("Could not find an open arrival slot.");
}

test("guest ticket is priced, scheduled, and rushed onto the board", async () => {
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  const base = `http://127.0.0.1:${(address as AddressInfo).port}`;

  try {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Route 66 Drive-In/);
    const cartPage = await fetch(`${base}/cart`);
    assert.equal(cartPage.status, 200);
    assert.match(await cartPage.text(), /guest-app.js/);
    const kitchenPage = await fetch(`${base}/kitchen.html`);
    assert.match(await kitchenPage.text(), /Kitchen/);

    const closed = await fetch(`${base}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_name: "Mina Cole",
        car_plate: "TX-4400",
        car_color: "blue",
        eta: closedEta(),
        items: [{ sku: "classic-burger", qty: 1 }],
      }),
    });
    assert.equal(closed.status, 400);
    assert.match((await closed.json()).error, /outside open hours/);

    const menu = await (await fetch(`${base}/api/menu`)).json();
    const rings = menu.items.find((item: { sku: string }) => item.sku === "onion-rings");
    assert.equal(rings.available, false);
    assert.equal(menu.currency, "USD");

    const soldOut = await fetch(`${base}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_name: "Alex Rivera",
        car_plate: "TX-4821",
        car_color: "red",
        eta: futureEta(),
        items: [{ sku: "onion-rings", qty: 1 }],
      }),
    });
    assert.equal(soldOut.status, 400);
    assert.match((await soldOut.json()).error, /86/);

    const hostileNote = await fetch(`${base}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_name: "Alex Rivera",
        car_plate: "TX-4821",
        car_color: "red",
        eta: futureEta(),
        notes: "rm -rf /",
        items: [{ sku: "classic-burger", qty: 1 }],
      }),
    });
    assert.equal(hostileNote.status, 400);

    const created = await fetch(`${base}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_name: "Alex Rivera",
        car_plate: "tx 4821",
        car_color: "red",
        car_model: "Mustang",
        eta: futureEta(),
        notes: "No onion, please.",
        items: [
          { sku: "classic-burger", qty: 1 },
          { sku: "fries", qty: 1 },
          { sku: "chocolate-shake", qty: 1 },
        ],
      }),
    });
    assert.equal(created.status, 201);
    const { order } = await created.json();
    assert.equal(order.car_plate, "TX-4821");
    assert.equal(order.currency, "USD");
    assert.equal(order.subtotal_cents, 1747);
    assert.equal(order.sales_tax_cents, 144);
    assert.equal(order.grand_total_cents, 1891);
    assert.equal(order.status, "confirmed");
    assert.equal(order.kitchen_start_at, null);

    const scheduled = await fetch(`${base}/api/agent/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        order_id: order.id,
        utterance: "A cheeseburger for plate TX-9999",
      }),
    });
    assert.equal(scheduled.status, 200);
    const scheduleBody = await scheduled.json();
    assert.equal(scheduleBody.applied, true);
    assert.equal(scheduleBody.runner, "inprocess");
    assert.equal(scheduleBody.explanation.mode, "demo");
    assert.equal(scheduleBody.explanation.live, false);
    assert.equal(scheduleBody.explanation.source, "deterministic");
    assert.equal(scheduleBody.isolation, "none");
    assert.equal(scheduleBody.parse.applied_to_order, false);
    assert.equal(scheduleBody.parse.car_plate, "TX-9999");
    assert.ok(scheduleBody.parse.items.some((item: { sku: string }) => item.sku === "cheeseburger"));
    assert.equal(scheduleBody.order.items[0].sku, "classic-burger");
    assert.equal(scheduleBody.decision.host_effects, "none");
    assert.ok(scheduleBody.order.kitchen_start_at);
    assert.equal(scheduleBody.order.decision_trail.explanation.source, "deterministic");
    assert.equal(scheduleBody.order.decision_trail.explanation.live, false);
    assert.equal(scheduleBody.order.decision_trail.solver.fire_at, scheduleBody.order.kitchen_start_at);
    assert.equal(scheduleBody.order.decision_trail.solver.ready_by, scheduleBody.order.ready_by);
    assert.equal(scheduleBody.order.decision_trail.actions[0].actor, "solver");
    assert.equal(scheduleBody.order.decision_trail.actions[0].step, "schedule");

    const locked = await fetch(`${base}/api/kitchen/board`);
    assert.equal(locked.status, 401);
    const before = await (await fetch(`${base}/api/kitchen/board`, pit())).json();
    assert.ok(before.waiting.some((card: { id: string }) => card.id === order.id));

    const here = await fetch(`${base}/api/orders/${order.id}/here`, { method: "POST" });
    assert.equal(here.status, 200);
    const arrived = await here.json();
    assert.equal(arrived.order.guest_here, true);
    assert.equal(arrived.order.status, "cooking");

    const again = await fetch(`${base}/api/agent/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order_id: order.id }),
    });
    const againBody = await again.json();
    assert.equal(againBody.applied, false);
    assert.equal(againBody.order.status, "cooking");
    assert.equal(againBody.order.kitchen_start_at, arrived.order.kitchen_start_at);
    assert.match(arrived.order.decision_trail.solver.changes.join(" "), /arrived before the grill/i);
    assert.equal(arrived.order.decision_trail.solver.fire_at, arrived.order.kitchen_start_at);
    assert.equal(arrived.order.decision_trail.explanation.source, "deterministic");
    assert.equal(arrived.order.decision_trail.actions.at(-1).actor, "guest");
    assert.equal(arrived.order.decision_trail.actions.at(-1).step, "check_in");

    const after = await (await fetch(`${base}/api/kitchen/board`, pit())).json();
    const firing = after.firing.find((card: { id: string }) => card.id === order.id);
    assert.ok(firing);
    assert.equal(firing.guest_here, true);
    assert.equal(after.waiting.some((card: { id: string }) => card.id === order.id), false);

    const drill = await fetch(`${base}/api/agent/schedule`, pit({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ containment_drill: true }),
    }));
    const drillBody = await drill.json();
    assert.equal(drillBody.decision.containment, "hostile-refused");
    assert.equal(drillBody.decision.contained, true);
    assert.equal(drillBody.decision.executed_payload, false);
    assert.equal(drillBody.order, null);
    const stillThere = await (await fetch(`${base}/api/kitchen/board`, pit())).json();
    assert.ok(stillThere.firing.some((card: { id: string }) => card.id === order.id));

    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.persistence, "sqlite");
    assert.equal(health.inference_mode, "demo");
    assert.equal(health.inference_endpoint, "https://api.vultrinference.com/v1");
    assert.equal(health.live_call_verified, false);
    assert.equal(health.isolation, "none");
    assert.equal(health.fail_closed, false);
    assert.equal(health.kitchen_auth, true);

    const tooSoon = await fetch(`${base}/api/orders/${order.id}/picked-up`, pit({ method: "POST" }));
    assert.equal(tooSoon.status, 409);
    const denied = await fetch(`${base}/api/orders/${order.id}/ready`, { method: "POST" });
    assert.equal(denied.status, 401);
    const marked = await fetch(`${base}/api/orders/${order.id}/ready`, pit({ method: "POST" }));
    assert.equal(marked.status, 200);
    const markedBody = await marked.json();
    assert.equal(markedBody.order.status, "ready");
    assert.equal(markedBody.order.decision_trail.actions.at(-1).actor, "kitchen");
    assert.equal(markedBody.order.decision_trail.actions.at(-1).step, "ready");
    assert.equal(markedBody.order.kitchen_start_at, arrived.order.kitchen_start_at);
    const picked = await fetch(`${base}/api/orders/${order.id}/picked-up`, pit({ method: "POST" }));
    assert.equal(picked.status, 200);
    const pickedBody = await picked.json();
    assert.equal(pickedBody.order.status, "completed");
    assert.equal(pickedBody.order.decision_trail.actions.at(-1).step, "picked_up");
    assert.equal(pickedBody.order.decision_trail.solver.fire_at, arrived.order.decision_trail.solver.fire_at);
    const closedBoard = await (await fetch(`${base}/api/kitchen/board`, pit())).json();
    assert.equal(closedBoard.picked_up_today, 1);
    assert.ok(closedBoard.sandbox_flags.includes("--network=none"));

    const probe = await fetch(`${base}/api/agent/containment`, pit({ method: "POST" }));
    assert.equal(probe.status, 200);
    const probeBody = await probe.json();
    assert.equal(probeBody.verified, false);
    assert.equal(probeBody.isolation, "none");

    closeDatabase();
    const found = await fetch(
      `${base}/api/orders/lookup?order_number=${order.order_number}&car_plate=${order.car_plate}`,
    );
    assert.equal(found.status, 200);
    assert.equal((await found.json()).order.id, order.id);

    const second = await fetch(`${base}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_name: "Riley Chen",
        car_plate: "TX-9090",
        car_color: "green",
        eta: futureEta(),
        items: [{ sku: "chili-dog", qty: 1 }],
      }),
    });
    const secondOrder = (await second.json()).order;
    const [left, right] = await Promise.all([
      fetch(`${base}/api/orders/${secondOrder.id}/here`, { method: "POST" }),
      fetch(`${base}/api/orders/${secondOrder.id}/here`, { method: "POST" }),
    ]);
    const leftBody = await left.json();
    const rightBody = await right.json();
    assert.equal(leftBody.order.status, "cooking");
    assert.equal(rightBody.order.status, "cooking");
    assert.equal(leftBody.order.kitchen_start_at, rightBody.order.kitchen_start_at);

    const watched = await fetch(`${base}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_name: "Mina Cole",
        car_plate: "TX-8801",
        car_color: "blue",
        eta: futureEta(),
        arrival_opt_in: true,
        payment: "demo_unpaid",
        items: [{ sku: "classic-burger", qty: 1 }],
      }),
    });
    assert.equal(watched.status, 201);
    const watchedOrder = (await watched.json()).order;
    assert.equal(watchedOrder.payment_state, "demo_unpaid");
    assert.match(watchedOrder.payment_label, /not a charge/);
    const card = await fetch(`${base}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_name: "Mina Cole",
        car_plate: "TX-8802",
        car_color: "blue",
        eta: futureEta(),
        payment: "paid",
        items: [{ sku: "classic-burger", qty: 1 }],
      }),
    });
    assert.equal(card.status, 400);

    const timed = await fetch(`${base}/api/agent/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order_id: watchedOrder.id }),
    });
    const timedBody = await timed.json();
    const planned = timedBody.order.kitchen_start_at;
    const approach = await fetch(`${base}/api/orders/${watchedOrder.id}/approach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "sim-close", recorded_at: new Date().toISOString() }),
    });
    const approachBody = await approach.json();
    assert.equal(approach.status, 200);
    assert.equal(approachBody.applied, true);
    assert.equal(approachBody.refired, false);
    assert.equal(approachBody.live_gps_verified, false);
    assert.equal(approachBody.order.status, "cooking");
    assert.notEqual(approachBody.order.kitchen_start_at, planned);
    assert.equal(JSON.stringify(approachBody).includes("30.25"), false);
    const repeat = await fetch(`${base}/api/orders/${watchedOrder.id}/approach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "sim-close", recorded_at: new Date().toISOString() }),
    });
    const repeatBody = await repeat.json();
    assert.equal(repeatBody.applied, false);
    assert.equal(repeatBody.refired, false);
    assert.equal(repeatBody.code, "already-started");
    assert.equal(repeatBody.order.kitchen_start_at, approachBody.order.kitchen_start_at);

    const farOrder = await fetch(`${base}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_name: "Mina Cole",
        car_plate: "TX-8803",
        car_color: "white",
        eta: futureEta(),
        arrival_opt_in: true,
        items: [{ sku: "classic-burger", qty: 1 }],
      }),
    });
    const farId = (await farOrder.json()).order.id;
    await fetch(`${base}/api/agent/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order_id: farId }),
    });
    const far = await fetch(`${base}/api/orders/${farId}/approach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "sim-far", recorded_at: new Date().toISOString() }),
    });
    const farBody = await far.json();
    assert.equal(farBody.applied, false);
    assert.equal(farBody.order.status, "confirmed");

    const held = await fetch(`${base}/api/orders/${farId}/hold`, pit({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ held: true }),
    }));
    assert.equal(held.status, 200);
    const past = new Date(Date.now() - 60_000).toISOString();
    openDatabase().prepare(`UPDATE drivein_orders SET kitchen_start_at = ?, ready_by = ? WHERE id = ?`).run(past, past, farId);
    promoteDueFires();
    const heldOrder = await (await fetch(`${base}/api/orders/${farId}`)).json();
    assert.equal(heldOrder.order.status, "confirmed");
    assert.equal(heldOrder.order.fire_hold, true);

    const releasedId = watchedOrder.id;
    openDatabase().prepare(
      `UPDATE drivein_orders SET status = 'confirmed', fire_hold = 0, kitchen_start_at = ?, ready_by = ? WHERE id = ?`,
    ).run(past, past, releasedId);
    const due = promoteDueFires();
    assert.ok(due.includes(releasedId));
    const dueOrder = await (await fetch(`${base}/api/orders/${releasedId}`)).json();
    assert.equal(dueOrder.order.status, "cooking");
    assert.notEqual(dueOrder.order.status, "ready");

    const started = await fetch(`${base}/api/orders/${farId}/start`, pit({ method: "POST" }));
    const startedBody = await started.json();
    assert.equal(started.status, 200);
    assert.equal(startedBody.changed, true);
    assert.equal(startedBody.order.status, "cooking");
    assert.equal(startedBody.order.fire_hold, false);
    const markedPay = await fetch(`${base}/api/orders/${farId}/demo-payment`, pit({ method: "POST" }));
    assert.equal(markedPay.status, 409);
    const windowOrder = farBody.order;
    assert.equal(windowOrder.payment_state, "pay_at_window");

    const night = await fetch(`${base}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_name: "Mina Cole",
        car_plate: "TX-8804",
        car_color: "black",
        eta: futureEta(),
        arrival_opt_in: true,
        items: [{ sku: "classic-burger", qty: 1 }],
      }),
    });
    const nightId = (await night.json()).order.id;
    await fetch(`${base}/api/agent/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order_id: nightId }),
    });
    const closedApproach = applyApproach(
      nightId,
      { credible: true, code: "sim-close", note: "Simulated close arrival." },
      loadConfig(),
      new Date("2026-11-07T04:30:00.000Z"),
    );
    assert.equal(closedApproach.applied, false);
    assert.equal(closedApproach.code, "closed");
    assert.equal(closedApproach.order?.status, "confirmed");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
