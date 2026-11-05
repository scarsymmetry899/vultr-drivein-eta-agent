const menuRoot = document.querySelector("#menu");
const hours = document.querySelector("#hours");
const form = document.querySelector("#order-form");
const result = document.querySelector("#result");
const etaInput = document.querySelector("#eta");

const quantities = new Map();
let menuItems = [];
let currentOrder = null;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function usd(cents) {
  return money.format(cents / 100);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function localInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

etaInput.value = localInputValue(new Date(Date.now() + 45 * 60_000));

function allergens(list) {
  if (!list.length) return "No major allergens listed.";
  return `Contains ${list.join(", ")}.`;
}

function renderMenu() {
  menuRoot.replaceChildren();
  for (const item of menuItems) {
    const card = document.createElement("article");
    card.className = "item";
    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = item.name;
    if (!item.available) {
      const stamp = document.createElement("span");
      stamp.className = "stamp";
      stamp.textContent = "86";
      title.append(stamp);
    }
    const description = document.createElement("p");
    description.textContent = item.description;
    const meta = document.createElement("p");
    meta.className = "meta";
    const reason = item.available ? "" : ` ${item.unavailable_reason}`;
    meta.textContent = `${usd(item.price_cents)} · ${item.prep_minutes} min · ${item.station}. ${allergens(item.allergens)}${reason}`;
    copy.append(title, description, meta);

    const qty = quantities.get(item.sku) ?? 0;
    const controls = document.createElement("div");
    controls.className = "qty";
    const down = document.createElement("button");
    down.type = "button";
    down.className = "ghost";
    down.textContent = "−";
    down.disabled = !item.available || qty <= 0;
    down.dataset.sku = item.sku;
    down.dataset.dir = "-1";
    down.setAttribute("aria-label", `Fewer ${item.name}`);
    const count = document.createElement("strong");
    count.textContent = String(qty);
    const up = document.createElement("button");
    up.type = "button";
    up.className = "ghost";
    up.textContent = "+";
    up.disabled = !item.available || qty >= 8;
    up.dataset.sku = item.sku;
    up.dataset.dir = "1";
    up.setAttribute("aria-label", `More ${item.name}`);
    controls.append(down, count, up);
    card.append(copy, controls);
    menuRoot.append(card);
  }
}

menuRoot.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("button");
  if (!button) return;
  const sku = button.dataset.sku;
  const dir = Number(button.dataset.dir);
  if (!sku || !dir) return;
  const next = Math.min(8, Math.max(0, (quantities.get(sku) ?? 0) + dir));
  quantities.set(sku, next);
  renderMenu();
});

function showError(message) {
  result.hidden = false;
  result.replaceChildren();
  const paragraph = document.createElement("p");
  paragraph.className = "bad";
  paragraph.textContent = message;
  result.append(paragraph);
}

function clock(iso, timeZone) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

function showOrder(order, extra) {
  currentOrder = order;
  result.hidden = false;
  result.replaceChildren();
  const title = document.createElement("h3");
  title.textContent = order.order_number;
  const lines = document.createElement("p");
  lines.textContent = order.items.map((item) => `${item.qty} × ${item.name}`).join(", ");
  const total = document.createElement("p");
  total.textContent = `${usd(order.subtotal_cents)} + ${usd(order.sales_tax_cents)} sales tax = ${usd(order.grand_total_cents)}`;
  const eta = document.createElement("p");
  eta.textContent = `Arrive ${order.eta_time}. Plate ${order.car_plate}.`;
  result.append(title, lines, total, eta);
  if (extra) result.append(extra);
  const actions = document.createElement("div");
  actions.className = "actions";
  if (order.status === "confirmed") {
    const schedule = document.createElement("button");
    schedule.type = "button";
    schedule.className = "secondary";
    schedule.textContent = "Schedule the fire";
    schedule.addEventListener("click", () => scheduleOrder(order.id));
    actions.append(schedule);
  }
  if (!order.guest_here) {
    const here = document.createElement("button");
    here.type = "button";
    here.textContent = "I'm at the stall";
    here.addEventListener("click", () => markHere(order.id));
    actions.append(here);
  }
  if (actions.childElementCount > 0) result.append(actions);
}

async function scheduleOrder(orderId) {
  const response = await fetch("/api/agent/schedule", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order_id: orderId }),
  });
  const body = await response.json();
  if (!response.ok) {
    showError(body.error || "The pit could not schedule that ticket.");
    return;
  }
  const note = document.createElement("div");
  const reason = document.createElement("p");
  reason.textContent = body.explanation?.text || body.decision?.reason || "";
  const when = document.createElement("p");
  const refused = body.decision?.decision === "refuse";
  when.textContent = body.applied
    ? `Fire ${clock(body.decision.fire_at)}. Ready ${clock(body.decision.ready_by)}. Runner: ${body.runner}.`
    : refused
      ? `Not on the wheel. Runner: ${body.runner}.`
      : `Already on the grill. Fire ${clock(body.decision.fire_at)}. Ready ${clock(body.decision.ready_by)}.`;
  note.append(reason, when);
  if (body.explanation?.warning) {
    const warning = document.createElement("p");
    warning.className = "meta";
    warning.textContent = body.explanation.warning;
    note.append(warning);
  }
  if (body.order) showOrder(body.order, note);
}

async function markHere(orderId) {
  const response = await fetch(`/api/orders/${orderId}/here`, { method: "POST" });
  const body = await response.json();
  if (!response.ok) {
    showError(body.error || "Could not mark you at the stall.");
    return;
  }
  const note = document.createElement("p");
  note.textContent = body.order.schedule_reason || "The pit has you at the stall.";
  showOrder(body.order, note);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const items = [];
  for (const [sku, qty] of quantities) {
    if (qty > 0) items.push({ sku, qty });
  }
  if (items.length === 0) {
    showError("Add at least one item that isn't 86.");
    return;
  }
  const data = new FormData(form);
  const eta = new Date(String(data.get("eta"))).toISOString();
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customer_name: data.get("customer_name"),
      car_plate: data.get("car_plate"),
      car_color: data.get("car_color"),
      car_model: data.get("car_model"),
      eta,
      notes: data.get("notes"),
      items,
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    showError(body.error || "Could not place that order.");
    return;
  }
  showOrder(body.order);
});

const menuResponse = await fetch("/api/menu");
const menu = await menuResponse.json();
menuItems = menu.items;
hours.textContent = `Open ${menu.open}–${menu.close} (${menu.timezone}). Demo sales tax ${(menu.sales_tax_rate * 100).toFixed(2)}%. ${menu.city}.`;
renderMenu();
