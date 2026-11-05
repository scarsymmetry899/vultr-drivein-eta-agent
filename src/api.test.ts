import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "./server.ts";

delete process.env.VULTR_INFERENCE_API_KEY;
process.env.SANDBOX_RUNNER = "inprocess";

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
    const kitchenPage = await fetch(`${base}/kitchen.html`);
    assert.match(await kitchenPage.text(), /Kitchen board/);

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
    assert.equal(scheduleBody.explanation.source, "stub");
    assert.equal(scheduleBody.parse.applied_to_order, false);
    assert.equal(scheduleBody.parse.car_plate, "TX-9999");
    assert.ok(scheduleBody.parse.items.some((item: { sku: string }) => item.sku === "cheeseburger"));
    assert.equal(scheduleBody.order.items[0].sku, "classic-burger");
    assert.equal(scheduleBody.decision.host_effects, "none");
    assert.ok(scheduleBody.order.kitchen_start_at);

    const before = await (await fetch(`${base}/api/kitchen/board`)).json();
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

    const after = await (await fetch(`${base}/api/kitchen/board`)).json();
    const firing = after.firing.find((card: { id: string }) => card.id === order.id);
    assert.ok(firing);
    assert.equal(firing.guest_here, true);
    assert.equal(after.waiting.some((card: { id: string }) => card.id === order.id), false);

    const drill = await fetch(`${base}/api/agent/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ containment_drill: true }),
    });
    const drillBody = await drill.json();
    assert.equal(drillBody.decision.containment, "hostile-refused");
    assert.equal(drillBody.decision.contained, true);
    assert.equal(drillBody.decision.executed_payload, false);
    assert.equal(drillBody.order, null);
    const stillThere = await (await fetch(`${base}/api/kitchen/board`)).json();
    assert.ok(stillThere.firing.some((card: { id: string }) => card.id === order.id));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
