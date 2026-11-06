const $ = (selector) => document.querySelector(selector);
const authForm = $("#kitchen-auth");
const board = $("#board");
const tokenInput = $("#kitchen-token");
const statusLine = $("#status-line");
const lanes = { waiting: $("#waiting"), firing: $("#firing"), ready: $("#ready") };
const counts = { waiting: $("#count-waiting"), firing: $("#count-firing"), ready: $("#count-ready") };
const drillButton = $("#drill");
const probeButton = $("#probe");

const COLORS = {
  red: "#9c2f24",
  white: "#f7f3ec",
  black: "#1c1612",
  blue: "#2c4c78",
  silver: "#c8c2b8",
  green: "#2d6a45",
  yellow: "#e0b03a",
  other: "#8d6840",
};

let timeZone = "America/Chicago";
let clockOffset = 0;
let probeTimer = 0;

function kitchenFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = sessionStorage.getItem("route66-kitchen-token") || "";
  if (token) headers.set("x-kitchen-token", token);
  return fetch(url, { ...options, headers });
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null && text !== "") element.textContent = text;
  return element;
}

function showBoard(open) {
  board.hidden = !open;
  $("#pit-foot").hidden = !open;
  $("#syscheck").hidden = !open;
  authForm.hidden = open;
}

function short(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hour12: true })
    .formatToParts(new Date(iso))
    .filter((part) => part.type === "hour" || part.type === "minute" || part.type === "literal")
    .map((part) => part.value)
    .join("")
    .trim();
}

function tickClock() {
  const now = new Date(Date.now() + clockOffset);
  const parts = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).formatToParts(now)) {
    parts[part.type] = part.value;
  }
  $("#pit-clock").textContent = `${parts.hour}:${parts.minute}`;
  $("#pit-zone").textContent = `${parts.dayPeriod || ""} ${parts.timeZoneName || ""}`.trim();
}

function cue(card, now) {
  const eta = new Date(card.eta_timestamp);
  const ready = card.ready_by ? new Date(card.ready_by) : null;
  if (card.status === "cooking" && ready && ready < now) {
    const late = Math.max(1, Math.round((now - ready) / 60_000));
    return { label: `Overdue ${late} min`, kind: "overdue" };
  }
  if (card.status === "ready" && eta.getTime() + 10 * 60_000 < now.getTime()) return { label: "Car is late", kind: "late" };
  if (card.status === "confirmed" && eta < now) return { label: "ETA passed", kind: "late" };
  if (card.guest_here) return { label: "At the stall", kind: "ok" };
  return null;
}

function timesRow(pairs) {
  const row = node("div", "tc-times");
  for (const [label, value, tone] of pairs) {
    const span = node("span", "", `${label} `);
    span.append(node("strong", tone || "", value));
    row.append(span);
  }
  return row;
}

function renderCard(card, now) {
  const flag = cue(card, now);
  const article = node("article", "ticket-card");
  if (card.status === "cooking") article.classList.add("firing");
  if (card.status === "ready") article.classList.add("ready");
  if (flag?.kind === "overdue") article.classList.add("overdue");
  if (flag?.kind === "late") article.classList.add("late");

  const top = node("div", "tc-top");
  const car = [card.car_color, card.car_model].filter(Boolean).join(" ");
  const who = node("span", "tc-who", car ? `${car} · ${card.customer_name}` : card.customer_name);
  who.style.setProperty("--swatch", COLORS[card.car_color] || "#d9cbb8");
  top.append(node("span", "tc-num", card.order_number), who);
  article.append(top);
  if (flag) article.append(node("span", flag.kind === "ok" ? "tc-flag ok" : flag.kind === "late" ? "tc-flag warn" : "tc-flag", flag.label));
  article.append(node("p", "tc-plate", card.car_plate));
  article.append(node("p", "tc-items", card.items.map((item) => `${item.qty} × ${item.name}`).join(", ")));
  if (card.special_notes) article.append(node("p", "tc-note", `Note: ${card.special_notes}`));

  if (card.status === "confirmed") {
    article.append(timesRow([
      ["Arrive", short(card.eta_timestamp), ""],
      ["Fire", card.kitchen_start_at ? short(card.kitchen_start_at) : "not timed", "red"],
    ]));
  } else if (card.status === "cooking") {
    const start = card.kitchen_start_at ? Date.parse(card.kitchen_start_at) : now.getTime();
    const end = card.ready_by ? Date.parse(card.ready_by) : start;
    const pct = end > start ? Math.max(0, Math.min(100, ((now.getTime() - start) / (end - start)) * 100)) : 100;
    const bar = node("div", "tc-bar");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", "Cook progress");
    bar.setAttribute("aria-valuenow", String(Math.round(pct)));
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    const fill = node("div");
    fill.style.width = `${pct.toFixed(1)}%`;
    bar.append(fill);
    const times = timesRow([
      ["Fired", short(card.kitchen_start_at), ""],
      ["Ready by", short(card.ready_by), "green"],
    ]);
    if (card.fire_moved_from) {
      const moved = node("span", "moved", "Rush fire at check-in · planned ");
      moved.append(node("strong", "", short(card.fire_moved_from)));
      times.append(moved);
    }
    article.append(bar, times);
    const button = node("button", "pit-btn", "Mark ready");
    button.type = "button";
    button.addEventListener("click", () => postStatus(card.id, "ready", button));
    article.append(button);
  } else {
    article.append(timesRow([
      ["Ready", short(card.ready_by), "green"],
      ["Arrive", short(card.eta_timestamp), ""],
    ]));
    const button = node("button", "pit-btn dark", "Picked up");
    button.type = "button";
    button.addEventListener("click", () => postStatus(card.id, "picked-up", button));
    article.append(button);
  }
  return article;
}

function renderLane(key, cards, now, emptyText) {
  counts[key].textContent = String(cards.length);
  lanes[key].replaceChildren();
  if (cards.length === 0) {
    lanes[key].append(node("p", "empty", emptyText));
    return;
  }
  for (const card of cards) lanes[key].append(renderCard(card, now));
}

async function postStatus(id, action, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    const response = await kitchenFetch(`/api/orders/${id}/${action}`, { method: "POST" });
    if (!response.ok) {
      const body = await response.json();
      statusLine.textContent = body.error || "That status change was refused.";
    }
    await refresh();
  } catch {
    statusLine.textContent = "The board could not save that change.";
    button.disabled = false;
    button.textContent = original;
  }
}

async function refresh() {
  if (!sessionStorage.getItem("route66-kitchen-token")) {
    showBoard(false);
    statusLine.textContent = "The board is locked until you enter the kitchen token.";
    return;
  }
  try {
    const response = await kitchenFetch("/api/kitchen/board");
    if (response.status === 401 || response.status === 503) {
      showBoard(false);
      statusLine.textContent = response.status === 503
        ? "Kitchen access is not configured on this server."
        : "That token was refused.";
      return;
    }
    if (!response.ok) throw new Error("The board did not load.");
    const data = await response.json();
    showBoard(true);
    timeZone = data.timezone || timeZone;
    const now = new Date(data.as_of);
    clockOffset = now.getTime() - Date.now();
    tickClock();
    renderLane("waiting", data.waiting, now, "Nothing waiting.");
    renderLane("firing", data.firing, now, "Nothing on the grill.");
    renderLane("ready", data.ready, now, "Nothing bagged.");
    if (typeof data.picked_up_today === "number") $("#chip-done").textContent = String(data.picked_up_today);
    if (Array.isArray(data.sandbox_flags)) renderFlags(data.sandbox_flags);
    statusLine.textContent = `${data.drive_in} · ${data.waiting.length} waiting · ${data.firing.length} firing · ${data.ready.length} ready`;
  } catch (error) {
    statusLine.textContent = error instanceof Error ? error.message : "The board is unavailable.";
  }
}

let flagsKey = "";
function renderFlags(flags) {
  const key = flags.join(" ");
  if (key === flagsKey) return;
  flagsKey = key;
  const wrap = $("#flags");
  wrap.replaceChildren(...flags.map((flag) => node("span", "", flag)));
  $("#docker-cmd").textContent = `docker run --rm -i ${flags.join(" ").replace("no-new-privileges", "--security-opt no-new-privileges")} route66-fire-solver`;
}

drillButton.addEventListener("click", async () => {
  drillButton.disabled = true;
  const result = $("#filter-result");
  result.replaceChildren(node("span", "verdict idle", "RUNNING"), node("span", "", "Sending the note through the solver…"));
  try {
    const response = await kitchenFetch("/api/agent/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ containment_drill: true }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "The note filter did not run.");
    const decision = body.decision ?? {};
    const refused = decision.containment === "hostile-refused" && decision.executed_payload === false;
    const verdict = node("span", refused ? "verdict" : "verdict ok", refused ? "REFUSED" : String(decision.containment || "n/a").toUpperCase());
    const detail = refused
      ? `Shell-like string. Nothing executed. Isolation: ${body.isolation ?? "none"}. A filter, not a container proof.`
      : decision.reason || "The filter did not refuse this note.";
    result.replaceChildren(verdict, node("span", "", detail));
  } catch (error) {
    result.replaceChildren(node("span", "verdict", "ERROR"), node("span", "", error instanceof Error ? error.message : "The note filter failed."));
  } finally {
    drillButton.disabled = false;
  }
});

const failButton = $("#fail-closed");
failButton.addEventListener("click", async () => {
  failButton.disabled = true;
  const result = $("#fail-result");
  result.replaceChildren(node("span", "verdict idle", "RUNNING"), node("span", "", "Asking the solver with no Docker daemon…"));
  try {
    const response = await kitchenFetch("/api/agent/fail-closed", { method: "POST" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "The drill did not run.");
    if (!body.applicable) {
      result.replaceChildren(node("span", "verdict idle", "N/A"), node("span", "", body.error));
    } else if (body.held) {
      result.replaceChildren(
        node("span", "verdict ok", "FAIL-CLOSED"),
        node("span", "", `HTTP ${body.status}. Ticket not scheduled. No in-process fallback. Docker said: ${String(body.error).split(";")[0].slice(0, 90)}`),
      );
    } else {
      result.replaceChildren(node("span", "verdict", "DID NOT HOLD"), node("span", "", body.error));
    }
  } catch (error) {
    result.replaceChildren(node("span", "verdict", "ERROR"), node("span", "", error instanceof Error ? error.message : "The drill failed."));
  } finally {
    failButton.disabled = false;
  }
});

function probeRows(report) {
  return [
    ["whoami", `uid=${report.uid}${report.root ? " (root)" : " (node), no capabilities"}`, !report.root && report.uid > 0],
    ["connect 1.1.1.1:80", report.network || "no answer", report.network !== "connected"],
    ["write /etc/pwned", report.write_etc || "no answer", report.write_etc !== "ok"],
    ["write /sandbox/pwned", report.write_sandbox || "no answer", report.write_sandbox !== "ok"],
    ["read /etc/shadow", report.read_shadow || "no answer", report.read_shadow !== "ok"],
    ["read /host-canary", report.host_canary || "no answer", report.host_canary !== "ok"],
    ["env VULTR_INFERENCE_API_KEY", report.secret_present ? "present" : "absent in container", !report.secret_present],
    ["write /tmp (tmpfs, noexec)", report.tmp_write ? "ok, scratch only" : "refused", null],
  ];
}

function probeLine(key, value, held) {
  const line = node("div", "probe-line");
  const badge = node("span", held === null ? "held info" : held ? "held" : "held broke", held === null ? "ALLOWED" : held ? "HELD" : "BROKEN");
  line.append(node("span", "k", key), node("span", "v", value), badge);
  return line;
}

probeButton.addEventListener("click", async () => {
  clearInterval(probeTimer);
  probeButton.disabled = true;
  probeButton.textContent = "Probing…";
  const lines = $("#probe-lines");
  const terminal = $("#terminal");
  lines.replaceChildren();
  terminal.querySelector(".term-done")?.remove();
  terminal.querySelector(".term-error")?.remove();
  $("#term-idle").hidden = true;
  const finish = () => {
    probeButton.disabled = false;
    probeButton.textContent = "Run again";
  };
  try {
    const response = await kitchenFetch("/api/agent/containment", { method: "POST" });
    const body = await response.json();
    if (!response.ok || !body.report) {
      const box = node("div", "term-error");
      box.append(
        node("div", "", "Sandbox probe did not run."),
        node("div", "", `isolation: ${body.isolation ?? "none"} · verified: false`),
        node("div", "", body.error || "Probe unavailable."),
      );
      terminal.append(box);
      finish();
      return;
    }
    const rows = probeRows(body.report);
    let shown = 0;
    probeTimer = setInterval(() => {
      if (shown >= rows.length) {
        clearInterval(probeTimer);
        const done = node("div", "term-done");
        const left = node("div");
        const held = body.report.boundaries_held === true;
        left.append(node("div", "path", "POST /api/agent/containment"), node("div", held ? "big" : "big bad", `boundaries_held: ${held}`));
        const right = node("div", "side-r");
        right.append(node("div", "", `verified: ${body.verified === true}`), node("div", "", `isolation: ${body.isolation}`));
        done.append(left, right);
        terminal.append(done);
        finish();
        return;
      }
      lines.append(probeLine(...rows[shown]));
      shown += 1;
    }, 420);
  } catch (error) {
    const box = node("div", "term-error", error instanceof Error ? error.message : "The probe failed.");
    terminal.append(box);
    finish();
  }
});

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sessionStorage.setItem("route66-kitchen-token", tokenInput.value.trim());
  refresh();
});

try {
  const health = await fetch("/api/health");
  const status = await health.json();
  $("#chip-mode").textContent = status.inference_mode ?? "unknown";
  $("#chip-runner").textContent = status.runner ?? "unknown";
  const verified = status.live_call_verified === true;
  $("#chip-live").textContent = verified && status.live_call_model ? `true · ${status.live_call_model}` : String(verified);
  $("#chip-live").className = verified ? "ok" : "warn";
} catch {
  statusLine.textContent = "Service status did not load.";
}

tickClock();
setInterval(tickClock, 1000);
await refresh();
setInterval(refresh, 3000);
