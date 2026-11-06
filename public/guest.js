const menuRoot = document.querySelector("#menu-list");
const menuSection = document.querySelector("#menu");
const hours = document.querySelector("#hours");
const form = document.querySelector("#order-form");
const lookupForm = document.querySelector("#lookup");
const result = document.querySelector("#result");
const etaInput = document.querySelector("#eta");
const estimate = document.querySelector("#estimate");
const dockSummary = document.querySelector("#dock-summary");
const sendButton = document.querySelector("#send");
const banner = document.querySelector("#mode-banner");

const quantities = new Map();
let menuItems = [];
let lotZone = "America/Chicago";
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
  return `Allergens: ${list.join(", ")}.`;
}

function selectedLines() {
  return menuItems
    .map((item) => ({ item, qty: quantities.get(item.sku) ?? 0 }))
    .filter((line) => line.qty > 0);
}

function refreshEstimate() {
  const lines = selectedLines();
  const cents = lines.reduce((sum, line) => sum + line.item.price_cents * line.qty, 0);
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  const label = count === 0 ? "Nothing in the bag yet." : `${count} item${count === 1 ? "" : "s"} · ${usd(cents)} before tax`;
  estimate.textContent = label;
  dockSummary.textContent = label;
}

function renderMenu() {
  menuRoot.replaceChildren();
  if (menuItems.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "The menu is empty.";
    menuRoot.append(empty);
    return;
  }
  for (const item of menuItems) {
    const card = document.createElement("article");
    card.className = item.available ? "item" : "item sold";
    const copy = document.createElement("div");
    copy.className = "item-copy";
    const title = document.createElement("h3");
    title.textContent = item.name;
    if (!item.available) {
      const stamp = document.createElement("span");
      stamp.className = "stamp";
      stamp.textContent = "86 sold out";
      title.append(stamp);
    }
    const description = document.createElement("p");
    description.textContent = item.description;
    const price = document.createElement("p");
    price.className = "price";
    price.textContent = usd(item.price_cents);
    const meta = document.createElement("p");
    meta.className = "meta";
    const reason = item.available ? "" : ` ${item.unavailable_reason}`;
    meta.textContent = `${item.prep_minutes} min · ${item.station}. ${allergens(item.allergens)}${reason}`;
    copy.append(title, description, price, meta);

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
    down.setAttribute("aria-label", `Remove one ${item.name}`);
    const count = document.createElement("strong");
    count.textContent = String(qty);
    const up = document.createElement("button");
    up.type = "button";
    up.className = "ghost";
    up.textContent = "+";
    up.disabled = !item.available || qty >= 8;
    up.dataset.sku = item.sku;
    up.dataset.dir = "1";
    up.setAttribute("aria-label", `Add one ${item.name}`);
    controls.append(down, count, up);
    card.append(copy, controls);
    menuRoot.append(card);
  }
  refreshEstimate();
}

menuRoot.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("button");
  if (!button?.dataset.sku || !button.dataset.dir) return;
  const dir = Number(button.dataset.dir);
  const sku = button.dataset.sku;
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
  result.scrollIntoView({ block: "nearest" });
}

function clock(iso) {
  if (!iso) return "not set";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: lotZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

function modeCopy(mode) {
  if (mode === "live") return "Live model wrote the sentence. The fire time still comes from the solver.";
  if (mode === "live-failed" || mode === "live-rejected") {
    return "Live inference did not supply usable text. Showing the solver sentence instead.";
  }
  return "Demo mode. This sentence is deterministic. It is not a live model.";
}

function showOrder(order, extra) {
  result.hidden = false;
  result.replaceChildren();
  const stub = document.createElement("div");
  stub.className = "stub";
  const kicker = document.createElement("p");
  kicker.className = "eyebrow";
  kicker.textContent = order.guest_here ? "At the stall" : "Ticket";
  const title = document.createElement("h3");
  title.textContent = order.order_number;
  const plate = document.createElement("p");
  plate.className = "plate";
  plate.textContent = order.car_plate;
  const lines = document.createElement("p");
  lines.textContent = order.items.map((item) => `${item.qty} × ${item.name}`).join(", ");
  const total = document.createElement("p");
  total.textContent = `${usd(order.subtotal_cents)} + ${usd(order.sales_tax_cents)} sales tax = ${usd(order.grand_total_cents)}. Pay at the window.`;
  const eta = document.createElement("p");
  eta.textContent = `Arrive ${order.eta_time}. Status: ${statusLabel(order.status)}.`;
  stub.append(kicker, title, plate, lines, total, eta);
  if (order.kitchen_start_at) {
    const times = document.createElement("p");
    times.textContent = `Fire ${clock(order.kitchen_start_at)}. Ready ${clock(order.ready_by)}.`;
    stub.append(times);
  }
  result.append(stub);
  if (extra) result.append(extra);

  const actions = document.createElement("div");
  actions.className = "actions";
  if (order.status === "confirmed") {
    const schedule = document.createElement("button");
    schedule.type = "button";
    schedule.className = "dark";
    schedule.textContent = "Set the fire time";
    schedule.addEventListener("click", () => scheduleOrder(order.id, schedule));
    actions.append(schedule);
  }
  if (!order.guest_here && order.status !== "completed" && order.status !== "no_show") {
    const here = document.createElement("button");
    here.type = "button";
    here.textContent = "I'm at the stall";
    here.addEventListener("click", () => markHere(order.id, here));
    actions.append(here);
  }
  if (actions.childElementCount > 0) result.append(actions);
  result.scrollIntoView({ block: "nearest" });
}

function statusLabel(status) {
  if (status === "confirmed") return "waiting to fire";
  if (status === "cooking") return "on the grill";
  if (status === "ready") return "bagged and ready";
  if (status === "completed") return "picked up";
  return status;
}

async function scheduleOrder(orderId, button) {
  button.disabled = true;
  button.textContent = "Setting the fire…";
  try {
    const response = await fetch("/api/agent/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order_id: orderId }),
    });
    const body = await response.json();
    if (!response.ok) {
      showError(body.error || "The pit could not set a fire time.");
      return;
    }
    const note = document.createElement("div");
    const mode = document.createElement("p");
    mode.className = "meta";
    mode.textContent = modeCopy(body.explanation?.mode);
    const reason = document.createElement("p");
    reason.textContent = body.explanation?.text || body.decision?.reason || "";
    const when = document.createElement("p");
    const refused = body.decision?.decision === "refuse";
    when.textContent = body.applied
      ? `Fire ${clock(body.decision.fire_at)}. Ready ${clock(body.decision.ready_by)}.`
      : refused
        ? "Not on the wheel."
        : `Already on the grill. Fire ${clock(body.decision.fire_at)}. Ready ${clock(body.decision.ready_by)}.`;
    note.append(mode, reason, when);
    if (body.explanation?.warning) {
      const warning = document.createElement("p");
      warning.className = "bad";
      warning.textContent = body.explanation.warning;
      note.append(warning);
    }
    if (body.order) showOrder(body.order, note);
  } finally {
    button.disabled = false;
    button.textContent = "Set the fire time";
  }
}

async function markHere(orderId, button) {
  button.disabled = true;
  button.textContent = "Telling the pit…";
  try {
    const response = await fetch(`/api/orders/${orderId}/here`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) {
      showError(body.error || "Could not mark you at the stall.");
      return;
    }
    const note = document.createElement("p");
    note.textContent = body.order.schedule_reason || "The pit has you at the stall.";
    showOrder(body.order, note);
  } finally {
    button.disabled = false;
    button.textContent = "I'm at the stall";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const lines = selectedLines();
  if (lines.length === 0) {
    showError("Add at least one item that is not 86.");
    return;
  }
  sendButton.disabled = true;
  sendButton.textContent = "Sending…";
  try {
    const data = new FormData(form);
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_name: data.get("customer_name"),
        car_plate: data.get("car_plate"),
        car_color: data.get("car_color"),
        car_model: data.get("car_model"),
        eta: new Date(String(data.get("eta"))).toISOString(),
        notes: data.get("notes"),
        items: lines.map((line) => ({ sku: line.item.sku, qty: line.qty })),
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      showError(body.error || "Could not send that order.");
      return;
    }
    showOrder(body.order);
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = "Send to the pit";
  }
});

lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(lookupForm);
  const params = new URLSearchParams({
    order_number: String(data.get("order_number") ?? ""),
    car_plate: String(data.get("car_plate") ?? ""),
  });
  const response = await fetch(`/api/orders/lookup?${params}`);
  const body = await response.json();
  if (!response.ok) {
    showError(body.error || "Could not find that ticket.");
    return;
  }
  showOrder(body.order);
});

try {
  const health = await fetch("/api/health");
  const status = await health.json();
  banner.textContent = status.inference_mode === "live"
    ? "Live inference is selected. The solver still owns the fire time."
    : "Demo mode. Fire times are computed on this server. Copy is deterministic, not a live model.";
} catch {
  banner.textContent = "Service status did not load.";
}

try {
  const menuResponse = await fetch("/api/menu");
  if (!menuResponse.ok) throw new Error("menu");
  const menu = await menuResponse.json();
  menuItems = menu.items;
  if (menu.timezone) lotZone = menu.timezone;
  hours.textContent = `Open ${menu.open}–${menu.close} (${menu.timezone}). Sales tax ${(menu.sales_tax_rate * 100).toFixed(2)}% on this demo. ${menu.city}.`;
  menuSection.setAttribute("aria-busy", "false");
  renderMenu();
} catch {
  hours.textContent = "The menu did not load. Refresh the page.";
  menuSection.setAttribute("aria-busy", "false");
}
