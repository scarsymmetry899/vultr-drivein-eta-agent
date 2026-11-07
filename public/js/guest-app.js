import { presentIsoClocks, serviceFootnote } from "./clocks.js";
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
const LIGHT_CARS = new Set(["white", "silver", "yellow"]);
const STEPS = [
  ["arrival", "Arrival"],
  ["vehicle", "Vehicle"],
  ["review", "Review"],
];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const app = document.querySelector("#app");
const desk = window.matchMedia("(min-width: 960px)");

const state = {
  menu: null,
  menuError: "",
  category: "burgers",
  cart: loadJson("route66-cart", { lines: [] }),
  draft: loadJson("route66-draft", {}),
  ticketId: sessionStorage.getItem("route66-ticket-id") || "",
  order: null,
  busy: false,
  busyAction: "",
  notice: "",
  error: "",
  service: null,
  detailQty: 1,
  detailSku: "",
  otherTime: false,
};

let pollTimer = 0;
let tickTimer = 0;
let live = null;

boot();

async function boot() {
  window.addEventListener("popstate", () => {
    render();
    startPoll();
  });
  document.addEventListener("click", onNavigate);
  desk.addEventListener("change", render);
  try {
    const health = await fetch("/api/health");
    if (health.ok) state.service = await health.json();
  } catch {
    state.service = null;
  }
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
  if (event.metaKey || event.ctrlKey || event.shiftKey) return;
  event.preventDefault();
  go(link.getAttribute("data-nav") || "/");
}

function go(next) {
  if (next !== path()) history.pushState({}, "", next);
  state.error = "";
  render();
  startPoll();
  window.scrollTo(0, 0);
}

function path() {
  return location.pathname.replace(/\/$/, "") || "/";
}

function render() {
  live = null;
  const route = path();
  if (route.startsWith("/item/")) return renderItem(route.slice("/item/".length));
  if (route === "/cart") return renderCart();
  if (route === "/checkout" || route.startsWith("/checkout/")) return renderCheckout(route.split("/")[2] || "arrival");
  if (route === "/ticket") return renderTicket();
  if (route === "/find") return renderFind();
  return renderMenu();
}

/* ------------------------------------------------------------------ menu */

function renderMenu() {
  const { page, main } = frame("Menu", { rail: true, nav: "/" });
  if (state.menuError) {
    main.append(errorBlock(state.menuError, () => location.reload()));
  } else if (!state.menu) {
    main.append(el("p", "muted", "Loading the menu…"));
  } else {
    main.append(hero());
    const chips = el("div", "chips");
    chips.setAttribute("role", "tablist");
    chips.setAttribute("aria-label", "Menu categories");
    for (const category of CATEGORIES) {
      const on = state.category === category.id;
      const button = el("button", on ? "chip on" : "chip", category.label);
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", on ? "true" : "false");
      button.addEventListener("click", () => pickCategory(category.id));
      chips.append(button);
    }
    main.append(chips);
    const grid = el("div", "menu-grid");
    const items = itemsIn(state.category);
    if (items.length === 0) grid.append(el("p", "muted", "Nothing in this category."));
    for (const item of items) grid.append(menuCard(item));
    main.append(grid);
  }
  mount(page, main, bagRail());
}

function pickCategory(id) {
  state.category = id;
  render();
}

function hero() {
  const outer = el("section", "hero");
  outer.setAttribute("aria-labelledby", "hero-title");
  const inner = el("div", "hero-inner");
  const copy = el("div");
  copy.append(el("p", "hero-kicker", "South Congress · Austin"));
  const title = el("h1", "", "Order ahead");
  title.id = "hero-title";
  copy.append(title, el("p", "hero-lede", `Open ${hoursLabel()}. Pull up when you are close. Pay at the window.`));
  const chips = el("div", "hero-chips");
  const open = lotOpenNow();
  chips.append(el("span", open ? "pill-open" : "pill-open closed", open ? "Lot open" : `Lot closed · opens ${plainClock(state.menu?.open || "11:00")}`));
  chips.append(el("span", "pill-line", "Grill timed to your ETA"));
  inner.append(copy, chips);
  outer.append(inner);
  return outer;
}

function menuCard(item) {
  const card = el("article", item.available ? "food-card" : "food-card sold");
  const markButton = el("button", "food-mark");
  markButton.type = "button";
  markButton.setAttribute("data-nav", `/item/${item.sku}`);
  markButton.setAttribute("aria-label", `About ${item.name}`);
  markButton.append(foodMark(item.sku));
  const copy = el("div", "food-copy");
  const name = el("h2", "food-name");
  const open = el("button", "link-btn", item.name);
  open.type = "button";
  open.setAttribute("data-nav", `/item/${item.sku}`);
  name.append(open);
  copy.append(name, el("p", "food-desc", item.description));
  const meta = el("div", "food-meta");
  meta.append(el("span", "price", usd(item.price_cents)), el("span", "prep", item.available ? `${item.prep_minutes} min` : "Sold out"));
  const action = el("div", "food-action");
  if (item.available) {
    const add = el("button", "btn-add", "Add");
    add.type = "button";
    add.setAttribute("aria-label", `Add ${item.name}`);
    add.addEventListener("click", () => addLine(item.sku, 1));
    action.append(add);
  } else {
    const sold = el("span", "eighty-six", "86");
    sold.setAttribute("aria-label", `${item.name} is sold out`);
    action.append(sold);
  }
  card.append(markButton, copy, meta, action);
  return card;
}

function bagRail() {
  const rail = el("aside", "rail");
  rail.setAttribute("aria-label", "Your bag");
  rail.append(bagCard({ checkout: true }));
  return rail;
}

function bagCard({ checkout }) {
  const card = el("div", "bag-card");
  const head = el("div", "bag-head");
  head.append(el("h2", "", "Your bag"), el("span", "", `${count()} ${count() === 1 ? "item" : "items"}`));
  card.append(head);
  if (state.cart.lines.length === 0) {
    card.append(el("p", "fine", "Nothing in the bag yet. Tap Add on anything from the menu."));
  } else {
    const lines = el("div", "bag-lines");
    for (const line of state.cart.lines) {
      const item = itemBySku(line.sku);
      lines.append(lineRow(`${line.qty} × ${item?.name || line.sku}`, item ? usd(item.price_cents * line.qty) : "", "bag-line"));
    }
    card.append(lines);
  }
  card.append(lineRow("Food", usd(subtotalCents()), "total-row"));
  card.append(el("p", "fine", "Sales tax is added when the pit prices the ticket. Pay at the window."));
  const sold = blockedLines();
  if (sold.length) card.append(el("p", "alert", `${sold.join(", ")} is sold out. Remove it before checkout.`));
  if (checkout) {
    const button = el("button", "btn btn-primary btn-wide", "Checkout");
    button.type = "button";
    button.disabled = state.cart.lines.length === 0 || sold.length > 0;
    button.addEventListener("click", () => go("/checkout/arrival"));
    card.append(button);
  }
  return card;
}

/* ------------------------------------------------------------------ item */

function renderItem(sku) {
  if (state.detailSku !== sku) {
    state.detailSku = sku;
    state.detailQty = 1;
  }
  const item = itemBySku(sku);
  const { page, main } = frame(item ? item.name : "Item", { nav: "/" });
  main.classList.add("narrow");
  if (!state.menu) {
    main.append(el("p", "muted", "Loading…"));
  } else if (!item) {
    main.append(errorBlock("That item is not on the menu.", () => go("/")));
  } else {
    const wrap = el("div", "detail");
    const back = el("a", "back", "←");
    back.href = "/";
    back.setAttribute("data-nav", "/");
    back.setAttribute("aria-label", "Back to the menu");
    const art = el("div", "detail-hero");
    art.append(mark(item.sku));
    const head = el("div");
    head.append(el("h1", "display", item.name), el("p", "detail-price", usd(item.price_cents)), el("p", "lede", item.description));
    const facts = el("ul", "facts");
    facts.append(fact("Prep", `${item.prep_minutes} min`), fact("Station", item.station));
    facts.append(fact("Allergens", item.allergens.length ? item.allergens.join(", ") : "None listed"));
    facts.append(fact("Status", item.available ? "Available" : item.unavailable_reason || "Sold out"));
    wrap.append(back, art, head, facts);
    if (item.available) {
      const buy = el("div", "detail-buy");
      buy.append(stepper(state.detailQty, (next) => {
        state.detailQty = Math.max(1, Math.min(8, next));
        render();
      }, item.name, state.detailQty <= 1, state.detailQty >= 8));
      const add = el("button", "btn btn-primary", `Add ${state.detailQty} · ${usd(item.price_cents * state.detailQty)}`);
      add.type = "button";
      add.addEventListener("click", () => {
        addLine(item.sku, state.detailQty, false);
        state.detailQty = 1;
        go(desk.matches ? "/" : "/cart");
      });
      buy.append(add);
      wrap.append(buy);
    } else {
      wrap.append(el("p", "alert", "This item is 86. Choose something else."));
    }
    main.append(wrap);
  }
  mount(page, main);
}

/* ------------------------------------------------------------------ cart */

function renderCart() {
  const { page, main } = frame("Bag", { nav: "/cart" });
  main.classList.add("cart-page");
  const head = el("div", "page-head");
  head.append(el("h1", "", "Your bag"));
  main.append(head);
  if (state.cart.lines.length === 0) {
    const empty = el("div", "empty-state");
    empty.append(el("p", "lede", "Nothing in the bag yet."));
    const back = el("button", "btn btn-primary", "See the menu");
    back.type = "button";
    back.setAttribute("data-nav", "/");
    empty.append(back);
    main.append(empty);
  } else {
    const list = el("div", "cart-list");
    for (const line of state.cart.lines) list.append(cartRow(line));
    main.append(list);
    const summary = bagCard({ checkout: true });
    summary.classList.add("summary-card");
    summary.querySelector(".bag-lines")?.remove();
    main.append(summary);
  }
  mount(page, main);
}

function cartRow(line) {
  const item = itemBySku(line.sku);
  const row = el("article", "cart-row");
  row.append(mark(line.sku));
  const copy = el("div");
  copy.append(el("h2", "", item?.name || line.sku), el("p", "price", item ? usd(item.price_cents * line.qty) : ""));
  if (item && !item.available) copy.append(el("p", "alert", "Sold out"));
  row.append(copy, stepper(line.qty, (next) => setQty(line.sku, next), item?.name || "items", false, line.qty >= 8 || !item?.available));
  return row;
}

function stepper(qty, onChange, label, downDisabled, upDisabled) {
  const wrap = el("div", "stepper");
  const down = el("button", "step", "−");
  down.type = "button";
  down.disabled = downDisabled;
  down.setAttribute("aria-label", `Fewer ${label}`);
  down.addEventListener("click", () => onChange(qty - 1));
  const up = el("button", "step", "+");
  up.type = "button";
  up.disabled = upDisabled;
  up.setAttribute("aria-label", `More ${label}`);
  up.addEventListener("click", () => onChange(qty + 1));
  const value = el("strong", "step-count", String(qty));
  value.setAttribute("aria-live", "polite");
  wrap.append(down, value, up);
  return wrap;
}

/* ------------------------------------------------------------------ checkout */

function renderCheckout(step) {
  if (state.cart.lines.length === 0) {
    history.replaceState({}, "", "/cart");
    return renderCart();
  }
  const current = STEPS.some(([id]) => id === step) ? step : "arrival";
  ensureEta();
  const { page, main } = frame("Checkout", { nav: "/cart", flow: true, topbar: false });
  if (current === "review") {
    main.append(checkoutTop("/checkout/vehicle"), checkoutHead("review", true));
    if (state.error) main.append(el("p", "alert", state.error));
    main.append(reviewView());
  } else if (desk.matches) {
    main.append(checkoutHead("vehicle", true));
    if (state.error) main.append(el("p", "alert", state.error));
    main.append(detailsForm());
  } else if (current === "arrival") {
    main.append(checkoutTop("/cart"), checkoutHead("arrival", true));
    if (state.error) main.append(el("p", "alert", state.error));
    main.append(arrivalStep());
  } else {
    main.append(checkoutTop("/checkout/arrival"), checkoutHead("vehicle", false));
    if (state.error) main.append(el("p", "alert", state.error));
    main.append(vehicleStep());
  }
  mount(page, main);
}

function checkoutTop(backTo) {
  const row = el("div", "checkout-top");
  const back = el("a", "back", "←");
  back.href = backTo;
  back.setAttribute("data-nav", backTo);
  back.setAttribute("aria-label", "Back");
  row.append(back, el("span", "bag-sum", `Bag · ${count()} ${count() === 1 ? "item" : "items"} · ${usd(subtotalCents())}`));
  return row;
}

function checkoutHead(current, withTitle) {
  const head = el("div", "checkout-head");
  if (withTitle) head.append(el("h1", "", "Checkout"));
  const list = el("ol", "progress");
  list.setAttribute("aria-label", "Checkout steps");
  const index = STEPS.findIndex(([id]) => id === current);
  STEPS.forEach(([id, label], i) => {
    let text = label;
    if (i < index && id === "arrival") text = `Arrival · ${shortLocal(etaDate())}`;
    const item = el("li", i < index ? "done" : i === index ? "on" : "", text);
    if (i === index) item.setAttribute("aria-current", "step");
    list.append(item);
  });
  head.append(list);
  return head;
}

function slotTimes(now = new Date()) {
  const step = 10 * 60_000;
  let at = Math.ceil((now.getTime() + 10 * 60_000) / step) * step;
  const limit = now.getTime() + 17.5 * 3_600_000;
  const out = [];
  while (out.length < 9 && at < limit) {
    const when = new Date(at);
    if (!outsideAustinHours(when)) out.push(when);
    at += step;
  }
  return out;
}

function ensureEta() {
  const current = state.draft.eta ? new Date(state.draft.eta) : null;
  const stale = !current || Number.isNaN(current.getTime()) || current.getTime() < Date.now() + 2 * 60_000;
  if (!stale) return;
  const slots = slotTimes();
  if (slots.length === 0) return;
  state.draft.eta = slots[Math.min(2, slots.length - 1)].toISOString();
  saveJson("route66-draft", state.draft);
}

function etaDate() {
  const when = state.draft.eta ? new Date(state.draft.eta) : null;
  return when && !Number.isNaN(when.getTime()) ? when : null;
}

function arrivalPanel() {
  const frag = document.createDocumentFragment();
  const when = etaDate();
  frag.append(el("p", "panel-q", "When will you pull in?"));
  const big = el("div", "big-time");
  const parts = when ? localParts(when) : { time: "--:--", period: "" };
  big.append(el("strong", "", parts.time), el("span", "", parts.period));
  frag.append(big, el("p", "time-date", when ? `${dayLabel(when)} · Your local time` : "Pick a time"));

  const slots = slotTimes();
  const grid = el("div", "slots");
  grid.setAttribute("role", "radiogroup");
  grid.setAttribute("aria-label", "Arrival time");
  for (const slot of slots) {
    const on = when && slot.getTime() === when.getTime();
    const button = el("button", on ? "slot on" : "slot", localParts(slot).time);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", on ? "true" : "false");
    const overnight = austinWeekday(slot) !== austinWeekday(new Date());
    button.textContent = overnight ? `${localParts(slot).time} ${austinWeekday(slot)}` : localParts(slot).time;
    button.setAttribute("aria-label", `${shortLocal(slot)} ${dayLabel(slot)}`);
    button.addEventListener("click", () => {
      state.draft.eta = slot.toISOString();
      state.otherTime = false;
      state.error = "";
      saveJson("route66-draft", state.draft);
      render();
    });
    grid.append(button);
  }
  if (slots.length === 0) grid.append(el("p", "muted", "No pickup times are open in the next day."));
  frag.append(grid);

  const toggle = el("button", "text-btn", state.otherTime ? "Hide other times" : "Pick another time");
  toggle.type = "button";
  toggle.addEventListener("click", () => {
    state.otherTime = !state.otherTime;
    render();
  });
  frag.append(toggle);
  if (state.otherTime) {
    const other = el("div", "other-time");
    const label = el("label", "", "Your local time");
    label.setAttribute("for", "eta");
    const input = document.createElement("input");
    input.id = "eta";
    input.type = "datetime-local";
    input.className = "input";
    input.value = when ? localInputValue(when) : "";
    input.addEventListener("change", () => {
      const next = new Date(input.value);
      if (Number.isNaN(next.getTime())) return;
      state.draft.eta = next.toISOString();
      saveJson("route66-draft", state.draft);
      render();
    });
    other.append(label, input);
    frag.append(other);
  }

  frag.append(hoursCard(when));
  const preview = el("p", when && outsideAustinHours(when) ? "preview bad" : "preview", arrivalPreview(when));
  preview.setAttribute("aria-live", "polite");
  frag.append(preview);
  return frag;
}

function hoursCard(when) {
  const card = el("div", "hours-card");
  const head = el("div", "hours-head");
  head.append(el("span", "", "Lot hours"), el("span", "", "Austin time"));
  const [open, close] = hoursRange();
  const span = close - open;
  const track = el("div", "hours-track");
  track.setAttribute("aria-hidden", "true");
  if (when) {
    const minutes = austinMinutes(when);
    const off = minutes < open || minutes > close;
    if (off) track.classList.add("off");
    const pct = `${Math.max(0, Math.min(100, ((minutes - open) / span) * 100)).toFixed(2)}%`;
    const tick = el("span", "hours-tick");
    tick.style.left = pct;
    const dot = el("span", "hours-dot");
    dot.style.left = pct;
    track.append(tick, dot);
  }
  const labels = el("div", "hours-labels");
  const marks = [open, open + Math.round(span / 3 / 60) * 60, open + Math.round((span * 2) / 3 / 60) * 60, close];
  for (const minute of marks) {
    const tag = el("span", "", hourLabel(minute));
    tag.style.left = `${(((minute - open) / span) * 100).toFixed(2)}%`;
    labels.append(tag);
  }
  card.append(head, track, labels);
  return card;
}

function vehiclePanel(onSubmitLabel) {
  const frag = document.createDocumentFragment();
  frag.append(el("p", "panel-q", "Who is pulling in, and in what car?"));
  const color = state.draft.color || "red";
  const stage = el("div", "car-stage");
  stage.style.setProperty("--car", colorHex(color));
  stage.style.setProperty("--car-ink", LIGHT_CARS.has(color) ? "#1c1612" : "#f3eee6");
  const plateCard = plateNode(state.draft.plate, `Pulling in ${etaDate() ? shortLocal(etaDate()) : ""}`.trim());
  const caption = el("p", "car-caption", carCaption(color, state.draft.name));
  stage.append(plateCard, caption);
  frag.append(stage);

  const fields = el("div", "fields");
  const name = inputField("Name on the bag", "name", state.draft.name || "", { autocomplete: "name", maxLength: 40 });
  const plate = inputField("Car plate", "plate", state.draft.plate || "", { maxLength: 12, className: "plate-input", autocomplete: "off" });
  name.input.addEventListener("input", () => {
    state.draft.name = name.input.value;
    saveJson("route66-draft", state.draft);
    caption.textContent = carCaption(state.draft.color || "red", state.draft.name);
  });
  plate.input.addEventListener("input", () => {
    const value = plate.input.value.toUpperCase().slice(0, 12);
    if (plate.input.value !== value) plate.input.value = value;
    state.draft.plate = value;
    saveJson("route66-draft", state.draft);
    plateCard.querySelector(".plate-text").textContent = value.trim() || "———";
  });
  fields.append(name.wrap, plate.wrap);

  const colorWrap = el("div", "field wide");
  const colorLabel = el("span", "", "Color");
  colorLabel.id = "color-label";
  const colors = el("div", "colors");
  colors.setAttribute("role", "radiogroup");
  colors.setAttribute("aria-labelledby", "color-label");
  for (const [swatchName, hex] of COLORS) {
    const on = (state.draft.color || "") === swatchName;
    const button = el("button", on ? "swatch on" : "swatch", swatchName);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", on ? "true" : "false");
    button.style.setProperty("--swatch", hex);
    button.addEventListener("click", () => {
      state.draft.color = swatchName;
      saveJson("route66-draft", state.draft);
      render();
    });
    colors.append(button);
  }
  colorWrap.append(colorLabel, colors);
  fields.append(colorWrap);
  frag.append(fields);
  if (onSubmitLabel) {
    const submit = el("button", "btn btn-primary btn-wide", onSubmitLabel);
    submit.type = "submit";
    frag.append(submit);
  }
  return frag;
}

function arrivalStep() {
  const form = el("form");
  form.noValidate = true;
  form.append(arrivalPanel());
  const dock = el("div", "dock");
  const next = el("button", "btn btn-primary btn-wide", "Continue");
  next.type = "submit";
  dock.append(next);
  form.append(dock);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const problem = etaProblem();
    if (problem) return fail(problem);
    go("/checkout/vehicle");
  });
  return form;
}

function vehicleStep() {
  const form = el("form");
  form.noValidate = true;
  form.append(vehiclePanel(""));
  const dock = el("div", "dock");
  const next = el("button", "btn btn-primary btn-wide", "Review order");
  next.type = "submit";
  dock.append(next);
  form.append(dock);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const problem = vehicleProblem() || etaProblem();
    if (problem) return fail(problem);
    go("/checkout/review");
  });
  return form;
}

function detailsForm() {
  const form = el("form", "checkout-grid");
  form.noValidate = true;
  const left = el("section", "card-panel");
  left.setAttribute("aria-label", "Arrival");
  left.append(arrivalPanel());
  const right = el("section", "card-panel vehicle-panel");
  right.setAttribute("aria-label", "Vehicle");
  right.append(vehiclePanel(`Review order · ${usd(subtotalCents())}`));
  form.append(left, right);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const problem = etaProblem() || vehicleProblem();
    if (problem) return fail(problem);
    go("/checkout/review");
  });
  return form;
}

function etaProblem() {
  const when = etaDate();
  if (!when) return "Pick an arrival time.";
  if (when.getTime() < Date.now() - 60_000) return "That arrival time has passed. Pick another.";
  if (outsideAustinHours(when)) return `${austinLabel(when)} is outside Austin lot hours (${hoursLabel()}). Pick a time while the lot is open.`;
  return "";
}

function vehicleProblem() {
  if (!(state.draft.name || "").trim()) return "Add the name for the bag.";
  if (!(state.draft.plate || "").trim()) return "Add the car plate.";
  if (!state.draft.color) return "Choose a color.";
  return "";
}

function fail(message) {
  state.error = message;
  render();
  window.scrollTo(0, 0);
}

function reviewView() {
  const problem = etaProblem() || vehicleProblem();
  const grid = el("div", "review-grid");
  const orderCard = el("section", "review-card");
  orderCard.append(el("h2", "", "Your order"));
  const lines = el("div", "bag-lines");
  for (const line of state.cart.lines) {
    const item = itemBySku(line.sku);
    lines.append(lineRow(`${line.qty} × ${item?.name || line.sku}`, item ? usd(item.price_cents * line.qty) : "", "bag-line"));
  }
  orderCard.append(lines, lineRow("Food", usd(subtotalCents()), "total-row"));
  orderCard.append(el("p", "fine", "Sales tax is calculated by the pit. Pay at the window. We do not take a card in this demo."));
  orderCard.append(payChoice());
  orderCard.append(watchChoice());

  const carCard = el("section", "review-card");
  carCard.append(el("h2", "", "Pulling in"));
  const when = etaDate();
  const color = state.draft.color || "red";
  const stage = el("div", "car-stage");
  stage.style.setProperty("--car", colorHex(color));
  stage.style.setProperty("--car-ink", LIGHT_CARS.has(color) ? "#1c1612" : "#f3eee6");
  stage.append(plateNode(state.draft.plate, `Pulling in ${when ? shortLocal(when) : ""}`.trim()), el("p", "car-caption", carCaption(color, state.draft.name)));
  const kv = el("div", "kv");
  kv.append(kvItem("Your time", when ? localLabel(when) : "Not set"), kvItem("Austin time", when ? austinLabel(when) : "Not set"));
  const noteWrap = el("label", "field");
  noteWrap.append(document.createTextNode("Note for the pit"));
  const notes = document.createElement("textarea");
  notes.className = "input";
  notes.id = "notes";
  notes.maxLength = 200;
  notes.rows = 3;
  notes.value = state.draft.notes || "";
  notes.placeholder = "No onion, please.";
  notes.addEventListener("input", () => {
    state.draft.notes = notes.value;
    saveJson("route66-draft", state.draft);
  });
  noteWrap.append(notes);
  const send = el("button", "btn btn-primary btn-wide", state.busy ? "Sending…" : `Send order · ${usd(subtotalCents())}`);
  send.type = "button";
  send.disabled = state.busy || Boolean(problem) || blockedLines().length > 0;
  send.addEventListener("click", () => submitOrder(notes.value));
  carCard.append(stage, kv, noteWrap);
  if (problem) carCard.append(el("p", "alert", problem));
  if (desk.matches) carCard.append(send);
  grid.append(orderCard, carCard);
  if (!desk.matches) {
    const dock = el("div", "dock");
    dock.append(send);
    grid.append(dock);
  }
  return grid;
}

async function submitOrder(notes) {
  if (state.busy) return;
  state.busy = true;
  state.busyAction = "send";
  state.error = "";
  state.draft.notes = notes;
  saveJson("route66-draft", state.draft);
  render();
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_name: (state.draft.name || "").trim(),
        car_plate: (state.draft.plate || "").trim(),
        car_color: state.draft.color,
        car_model: (state.draft.model || "").trim(),
        eta: new Date(state.draft.eta).toISOString(),
        notes,
        arrival_opt_in: state.draft.arrivalOptIn === true,
        payment: state.draft.payment || "pay_at_window",
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
    state.draft.eta = "";
    state.draft.notes = "";
    saveJson("route66-draft", state.draft);
    state.busy = false;
    state.busyAction = "";
    go("/ticket");
  } catch (error) {
    state.busy = false;
    state.busyAction = "";
    state.error = error instanceof Error ? error.message : "The pit could not take that order.";
    render();
  }
}

/* ------------------------------------------------------------------ ticket */

function renderTicket() {
  const { page, main } = frame("Ticket", { nav: "/ticket", topbar: false });
  main.classList.add("ticket-page");
  main.setAttribute("aria-live", "polite");
  if (!state.ticketId) {
    const head = el("div", "page-head");
    head.append(el("p", "kicker", "Your ticket"), el("h1", "", "No ticket yet"));
    head.append(el("p", "lede", "Send an order, or find one with the ticket number and plate."));
    const actions = el("div", "empty-state");
    const find = el("button", "btn btn-primary", "Find a ticket");
    find.type = "button";
    find.setAttribute("data-nav", "/find");
    const menu = el("button", "btn btn-ghost", "See the menu");
    menu.type = "button";
    menu.setAttribute("data-nav", "/");
    actions.append(find, menu);
    main.append(head, actions);
  } else if (!state.order) {
    main.append(el("p", "muted", "Loading your ticket…"));
  } else {
    const order = state.order;
    main.append(ticketHead(order), fireCard(order));
    if (state.error) main.append(el("p", "alert", state.error));
    const cols = el("div", "ticket-cols");
    cols.append(stepsCard(order), decisionPanel(order));
    main.append(cols);
  }
  mount(page, main);
}

function ticketHead(order) {
  const head = el("div", "ticket-head");
  const title = el("div", "th-title");
  title.append(el("p", "kicker", order.guest_here ? "At the stall" : "Your ticket"));
  title.append(el("h1", "ticket-no", order.order_number));
  const info = el("div", "th-info");
  info.append(el("p", "ticket-items", order.items.map((item) => `${item.qty} × ${item.name}`).join(", ")));
  const moneyLine = el("p", "ticket-money");
  moneyLine.append(
    el("strong", "", usd(order.subtotal_cents)),
    document.createTextNode(` + ${usd(order.sales_tax_cents)} tax = `),
    el("strong", "", usd(order.grand_total_cents)),
    document.createTextNode(` · Arrival at the lot ${order.eta_time}. Pay at the window.`),
  );
  info.append(moneyLine);
  const plate = plateNode(order.car_plate, carCaption(order.car_color, order.customer_name));
  plate.className = "mini-plate";
  head.append(title, plate, info);
  return head;
}

function fireView(order, now) {
  const fire = order.kitchen_start_at ? Date.parse(order.kitchen_start_at) : null;
  const ready = order.ready_by ? Date.parse(order.ready_by) : null;
  const eta = Date.parse(order.eta_timestamp);
  if (order.status === "completed") return { phase: "ready", label: "Picked up", big: "Done", sub: "Thanks for stopping by", fire, ready, eta };
  if (order.status === "no_show") return { phase: "waiting", label: "Closed", big: "—", sub: "This ticket was closed", fire, ready, eta };
  if (order.status === "ready") return { phase: "ready", label: "Ready for pickup", big: "Bagged", sub: "walk-up at your plate", fire, ready, eta };
  if (order.status === "cooking") {
    const left = ready ? ready - now : 0;
    return { phase: "firing", label: "On the grill", big: left > 0 ? countdown(left) : "0:00", sub: left > 0 ? "until it is bagged" : "bagging it now", fire, ready, eta };
  }
  if (fire) {
    const left = fire - now;
    return {
      phase: "waiting",
      label: order.guest_here ? "Rush fire" : "Waiting",
      big: left > 0 ? countdown(left) : "0:00",
      sub: left > 0 ? "until the grill fires" : "the grill is starting",
      fire,
      ready,
      eta,
    };
  }
  return { phase: "untimed", label: "Not timed", big: "--:--", sub: "the grill has not been timed yet", fire, ready, eta };
}

function fireCard(order) {
  const view = fireView(order, Date.now());
  const card = el("section", `fire ${view.phase === "untimed" ? "waiting" : view.phase}`);
  card.setAttribute("aria-label", "Fire clock");
  const body = el("div", "fire-body");
  const left = el("div");
  const top = el("div", "fire-top");
  const status = el("span", "fire-status", view.label);
  const clockNode = el("span", "fire-clock", austinClock(new Date()));
  top.append(status, clockNode);
  const countRow = el("div", "fire-count");
  const big = el("strong", "", view.big);
  const sub = el("span", "", view.sub);
  countRow.append(big, sub);
  left.append(top, countRow);
  body.append(left);

  const points = [view.fire, view.ready, view.eta].filter((value) => value != null);
  const track = el("div", "lane-track");
  track.setAttribute("aria-hidden", "true");
  let nowMarker = null;
  let windowStart = 0;
  let windowEnd = 1;
  if (view.fire && view.ready) {
    const now = Date.now();
    windowStart = Math.min(...points) - 8 * 60_000;
    if (now < windowStart && now > windowStart - 25 * 60_000) windowStart = now - 2 * 60_000;
    windowEnd = Math.max(...points) + 5 * 60_000;
    const pos = (value) => `${Math.max(0, Math.min(100, ((value - windowStart) / (windowEnd - windowStart)) * 100)).toFixed(2)}%`;
    const cook = el("div", "cook");
    cook.style.left = pos(view.fire);
    cook.style.width = `calc(${pos(view.ready)} - ${pos(view.fire)})`;
    track.append(el("div", "rail-bg"), cook);
    track.append(trackTag("t-fire", "Fire", clockShort(order.kitchen_start_at), pos(view.fire), true));
    track.append(trackTag("t-arrive", "Arrive", clockShort(order.eta_timestamp), pos(view.eta), true));
    track.append(trackTag("t-ready", "Ready", clockShort(order.ready_by), pos(view.ready), false));
    nowMarker = el("div", "now");
    track.append(nowMarker);
    const ends = el("div", "ends");
    ends.append(el("span", "", clockShort(new Date(windowStart).toISOString())), el("span", "", clockShort(new Date(windowEnd).toISOString())));
    track.append(ends);
    body.append(track);
  } else {
    body.append(el("p", "fire-untimed", `Arrive ${order.eta_time}. Fire and ready times appear once the grill is timed.`));
  }
  card.append(body);

  live = {
    order,
    phase: view.phase,
    update() {
      const nowMs = Date.now();
      const next = fireView(order, nowMs);
      if (next.phase !== this.phase && !(this.phase === "untimed" && next.phase === "untimed")) return render();
      status.textContent = next.label;
      big.textContent = next.big;
      sub.textContent = next.sub;
      clockNode.textContent = austinClock(new Date(nowMs));
      if (nowMarker) {
        const pct = ((nowMs - windowStart) / (windowEnd - windowStart)) * 100;
        nowMarker.hidden = pct < 0 || pct > 100;
        nowMarker.style.left = `${Math.max(0, Math.min(100, pct)).toFixed(2)}%`;
      }
    },
  };
  live.update();
  return card;
}

function trackTag(kind, label, time, left, labelFirst) {
  const tag = el("div", `tag ${kind}`);
  tag.style.left = left;
  const value = el("b", "", time);
  if (labelFirst) tag.append(document.createTextNode(label), value);
  else tag.append(value, document.createTextNode(label));
  return tag;
}

function stepsCard(order) {
  const card = el("section", "steps-card");
  card.setAttribute("aria-label", "Ticket progress");
  const list = el("ol", "steps");
  const cooking = ["cooking", "ready", "completed"].includes(order.status);
  const bagged = ["ready", "completed"].includes(order.status);
  const rows = [
    ["Received", true, clockShort(order.created_at)],
    ["Grill timed", Boolean(order.kitchen_start_at), ""],
    ["On the grill", cooking, cooking ? clockShort(order.kitchen_start_at) : ""],
    ["Ready for pickup", bagged, bagged ? clockShort(order.ready_by) : ""],
  ];
  if (order.guest_here) rows.push(["Car is at the stall", true, clockShort(order.arrived_at)]);
  if (order.status === "completed") rows.push(["Picked up", true, clockShort(order.updated_at)]);
  for (const [label, done, time] of rows) {
    const item = el("li", done ? "done" : "");
    item.append(el("span", "", label));
    const stamp = el("time", "", time || "");
    item.append(stamp);
    list.append(item);
  }
  card.append(list);
  card.append(el("p", "fine", nextStep(order)));
  if (state.notice) card.append(el("p", "fine", state.notice));

  const open = order.status !== "completed" && order.status !== "no_show";
  if (order.status === "confirmed" && !order.kitchen_start_at) {
    const time = el("button", "btn btn-primary btn-wide", state.busyAction === "time" ? "Timing the grill…" : "Time the grill");
    time.type = "button";
    time.disabled = state.busy;
    time.setAttribute("aria-busy", state.busy ? "true" : "false");
    time.addEventListener("click", () => timeGrill());
    card.append(time);
  }
  if (open && !order.guest_here) {
    const timed = Boolean(order.kitchen_start_at);
    const here = el("button", `btn ${timed ? "btn-primary" : "btn-dark"} btn-wide`, state.busyAction === "here" ? "Checking in…" : "I'm at the stall");
    here.type = "button";
    here.disabled = state.busy;
    here.addEventListener("click", () => arrive());
    card.append(here);
  } else if (order.guest_here && open) {
    card.append(el("div", "here-bar", "Car is at the stall"));
  }
  if (order.status === "completed") card.append(el("p", "fine", "This ticket was picked up."));
  card.append(el("p", "fine", order.payment_label || "Pay at the window. No card is stored."));
  card.append(arrivalWatch(order));
  return card;
}

function payChoice() {
  const box = el("fieldset", "stack");
  const legend = el("legend", "field-label", "Payment");
  box.append(legend);
  box.append(payRadio("pay_at_window", "Pay at the window"));
  box.append(payRadio("demo_unpaid", "Demo marker only: unpaid. Not a card charge."));
  return box;
}

function payRadio(value, label) {
  const row = el("label", "field");
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "payment";
  input.value = value;
  input.checked = (state.draft.payment || "pay_at_window") === value;
  input.addEventListener("change", () => {
    state.draft.payment = value;
    saveJson("route66-draft", state.draft);
  });
  row.append(input, document.createTextNode(` ${label}`));
  return row;
}

function watchChoice() {
  const row = el("label", "field");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = state.draft.arrivalOptIn === true;
  input.addEventListener("change", () => {
    state.draft.arrivalOptIn = input.checked;
    saveJson("route66-draft", state.draft);
  });
  row.append(input, document.createTextNode(" Optional: start earlier if a close arrival is reported. Off leaves the scheduled fire."));
  return row;
}

function arrivalWatch(order) {
  const box = el("section", "trail");
  box.append(el("h2", "", "Close arrival"));
  const secure = window.isSecureContext;
  box.append(el("p", "fine", secure
    ? "This browser can ask for a location. A reading is browser-reported, not a verified live GPS fix. You can turn watching off."
    : "This page is not a secure context, so the browser will not share GPS. The public demo is HTTP on an IP address. Device location needs HTTPS on a hostname. Use I'm at the stall, or a labeled simulation."));
  if (order.status !== "confirmed") {
    box.append(el("p", "fine", "The grill has started. Another arrival report will not move the clock."));
    return box;
  }
  if (!order.arrival_opt_in) {
    box.append(el("p", "fine", "Close-arrival watch is off. The scheduled fire and I'm at the stall still work."));
    if (order.status === "confirmed") box.append(watchButton(order, true, "Turn on close-arrival watch"));
    return box;
  }
  box.append(el("p", "fine", "Watch is on. A close report can start cooking once. Another report will not move the clock."));
  if (order.status === "confirmed" && !order.fire_hold) {
    const close = el("button", "btn btn-dark btn-wide", "Simulate a close arrival (demo)");
    close.type = "button";
    close.addEventListener("click", () => sendApproach("sim-close"));
    const far = el("button", "btn btn-dark btn-wide", "Simulate a far arrival (demo)");
    far.type = "button";
    far.addEventListener("click", () => sendApproach("sim-far"));
    box.append(close, far);
    if (secure) {
      const device = el("button", "btn btn-dark btn-wide", "Use this browser's location");
      device.type = "button";
      device.addEventListener("click", () => requestDeviceFix());
      box.append(device);
    }
  }
  if (order.fire_hold) box.append(el("p", "fine", "Kitchen staff are holding the fire. Arrival reports will not start it."));
  if (order.status === "confirmed") box.append(watchButton(order, false, "Stop close-arrival watch"));
  return box;
}

function watchButton(order, enabled, label) {
  const button = el("button", "btn btn-dark btn-wide", label);
  button.type = "button";
  button.addEventListener("click", async () => {
    const response = await fetch(`/api/orders/${order.id}/arrival-watch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const body = await response.json();
    if (!response.ok) {
      state.error = body.error || "Could not change close-arrival watch.";
    } else {
      state.order = body.order;
      state.error = "";
    }
    render();
  });
  return button;
}

async function sendApproach(source, extra = {}) {
  if (state.busy) return;
  state.busy = true;
  state.busyAction = "approach";
  state.error = "";
  state.notice = source === "device"
    ? "Sending a browser-reported location. It is not a verified live GPS fix."
    : "Sending a labeled simulation. This does not use device GPS.";
  render();
  try {
    const response = await fetch(`/api/orders/${state.ticketId}/approach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source, recorded_at: new Date().toISOString(), ...extra }),
    });
    const body = await response.json();
    if (body.order) state.order = body.order;
    if (!response.ok) throw new Error(body.error || "The arrival report was refused.");
    state.notice = body.note || "";
  } catch (error) {
    state.error = error instanceof Error ? error.message : "The arrival report was refused.";
    state.notice = "";
  } finally {
    state.busy = false;
    state.busyAction = "";
    render();
  }
}

function requestDeviceFix() {
  if (!window.isSecureContext || !navigator.geolocation) {
    state.error = "Device location is unavailable. HTTPS on a hostname is required. Use the labeled simulation or I'm at the stall.";
    render();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      sendApproach("device", {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy_m: position.coords.accuracy,
      });
    },
    () => {
      state.error = "The browser did not share a location. Nothing was stored. The scheduled fire is unchanged.";
      render();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 },
  );
}

function decisionPanel(order) {
  const box = el("section", "trail");
  box.append(el("h2", "", "How this time was set"));
  const trail = order.decision_trail;
  const solver = trail?.solver;
  const tiles = el("div", "tiles");
  tiles.append(
    tile("Arrival", clockShort(order.eta_timestamp), "", solver?.arrived_at ? `here ${clockShort(solver.arrived_at)}` : ""),
    tile("Prep", solver?.prep_minutes != null ? `${solver.prep_minutes} min` : order.prep_minutes != null ? `${order.prep_minutes} min` : "—", ""),
    tile("Fire", solver?.fire_at ? clockShort(solver.fire_at) : "—", "fire-t", solver?.previous_fire_at ? `was ${clockShort(solver.previous_fire_at)}` : ""),
    tile("Ready", solver?.ready_by ? clockShort(solver.ready_by) : "—", "ready-t", solver?.previous_ready_by ? `was ${clockShort(solver.previous_ready_by)}` : ""),
  );
  box.append(tiles);
  if (!solver) {
    box.append(el("p", "fine", "The grill has not been timed yet. The solver has not published a fire time."));
    return box;
  }
  box.append(el("h3", "", "What changed"));
  const changes = el("ul", "changes");
  const lines = solver.changes?.length ? solver.changes : ["No extra change was recorded."];
  for (const change of lines) changes.append(el("li", "", presentIsoClocks(change, lotZone())));
  box.append(changes);
  if (trail.actions?.length) {
    box.append(el("h3", "", "Who did what"));
    const people = el("ul", "changes");
    for (const action of trail.actions) {
      people.append(el("li", "", `${actorLabel(action.actor)}: ${presentIsoClocks(action.note, lotZone())}`));
    }
    box.append(people);
  }
  const wording = trail.explanation || {};
  box.append(el("p", "badge", wordingLabel(wording)));
  if (wording.text) box.append(el("p", "wording", presentIsoClocks(wording.text, lotZone())));
  if (wording.warning) box.append(el("p", "fine", wording.warning));
  box.append(el("p", "fine", "Fire and ready come from the solver. The sentence above does not move those times."));
  return box;
}

function tile(label, value, className, was) {
  const node = el("div", `tile ${className}`.trim());
  node.append(el("span", "", label), el("strong", "", value));
  if (was) node.append(el("s", "", was));
  return node;
}

function nextStep(order) {
  if (order.status === "completed") return "Kitchen staff marked this picked up.";
  if (order.status === "ready") return "Next: kitchen staff hand you the bag and mark it picked up.";
  if (order.status === "cooking") return "Next: kitchen staff mark the bag ready. You do not.";
  if (order.kitchen_start_at) return "Next: the solver fires on its clock, or you check in early.";
  return "Next: you time the grill. Staff do not set this clock.";
}

function actorLabel(actor) {
  if (actor === "kitchen") return "Kitchen staff";
  if (actor === "guest") return "Guest";
  return "Solver";
}

function wordingLabel(wording) {
  if (wording.live && wording.source === "vultr") return `Wording from Vultr Serverless Inference${wording.model ? ` · ${wording.model}` : ""}`;
  if (wording.mode === "live-rejected") return "Model wording discarded. Solver sentence shown.";
  if (wording.mode === "live-failed") return "Live inference did not answer. Solver sentence shown.";
  return "Wording is deterministic. No model call.";
}

async function timeGrill() {
  if (state.busy) return;
  state.busy = true;
  state.busyAction = "time";
  state.error = "";
  state.notice = "Timing the grill. The solver sets the clock first. Wording can take several seconds and does not move that clock.";
  render();
  try {
    const response = await fetch("/api/agent/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order_id: state.ticketId }),
    });
    const body = await response.json();
    if (body.order) state.order = body.order;
    if (!response.ok) throw new Error(body.error || "The pit could not time the grill.");
    if (body.decision?.decision === "refuse") throw new Error(body.decision.reason || "The pit could not time the grill.");
    state.order = body.order;
  } catch (error) {
    state.error = error instanceof Error ? error.message : "The pit could not time the grill.";
  } finally {
    state.busy = false;
    state.busyAction = "";
    state.notice = "";
    render();
  }
}

async function arrive() {
  if (state.busy) return;
  state.busy = true;
  state.busyAction = "here";
  state.error = "";
  state.notice = "Checking you in. If the grill has not started, the fire time moves to now.";
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
    state.busyAction = "";
    state.notice = "";
    render();
  }
}

/* ------------------------------------------------------------------ find */

function renderFind() {
  const { page, main } = frame("Find ticket", { nav: "/find" });
  main.classList.add("narrow");
  const head = el("div", "page-head");
  head.append(el("h1", "", "Find a ticket"), el("p", "lede", "Use the ticket number and the plate on that order."));
  main.append(head);
  if (state.error) main.append(el("p", "alert", state.error));
  const form = el("form", "review-card find-card");
  const number = inputField("Ticket number", "number", "", { placeholder: "R66-12345", autocomplete: "off", className: "mono" });
  const plate = inputField("Plate", "plate", "", { maxLength: 12, className: "plate-input", autocomplete: "off" });
  number.input.required = true;
  plate.input.required = true;
  const button = el("button", "btn btn-primary btn-wide", "Look up");
  button.type = "submit";
  form.append(number.wrap, plate.wrap, button);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const params = new URLSearchParams({ order_number: number.input.value.trim(), car_plate: plate.input.value.trim() });
    try {
      const response = await fetch(`/api/orders/lookup?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No ticket matched.");
      state.order = body.order;
      state.ticketId = body.order.id;
      sessionStorage.setItem("route66-ticket-id", body.order.id);
      go("/ticket");
    } catch (error) {
      fail(error instanceof Error ? error.message : "No ticket matched.");
    }
  });
  main.append(form);
  mount(page, main);
}

/* ------------------------------------------------------------------ chrome */

function frame(title, { rail = false, flow = false, topbar: showTop = true, nav = "" } = {}) {
  document.title = `${title} · Route 66 Drive-In`;
  const page = el("div", "app-frame");
  if (rail) page.classList.add("has-rail");
  if (flow) page.classList.add("flow");
  page.append(sidebar(nav));
  if (showTop) page.append(topbar());
  const main = el("main", "screen");
  main.id = "main";
  return { page, main };
}

function mount(page, main, rail) {
  page.append(main);
  if (rail) page.append(rail);
  page.append(footnote(), tabbar());
  app.replaceChildren(page);
}

function topbar() {
  const bar = el("header", "topbar");
  const brand = el("a", "brand");
  brand.href = "/";
  brand.setAttribute("data-nav", "/");
  brand.append(shield(), el("span", "brand-name", "Route 66"));
  const bag = el("a", "bag-pill", "Bag");
  bag.href = "/cart";
  bag.setAttribute("data-nav", "/cart");
  if (count()) {
    const dot = el("span", "count-dot", String(count()));
    dot.setAttribute("aria-label", `${count()} items`);
    bag.append(dot);
  }
  bar.append(brand, bag);
  return bar;
}

function sidebar(active) {
  const side = el("aside", "side");
  const brand = el("a", "brand");
  brand.href = "/";
  brand.setAttribute("data-nav", "/");
  const title = el("span", "side-title");
  title.append(el("strong", "", "Route 66"), el("span", "", "Drive-In · Austin"));
  brand.append(shield(), title);
  const nav = el("nav", "side-nav");
  nav.setAttribute("aria-label", "Main");
  nav.append(navLink("/", "Menu", active), navLink("/cart", `Bag (${count()})`, active), navLink("/ticket", "Ticket", active), navLink("/find", "Find ticket", active));
  side.append(brand, nav);
  if (state.menu && path() === "/") {
    side.append(el("p", "side-label", "Categories"));
    for (const category of CATEGORIES) {
      const on = state.category === category.id;
      const button = el("button", on ? "side-cat on" : "side-cat", category.label);
      button.type = "button";
      button.setAttribute("aria-pressed", on ? "true" : "false");
      button.addEventListener("click", () => pickCategory(category.id));
      side.append(button);
    }
  }
  const foot = el("div", "side-foot");
  foot.append(el("p", "", serviceFootnote(state.service)));
  const staff = el("a", "", "Staff");
  staff.href = "/kitchen.html";
  foot.append(staff);
  side.append(foot);
  return side;
}

function navLink(href, label, active) {
  const on = active === href;
  const link = el("a", on ? "side-link on" : "side-link", label);
  link.href = href;
  link.setAttribute("data-nav", href);
  if (on) link.setAttribute("aria-current", "page");
  return link;
}

function tabbar() {
  const bar = el("nav", "tabbar");
  bar.setAttribute("aria-label", "Main");
  const route = path();
  const active = route.startsWith("/checkout") || route === "/cart" ? "/cart" : route === "/find" ? "/ticket" : route.startsWith("/item/") ? "/" : route;
  bar.append(tab("/", "Menu", active), tab("/cart", count() ? `Bag ${count()}` : "Bag", active), tab("/ticket", "Ticket", active));
  return bar;
}

function tab(href, label, active) {
  const link = el("a", active === href ? "tab on" : "tab", label);
  link.href = href;
  link.setAttribute("data-nav", href);
  if (active === href) link.setAttribute("aria-current", "page");
  return link;
}

function footnote() {
  const note = el("footer", "footnote");
  note.append(el("p", "", serviceFootnote(state.service)));
  const staff = el("a", "", "Staff");
  staff.href = "/kitchen.html";
  note.append(staff);
  return note;
}

function plateNode(plate, sub) {
  const node = el("div", "plate");
  const top = el("div", "plate-top");
  top.append(el("span", "", "TX"), el("span", "", "TEXAS"), el("span", "", "66"));
  node.append(top, el("div", "plate-text", (plate || "").trim().toUpperCase() || "———"), el("div", "plate-sub", sub));
  node.setAttribute("aria-label", `Plate ${(plate || "").trim() || "not set"}`);
  return node;
}

function carCaption(color, name) {
  return `${color || "red"} car · ${(name || "").trim() || "Guest"}`;
}

function colorHex(name) {
  return COLORS.find(([color]) => color === name)?.[1] || "#8d6840";
}

function inputField(labelText, name, value, { maxLength, className = "", autocomplete = "off", placeholder = "" } = {}) {
  const wrap = el("label", "field");
  wrap.append(document.createTextNode(labelText));
  const input = document.createElement("input");
  input.className = `input ${className}`.trim();
  input.name = name;
  input.id = name;
  input.type = "text";
  input.value = value;
  input.autocomplete = autocomplete;
  if (placeholder) input.placeholder = placeholder;
  if (maxLength) input.maxLength = maxLength;
  wrap.append(input);
  return { wrap, input };
}

function kvItem(label, value) {
  const item = el("div");
  item.append(el("span", "", label), el("strong", "", value));
  return item;
}

function fact(label, value) {
  const item = el("li");
  item.append(el("span", "", label), el("strong", "", value));
  return item;
}

function lineRow(left, right, className) {
  const row = el("div", className);
  row.append(el("span", "", left), el("span", "", right));
  return row;
}

function errorBlock(message, retry) {
  const box = el("div", "empty-state");
  box.append(el("p", "alert", message));
  const button = el("button", "btn btn-primary", "Try again");
  button.type = "button";
  button.addEventListener("click", retry);
  box.append(button);
  return box;
}

function shield() {
  const node = el("span", "shield", "66");
  node.setAttribute("aria-hidden", "true");
  return node;
}

function mark(sku) {
  const wrap = el("div", "mark");
  wrap.append(foodMark(sku));
  return wrap;
}

/* ------------------------------------------------------------------ cart state */

function addLine(sku, qty, rerender = true) {
  const item = itemBySku(sku);
  if (!item?.available) return;
  const existing = state.cart.lines.find((line) => line.sku === sku);
  if (existing) existing.qty = Math.min(8, existing.qty + qty);
  else state.cart.lines.push({ sku, qty: Math.min(8, qty) });
  saveJson("route66-cart", state.cart);
  if (rerender) render();
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

/* ------------------------------------------------------------------ time */

function lotZone() {
  return state.menu?.timezone || "America/Chicago";
}

function hoursRange() {
  const open = state.menu?.open || "00:00";
  const close = state.menu?.close || "24:00";
  const [openH, openM] = open.split(":").map(Number);
  const [closeH, closeM] = close.split(":").map(Number);
  return [openH * 60 + openM, closeH * 60 + closeM];
}

function alwaysOpen() {
  return (state.menu?.open || "00:00") === "00:00" && (state.menu?.close || "24:00") === "24:00";
}

function hoursLabel() {
  if (alwaysOpen()) return "24 hours, Austin time";
  return `${plainClock(state.menu?.open || "00:00")}–${plainClock(state.menu?.close || "24:00")} Austin time`;
}

function austinWeekday(date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: lotZone(), weekday: "short" }).format(date);
}

function plainClock(hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function hourLabel(minutes) {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  return minute ? `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}` : `${hour % 12 || 12} ${suffix}`;
}

function austinMinutes(date) {
  const parts = {};
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: lotZone(), hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
  for (const part of formatter.formatToParts(date)) if (part.type !== "literal") parts[part.type] = part.value;
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return hour * 60 + Number(parts.minute);
}

function outsideAustinHours(date) {
  if (alwaysOpen()) return false;
  const [open, close] = hoursRange();
  const minutes = austinMinutes(date);
  return minutes < open || minutes > close;
}

function lotOpenNow() {
  return !outsideAustinHours(new Date());
}

function localParts(date) {
  const parts = {};
  for (const part of new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(date)) {
    parts[part.type] = part.value;
  }
  return { time: `${parts.hour}:${parts.minute}`, period: parts.dayPeriod || "" };
}

function shortLocal(date) {
  if (!date) return "";
  const parts = localParts(date);
  return `${parts.time} ${parts.period}`.trim();
}

function dayLabel(date) {
  const parts = {};
  for (const part of new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short" }).formatToParts(date)) {
    parts[part.type] = part.value;
  }
  return `${parts.weekday} ${parts.day} ${parts.month}`;
}

function localLabel(date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
}

function austinLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: lotZone(),
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function austinClock(date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: lotZone(), hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
}

function clockShort(iso) {
  if (!iso) return "";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: lotZone(), hour: "numeric", minute: "2-digit", hour12: true })
    .formatToParts(when)
    .filter((part) => part.type === "hour" || part.type === "minute" || part.type === "literal")
    .map((part) => part.value)
    .join("")
    .trim();
}

function countdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function arrivalPreview(when) {
  if (!when) return `The lot is open ${hoursLabel()}.`;
  const austin = austinLabel(when);
  const yours = localLabel(when);
  if (outsideAustinHours(when)) return `Your time ${yours} is ${austin} in Austin. The lot is closed then. Open ${hoursLabel()}.`;
  return `Your time ${yours} is ${austin} in Austin. The lot is open then (${hoursLabel().replace(" Austin time", "")} Austin time).`;
}

function localInputValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ------------------------------------------------------------------ polling */

async function refreshOrder() {
  if (!state.ticketId) return;
  try {
    const response = await fetch(`/api/orders/${state.ticketId}`);
    if (!response.ok) return;
    const body = await response.json();
    if (state.busy) return;
    const changed = JSON.stringify(body.order) !== JSON.stringify(state.order);
    state.order = body.order;
    if (path() === "/ticket" && changed && !state.busy) render();
  } catch {
    // Keep the last ticket on screen. The next poll tries again.
  }
}

function startPoll() {
  clearInterval(pollTimer);
  clearInterval(tickTimer);
  if (path() !== "/ticket" || !state.ticketId) return;
  pollTimer = setInterval(refreshOrder, 5000);
  tickTimer = setInterval(() => live?.update(), 1000);
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "") || fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode: the bag lives for this page only.
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
