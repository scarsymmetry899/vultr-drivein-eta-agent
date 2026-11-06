import { foodMark } from "./icons.js";

const CATEGORIES = [
  { id: "burgers", label: "Burgers" },
  { id: "dogs", label: "Dogs" },
  { id: "sides", label: "Sides" },
  { id: "shakes", label: "Shakes" },
  { id: "drinks", label: "Drinks" },
];

const COLORS = [
  ["red", "#9c2f24"],
  ["white", "#f7f3ec"],
  ["black", "#1c1612"],
  ["blue", "#2c4c78"],
  ["silver", "#c8c2b8"],
  ["green", "#2d6a45"],
  ["yellow", "#e0b03a"],
  ["other", "#8d6840"],
];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const app = document.querySelector("#app");

const state = {
  menu: null,
  menuError: "",
  category: "burgers",
  cart: loadJson("route66-cart", { lines: [] }),
  draft: loadJson("route66-draft", {}),
  ticketId: sessionStorage.getItem("route66-ticket-id") || "",
  order: null,
  busy: false,
  error: "",
  detailQty: 1,
};

let pollTimer = 0;

boot();

async function boot() {
  window.addEventListener("popstate", render);
  document.addEventListener("click", onNavigate);
  try {
    const response = await fetch("/api/menu");
    if (!response.ok) throw new Error("The menu did not load.");
    state.menu = await response.json();
    pruneCart();
  } catch (error) {
    state.menuError = error instanceof Error ? error.message : "The menu did not load.";
  }
  if (path() === "/ticket" && state.ticketId) await refreshOrder();
  render();
  startPoll();
}

function onNavigate(event) {
  const link = event.target instanceof Element ? event.target.closest("[data-nav]") : null;
  if (!link) return;
  event.preventDefault();
  go(link.getAttribute("data-nav") || "/");
}

function go(next) {
  if (next === path()) {
    render();
    return;
  }
  history.pushState({}, "", next);
  state.error = "";
  render();
  startPoll();
  window.scrollTo(0, 0);
}

function path() {
  const value = location.pathname.replace(/\/$/, "") || "/";
  return value;
}

function render() {
  const route = path();
  if (route.startsWith("/item/")) return renderItem(route.slice("/item/".length));
  if (route === "/cart") return renderCart();
  if (route === "/checkout" || route.startsWith("/checkout/")) return renderCheckout(route.split("/")[2] || "arrival");
  if (route === "/ticket") return renderTicket();
  if (route === "/find") return renderFind();
  return renderMenu();
}

function renderMenu() {
  const page = frame("Menu");
  const main = el("main", "screen");
  if (state.menuError) {
    main.append(errorBlock(state.menuError, () => location.reload()));
  } else if (!state.menu) {
    main.append(el("p", "status-copy", "Loading the menu…"));
  } else {
    const head = el("div", "screen-head");
    head.append(el("p", "kicker", "Austin"), el("h1", "display", "Order ahead"));
    head.append(el("p", "lede", `Open ${state.menu.open}–${state.menu.close}. Pull up when you are close. Pay at the window.`));
    main.append(head);
    const chips = el("div", "chips", "");
    chips.setAttribute("role", "tablist");
    for (const category of CATEGORIES) {
      const button = el("button", state.category === category.id ? "chip on" : "chip", category.label);
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", state.category === category.id ? "true" : "false");
      button.addEventListener("click", () => {
        state.category = category.id;
        render();
      });
      chips.append(button);
    }
    main.append(chips);
    const grid = el("div", "menu-grid");
    const items = itemsIn(state.category);
    if (items.length === 0) grid.append(el("p", "status-copy", "Nothing in this category."));
    for (const item of items) grid.append(menuCard(item));
    main.append(grid);
  }
  page.append(main);
  mount(page);
}

function menuCard(item) {
  const card = el("article", item.available ? "food-card" : "food-card sold");
  const open = el("button", "food-open");
  open.type = "button";
  open.setAttribute("data-nav", `/item/${item.sku}`);
  const copy = el("div", "food-copy");
  copy.append(el("h2", "food-name", item.name), el("p", "food-desc", item.description));
  const row = el("div", "food-meta");
  row.append(el("span", "price", usd(item.price_cents)), el("span", "quiet", item.available ? `${item.prep_minutes} min` : "Sold out"));
  copy.append(row);
  open.append(mark(item.sku), copy);
  card.append(open);
  const add = el("button", "add-one", item.available ? "Add" : "86");
  add.type = "button";
  add.disabled = !item.available;
  add.setAttribute("aria-label", item.available ? `Add ${item.name}` : `${item.name} is sold out`);
  add.addEventListener("click", () => addLine(item.sku, 1));
  card.append(add);
  return card;
}

function renderItem(sku) {
  if (state.detailSku !== sku) {
    state.detailSku = sku;
    state.detailQty = 1;
  }
  const item = itemBySku(sku);
  const page = frame(item ? item.name : "Item");
  const main = el("main", "screen narrow");
  if (!state.menu) {
    main.append(el("p", "status-copy", "Loading…"));
  } else if (!item) {
    main.append(errorBlock("That item is not on the menu.", () => go("/")));
  } else {
    const hero = el("div", "detail-hero");
    hero.append(mark(item.sku));
    main.append(hero);
    main.append(el("h1", "display", item.name));
    main.append(el("p", "price big", usd(item.price_cents)));
    main.append(el("p", "lede", item.description));
    const facts = el("ul", "facts");
    facts.append(fact(`${item.prep_minutes} min`, item.station));
    facts.append(fact(item.allergens.length ? item.allergens.join(", ") : "No major allergens listed", "Allergens"));
    if (!item.available) facts.append(fact(item.unavailable_reason || "Sold out", "86"));
    main.append(facts);
    if (item.available) {
      const qty = el("div", "stepper");
      const down = el("button", "step", "−");
      down.type = "button";
      down.setAttribute("aria-label", "Decrease quantity");
      down.addEventListener("click", () => {
        state.detailQty = Math.max(1, state.detailQty - 1);
        render();
      });
      const up = el("button", "step", "+");
      up.type = "button";
      up.setAttribute("aria-label", "Increase quantity");
      up.addEventListener("click", () => {
        state.detailQty = Math.min(8, state.detailQty + 1);
        render();
      });
      qty.append(down, el("strong", "step-count", String(state.detailQty)), up);
      main.append(qty);
      const bar = el("div", "action-bar");
      const button = el("button", "primary wide", `Add ${state.detailQty} · ${usd(item.price_cents * state.detailQty)}`);
      button.type = "button";
      button.addEventListener("click", () => {
        addLine(item.sku, state.detailQty);
        state.detailQty = 1;
        go("/cart");
      });
      bar.append(button);
      main.append(bar);
    } else {
      main.append(el("p", "status-copy", "This item is 86. Choose something else."));
    }
  }
  page.append(main);
  mount(page);
}

function renderCart() {
  const page = frame("Bag");
  const main = el("main", "screen narrow");
  main.append(el("h1", "display", "Your bag"));
  if (state.cart.lines.length === 0) {
    main.append(el("p", "lede", "Nothing in the bag yet."));
    const back = el("button", "primary", "See the menu");
    back.type = "button";
    back.setAttribute("data-nav", "/");
    main.append(back);
  } else {
    for (const line of state.cart.lines) main.append(cartRow(line));
    const sold = blockedLines();
    if (sold.length) main.append(el("p", "alert", `${sold.join(", ")} is sold out. Remove it before checkout.`));
    const summary = el("div", "summary");
    summary.append(lineRow("Food", usd(subtotalCents())));
    summary.append(el("p", "quiet", "Sales tax is added when the pit prices the ticket. Pay at the window."));
    main.append(summary);
    const bar = el("div", "action-bar");
    const next = el("button", "primary wide", "Checkout");
    next.type = "button";
    next.disabled = sold.length > 0;
    next.addEventListener("click", () => go("/checkout/arrival"));
    bar.append(next);
    main.append(bar);
  }
  page.append(main);
  mount(page);
}

function cartRow(line) {
  const item = itemBySku(line.sku);
  const row = el("article", "cart-row");
  row.append(mark(line.sku));
  const copy = el("div", "cart-copy");
  copy.append(el("h2", "food-name", item?.name || line.sku));
  copy.append(el("p", "price", item ? usd(item.price_cents * line.qty) : ""));
  if (item && !item.available) copy.append(el("p", "alert", "Sold out"));
  const stepper = el("div", "stepper compact");
  const down = el("button", "step", "−");
  down.type = "button";
  down.setAttribute("aria-label", `Fewer ${item?.name || "items"}`);
  down.addEventListener("click", () => setQty(line.sku, line.qty - 1));
  const up = el("button", "step", "+");
  up.type = "button";
  up.disabled = line.qty >= 8 || !item?.available;
  up.setAttribute("aria-label", `More ${item?.name || "items"}`);
  up.addEventListener("click", () => setQty(line.sku, line.qty + 1));
  stepper.append(down, el("strong", "step-count", String(line.qty)), up);
  row.append(copy, stepper);
  return row;
}

function renderCheckout(step) {
  if (state.cart.lines.length === 0) {
    go("/cart");
    return;
  }
  const current = ["arrival", "vehicle", "review"].includes(step) ? step : "arrival";
  const page = frame("Checkout");
  const main = el("main", "screen narrow");
  main.append(el("h1", "display", "Checkout"));
  main.append(steps(current));
  if (state.error) main.append(el("p", "alert", state.error));
  if (current === "arrival") main.append(arrivalForm());
  if (current === "vehicle") main.append(vehicleForm());
  if (current === "review") main.append(reviewForm());
  page.append(main);
  mount(page);
}

function arrivalForm() {
  const form = el("form", "stack");
  form.append(el("p", "lede", "When should the bag be ready?"));
  const label = el("label", "", "Arrival time");
  label.setAttribute("for", "eta");
  const input = document.createElement("input");
  input.id = "eta";
  input.type = "datetime-local";
  input.required = true;
  input.value = state.draft.eta || defaultEta();
  form.append(label, input);
  if (state.menu) form.append(el("p", "quiet", `The lot is open ${state.menu.open}–${state.menu.close} ${state.menu.timezone}.`));
  const button = el("button", "primary wide", "Continue");
  button.type = "submit";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    state.draft.eta = input.value;
    saveJson("route66-draft", state.draft);
    go("/checkout/vehicle");
  });
  form.append(button);
  return form;
}

function vehicleForm() {
  const form = el("form", "stack");
  form.append(el("p", "lede", "Who is pulling in, and in what car?"));
  form.append(field("Name on the bag", "name", state.draft.name || "", "text"));
  form.append(field("Car plate", "plate", state.draft.plate || "", "text"));
  const colorLabel = el("p", "field-label", "Color");
  const colors = el("div", "colors");
  for (const [name, hex] of COLORS) {
    const button = el("button", state.draft.color === name ? "swatch on" : "swatch", name);
    button.type = "button";
    button.style.setProperty("--swatch", hex);
    button.addEventListener("click", () => {
      const data = new FormData(form);
      state.draft.name = String(data.get("name") || "");
      state.draft.plate = String(data.get("plate") || "");
      state.draft.model = String(data.get("model") || "");
      state.draft.color = name;
      saveJson("route66-draft", state.draft);
      render();
    });
    colors.append(button);
  }
  form.append(colorLabel, colors);
  form.append(field("Car, if you want it on the card", "model", state.draft.model || "", "text"));
  const button = el("button", "primary wide", "Review order");
  button.type = "submit";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    state.draft.name = String(data.get("name") || "").trim();
    state.draft.plate = String(data.get("plate") || "").trim();
    state.draft.model = String(data.get("model") || "").trim();
    if (!state.draft.color) {
      state.error = "Choose a color.";
      render();
      return;
    }
    saveJson("route66-draft", state.draft);
    state.error = "";
    go("/checkout/review");
  });
  form.append(button);
  return form;
}

function reviewForm() {
  const wrap = el("div", "stack");
  wrap.append(el("p", "lede", "Check the ticket, then send it to the pit."));
  for (const line of state.cart.lines) {
    const item = itemBySku(line.sku);
    wrap.append(lineRow(`${line.qty} × ${item?.name || line.sku}`, item ? usd(item.price_cents * line.qty) : ""));
  }
  wrap.append(lineRow("Food", usd(subtotalCents())));
  wrap.append(el("p", "quiet", "Sales tax is calculated by the pit. Pay at the window. We do not take a card in this demo."));
  wrap.append(lineRow("Arrive", state.draft.eta ? new Date(state.draft.eta).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }) : "Not set"));
  wrap.append(lineRow("Car", `${state.draft.color || ""} ${state.draft.plate || ""}`.trim()));
  const noteLabel = el("label", "", "Note for the pit");
  noteLabel.setAttribute("for", "notes");
  const notes = document.createElement("textarea");
  notes.id = "notes";
  notes.maxLength = 200;
  notes.rows = 3;
  notes.value = state.draft.notes || "";
  notes.placeholder = "No onion, please.";
  wrap.append(noteLabel, notes);
  const button = el("button", "primary wide", state.busy ? "Sending…" : "Send order");
  button.type = "button";
  button.disabled = state.busy;
  button.addEventListener("click", () => submitOrder(notes.value));
  wrap.append(button);
  return wrap;
}

async function submitOrder(notes) {
  state.busy = true;
  state.error = "";
  state.draft.notes = notes;
  saveJson("route66-draft", state.draft);
  render();
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_name: state.draft.name,
        car_plate: state.draft.plate,
        car_color: state.draft.color,
        car_model: state.draft.model,
        eta: new Date(state.draft.eta).toISOString(),
        notes,
        items: state.cart.lines.map((line) => ({ sku: line.sku, qty: line.qty })),
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "The pit could not take that order.");
    state.order = body.order;
    state.ticketId = body.order.id;
    sessionStorage.setItem("route66-ticket-id", body.order.id);
    state.cart = { lines: [] };
    saveJson("route66-cart", state.cart);
    state.busy = false;
    go("/ticket");
  } catch (error) {
    state.busy = false;
    state.error = error instanceof Error ? error.message : "The pit could not take that order.";
    render();
  }
}

function renderTicket() {
  const page = frame("Ticket");
  const main = el("main", "screen narrow");
  main.setAttribute("aria-live", "polite");
  if (!state.ticketId) {
    main.append(el("h1", "display", "No ticket yet"));
    main.append(el("p", "lede", "Send an order, or find one with the ticket number and plate."));
    const find = el("button", "primary", "Find a ticket");
    find.type = "button";
    find.setAttribute("data-nav", "/find");
    main.append(find);
  } else if (!state.order) {
    main.append(el("p", "status-copy", "Loading your ticket…"));
  } else {
    const order = state.order;
    main.append(el("p", "kicker", order.guest_here ? "At the stall" : "Your ticket"));
    main.append(el("h1", "display ticket-no", order.order_number));
    main.append(el("p", "plate-lg", order.car_plate));
    main.append(el("p", "lede", order.items.map((item) => `${item.qty} × ${item.name}`).join(", ")));
    main.append(el("p", "price", `${usd(order.subtotal_cents)} + ${usd(order.sales_tax_cents)} tax = ${usd(order.grand_total_cents)}`));
    main.append(el("p", "quiet", "Pay at the window."));
    main.append(timeline(order));
    if (state.error) main.append(el("p", "alert", state.error));
    const bar = el("div", "action-bar");
    if (order.status === "confirmed" && !order.kitchen_start_at) {
      const time = el("button", "primary wide", state.busy ? "Timing…" : "Time the grill");
      time.type = "button";
      time.disabled = state.busy;
      time.addEventListener("click", () => timeGrill());
      bar.append(time);
    }
    if (!order.guest_here && order.status !== "completed" && order.status !== "no_show") {
      const here = el("button", order.kitchen_start_at ? "primary wide" : "secondary wide", state.busy ? "Sending…" : "I'm at the stall");
      here.type = "button";
      here.disabled = state.busy;
      here.addEventListener("click", () => arrive());
      bar.append(here);
    }
    if (bar.childElementCount) main.append(bar);
    if (order.status === "completed") main.append(el("p", "lede", "This ticket was picked up."));
  }
  page.append(main);
  mount(page);
}

function timeline(order) {
  const list = el("ol", "timeline");
  const steps = [
    ["Received", true],
    ["Grill timed", Boolean(order.kitchen_start_at)],
    ["On the grill", order.status === "cooking" || order.status === "ready" || order.status === "completed"],
    ["Ready for pickup", order.status === "ready" || order.status === "completed"],
  ];
  for (const [label, done] of steps) {
    const item = el("li", done ? "done" : "", label);
    list.append(item);
  }
  if (order.guest_here) list.append(el("li", "done", "Car is at the stall"));
  if (order.kitchen_start_at) {
    list.append(el("p", "quiet", `Grill ${clock(order.kitchen_start_at)}. Ready ${clock(order.ready_by)}.`));
  } else {
    list.append(el("p", "quiet", `Arrive ${order.eta_time}. The grill is not timed yet.`));
  }
  return list;
}

async function timeGrill() {
  state.busy = true;
  state.error = "";
  render();
  try {
    const response = await fetch("/api/agent/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order_id: state.ticketId }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "The pit could not time the grill.");
    if (body.decision?.decision === "refuse") throw new Error(body.decision.reason || "The pit could not time the grill.");
    state.order = body.order;
  } catch (error) {
    state.error = error instanceof Error ? error.message : "The pit could not time the grill.";
  } finally {
    state.busy = false;
    render();
  }
}

async function arrive() {
  state.busy = true;
  state.error = "";
  render();
  try {
    const response = await fetch(`/api/orders/${state.ticketId}/here`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not mark you at the stall.");
    state.order = body.order;
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Could not mark you at the stall.";
  } finally {
    state.busy = false;
    render();
  }
}

function renderFind() {
  const page = frame("Find ticket");
  const main = el("main", "screen narrow");
  main.append(el("h1", "display", "Find a ticket"));
  main.append(el("p", "lede", "Use the ticket number and the plate on that order."));
  if (state.error) main.append(el("p", "alert", state.error));
  const form = el("form", "stack");
  form.append(field("Ticket number", "number", "", "text"));
  form.append(field("Plate", "plate", "", "text"));
  const button = el("button", "primary wide", "Look up");
  button.type = "submit";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const params = new URLSearchParams({
      order_number: String(data.get("number") || ""),
      car_plate: String(data.get("plate") || ""),
    });
    const response = await fetch(`/api/orders/lookup?${params}`);
    const body = await response.json();
    if (!response.ok) {
      state.error = body.error || "No ticket matched.";
      render();
      return;
    }
    state.order = body.order;
    state.ticketId = body.order.id;
    sessionStorage.setItem("route66-ticket-id", body.order.id);
    state.error = "";
    go("/ticket");
  });
  form.append(button);
  main.append(form);
  page.append(main);
  mount(page);
}

function frame(title) {
  document.title = `${title} · Route 66 Drive-In`;
  const page = el("div", "app-frame");
  page.append(sidebar(), topbar());
  return page;
}

function mount(page) {
  page.append(tabbar(), footnote());
  app.replaceChildren(page);
}

function topbar() {
  const bar = el("header", "topbar");
  const brand = el("a", "brand", "");
  brand.href = "/";
  brand.setAttribute("data-nav", "/");
  brand.append(shield(), el("span", "brand-name", "Route 66"));
  const bag = el("a", "bag-link", `Bag ${count()}`);
  bag.href = "/cart";
  bag.setAttribute("data-nav", "/cart");
  bar.append(brand, bag);
  return bar;
}

function sidebar() {
  const side = el("aside", "side");
  const brand = el("a", "brand", "");
  brand.href = "/";
  brand.setAttribute("data-nav", "/");
  brand.append(shield(), el("span", "", ""));
  const title = el("span", "side-title");
  title.append(el("strong", "", "Route 66"), el("span", "quiet", "Drive-In · Austin"));
  brand.append(title);
  side.append(brand);
  side.append(navLink("/", "Menu"), navLink("/cart", `Bag (${count()})`), navLink("/ticket", "Ticket"), navLink("/find", "Find ticket"));
  if (state.menu && path() === "/") {
    const list = el("div", "side-cats");
    for (const category of CATEGORIES) {
      const button = el("button", state.category === category.id ? "side-cat on" : "side-cat", category.label);
      button.type = "button";
      button.addEventListener("click", () => {
        state.category = category.id;
        render();
      });
      list.append(button);
    }
    side.append(list);
  }
  return side;
}

function tabbar() {
  const bar = el("nav", "tabbar");
  bar.append(tab("/", "Menu"), tab("/cart", count() ? `Bag ${count()}` : "Bag"), tab("/ticket", "Ticket"));
  return bar;
}

function tab(href, label) {
  const link = el("a", path() === href ? "tab on" : "tab", label);
  link.href = href;
  link.setAttribute("data-nav", href);
  return link;
}

function navLink(href, label) {
  const link = el("a", path() === href ? "side-link on" : "side-link", label);
  link.href = href;
  link.setAttribute("data-nav", href);
  return link;
}

function footnote() {
  const note = el("footer", "footnote");
  note.append(el("p", "", "Demo lot in Austin. Fire times are calculated on this server. This is not a live model, and we do not take a card."));
  const staff = el("a", "", "Staff");
  staff.href = "/kitchen.html";
  note.append(staff);
  return note;
}

function steps(current) {
  const row = el("ol", "steps");
  for (const [id, label] of [["arrival", "Arrival"], ["vehicle", "Vehicle"], ["review", "Review"]]) {
    const item = el("li", id === current ? "on" : "", label);
    if (["arrival", "vehicle", "review"].indexOf(id) < ["arrival", "vehicle", "review"].indexOf(current)) item.classList.add("done");
    row.append(item);
  }
  return row;
}

function field(labelText, name, value, type) {
  const wrap = el("div", "field");
  const label = el("label", "", labelText);
  const input = document.createElement("input");
  input.name = name;
  input.id = name;
  input.type = type;
  input.value = value;
  input.required = name !== "model";
  input.autocomplete = name === "name" ? "name" : "off";
  if (name === "plate") input.maxLength = 12;
  label.setAttribute("for", name);
  wrap.append(label, input);
  return wrap;
}

function fact(value, label) {
  const item = el("li", "");
  item.append(el("span", "quiet", label), el("strong", "", value));
  return item;
}

function lineRow(left, right) {
  const row = el("div", "line");
  row.append(el("span", "", left), el("span", "", right));
  return row;
}

function errorBlock(message, retry) {
  const box = el("div", "stack");
  box.append(el("p", "alert", message));
  const button = el("button", "primary", "Try again");
  button.type = "button";
  button.addEventListener("click", retry);
  box.append(button);
  return box;
}

function shield() {
  return el("span", "shield", "66");
}

function mark(sku) {
  const wrap = el("div", "mark");
  wrap.append(foodMark(sku));
  return wrap;
}

function addLine(sku, qty) {
  const item = itemBySku(sku);
  if (!item?.available) return;
  const existing = state.cart.lines.find((line) => line.sku === sku);
  if (existing) existing.qty = Math.min(8, existing.qty + qty);
  else state.cart.lines.push({ sku, qty: Math.min(8, qty) });
  saveJson("route66-cart", state.cart);
  render();
}

function setQty(sku, qty) {
  if (qty <= 0) state.cart.lines = state.cart.lines.filter((line) => line.sku !== sku);
  else {
    const line = state.cart.lines.find((entry) => entry.sku === sku);
    if (line) line.qty = Math.min(8, qty);
  }
  saveJson("route66-cart", state.cart);
  render();
}

function pruneCart() {
  state.cart.lines = state.cart.lines.filter((line) => itemBySku(line.sku));
  saveJson("route66-cart", state.cart);
}

function blockedLines() {
  return state.cart.lines
    .filter((line) => itemBySku(line.sku) && !itemBySku(line.sku).available)
    .map((line) => itemBySku(line.sku).name);
}

function itemsIn(category) {
  return (state.menu?.items || []).filter((item) => categoryOf(item.sku) === category);
}

function categoryOf(sku) {
  if (sku.includes("burger")) return "burgers";
  if (sku === "chili-dog") return "dogs";
  if (sku === "fries" || sku === "onion-rings") return "sides";
  if (sku.includes("shake") || sku === "root-beer-float") return "shakes";
  return "drinks";
}

function itemBySku(sku) {
  return state.menu?.items?.find((item) => item.sku === sku);
}

function count() {
  return state.cart.lines.reduce((sum, line) => sum + line.qty, 0);
}

function subtotalCents() {
  return state.cart.lines.reduce((sum, line) => {
    const item = itemBySku(line.sku);
    return sum + (item ? item.price_cents * line.qty : 0);
  }, 0);
}

function usd(cents) {
  return money.format(cents / 100);
}

function clock(iso) {
  if (!iso) return "not set";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: state.menu?.timezone || "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

function defaultEta() {
  const date = new Date(Date.now() + 45 * 60_000);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function refreshOrder() {
  if (!state.ticketId) return;
  const response = await fetch(`/api/orders/${state.ticketId}`);
  if (!response.ok) return;
  const body = await response.json();
  const next = JSON.stringify(body.order);
  const previous = JSON.stringify(state.order);
  state.order = body.order;
  if (path() === "/ticket" && next !== previous) render();
}

function startPoll() {
  clearInterval(pollTimer);
  if (path() === "/ticket" && state.ticketId) pollTimer = setInterval(refreshOrder, 5000);
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "") || fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
