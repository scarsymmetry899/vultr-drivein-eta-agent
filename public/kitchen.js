const authForm = document.querySelector("#kitchen-auth");
const board = document.querySelector("#board");
const tokenInput = document.querySelector("#kitchen-token");
const lanes = {
  waiting: document.querySelector("#waiting"),
  firing: document.querySelector("#firing"),
  ready: document.querySelector("#ready"),
};
const statusLine = document.querySelector("#status-line");
const banner = document.querySelector("#mode-banner");
const drillButton = document.querySelector("#drill");
const probeButton = document.querySelector("#probe");
const drillOut = document.querySelector("#drill-out");

function kitchenFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = sessionStorage.getItem("route66-kitchen-token") || "";
  if (token) headers.set("x-kitchen-token", token);
  return fetch(url, { ...options, headers });
}

function showBoard(open) {
  board.hidden = !open;
  authForm.hidden = open;
}

function clock(iso, timeZone) {
  if (!iso) return "not set";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function cue(card, now) {
  const eta = new Date(card.eta_timestamp);
  const ready = card.ready_by ? new Date(card.ready_by) : null;
  if (card.status === "cooking" && ready && ready < now) return { label: "Overdue", kind: "overdue" };
  if (card.status === "ready" && eta.getTime() + 10 * 60_000 < now.getTime()) return { label: "Car is late", kind: "late" };
  if (card.status === "confirmed" && eta < now) return { label: "ETA passed", kind: "late" };
  if (card.guest_here) return { label: "At the stall", kind: "ok" };
  return null;
}

function renderLane(node, cards, timeZone, now) {
  node.replaceChildren();
  if (cards.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Nothing in this lane.";
    node.append(empty);
    return;
  }
  for (const card of cards) {
    const article = document.createElement("article");
    const flag = cue(card, now);
    article.className = "card";
    if (flag?.kind === "overdue") article.classList.add("overdue");
    if (flag?.kind === "late") article.classList.add("late");
    if (card.status === "ready") article.classList.add("ready-card");

    const number = document.createElement("p");
    number.className = "meta";
    number.textContent = card.order_number;
    if (flag) {
      const chip = document.createElement("span");
      chip.className = flag.kind === "ok" ? "flag ok" : flag.kind === "late" ? "flag warn" : "flag";
      chip.textContent = flag.label;
      number.prepend(chip, " ");
    }
    const plate = document.createElement("p");
    plate.className = "plate";
    plate.textContent = card.car_plate;
    const who = document.createElement("p");
    const car = `${card.car_color} ${card.car_model}`.trim();
    who.textContent = car ? `${card.customer_name} · ${car}` : card.customer_name;
    const items = document.createElement("p");
    items.textContent = card.items.map((item) => `${item.qty} × ${item.name}`).join(", ");
    const etaLine = document.createElement("p");
    etaLine.className = "meta";
    etaLine.textContent = `ETA ${card.eta_time}`;
    const fireLine = document.createElement("p");
    fireLine.className = "meta";
    fireLine.textContent = `Fire ${clock(card.kitchen_start_at, timeZone)} · Ready ${clock(card.ready_by, timeZone)}`;
    article.append(number, plate, who, items, etaLine, fireLine);
    if (card.decision_changes?.[0]) {
      const change = document.createElement("p");
      change.className = "meta";
      change.textContent = card.decision_changes[0];
      article.append(change);
    }
    if (card.special_notes) {
      const notes = document.createElement("p");
      notes.textContent = card.special_notes;
      article.append(notes);
    }

    if (card.status === "cooking") {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Mark ready";
      button.addEventListener("click", () => postStatus(card.id, "ready", button));
      article.append(button);
    }
    if (card.status === "ready") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dark";
      button.textContent = "Picked up";
      button.addEventListener("click", () => postStatus(card.id, "picked-up", button));
      article.append(button);
    }
    node.append(article);
  }
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
    showBoard(true);
    const board = await response.json();
    const now = new Date(board.as_of);
    renderLane(lanes.waiting, board.waiting, board.timezone, now);
    renderLane(lanes.firing, board.firing, board.timezone, now);
    renderLane(lanes.ready, board.ready, board.timezone, now);
    const when = new Intl.DateTimeFormat("en-US", {
      timeZone: board.timezone,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(now);
    statusLine.textContent = `${board.drive_in} · ${when} · ${board.waiting.length} waiting · ${board.firing.length} firing · ${board.ready.length} ready`;
  } catch (error) {
    statusLine.textContent = error instanceof Error ? error.message : "The board is unavailable.";
  }
}

function showOut(lines) {
  drillOut.hidden = false;
  drillOut.textContent = lines.join("\n");
}

drillButton.addEventListener("click", async () => {
  drillButton.disabled = true;
  try {
    const response = await kitchenFetch("/api/agent/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ containment_drill: true }),
    });
    const body = await response.json();
    const decision = body.decision ?? {};
    showOut([
      "Note filter. This is not a container boundary test.",
      `containment: ${decision.containment ?? "n/a"}`,
      `executed_payload: ${decision.executed_payload ?? "n/a"}`,
      `isolation: ${body.isolation ?? "n/a"}`,
      `mode: ${body.explanation?.mode ?? "n/a"}`,
      body.error || decision.reason || "",
      body.explanation?.text || "",
    ]);
  } catch (error) {
    showOut([error instanceof Error ? error.message : "The note filter failed."]);
  } finally {
    drillButton.disabled = false;
  }
});

probeButton.addEventListener("click", async () => {
  probeButton.disabled = true;
  try {
    const response = await kitchenFetch("/api/agent/containment", { method: "POST" });
    const body = await response.json();
    if (!response.ok || body.verified !== true) {
      showOut([
        "Sandbox probe did not run.",
        `isolation: ${body.isolation ?? "none"}`,
        `verified: false`,
        body.error || "Probe unavailable.",
      ]);
      return;
    }
    const report = body.report ?? {};
    showOut([
      `verified: ${body.verified}`,
      `uid: ${report.uid}`,
      `root: ${report.root}`,
      `secret_present: ${report.secret_present}`,
      `network: ${report.network}`,
      `write_sandbox: ${report.write_sandbox}`,
      `write_etc: ${report.write_etc}`,
      `host_canary: ${report.host_canary}`,
      `boundaries_held: ${report.boundaries_held}`,
    ]);
  } catch (error) {
    showOut([error instanceof Error ? error.message : "The probe failed."]);
  } finally {
    probeButton.disabled = false;
  }
});

try {
  const health = await fetch("/api/health");
  const status = await health.json();
  banner.textContent = status.inference_mode === "live"
    ? "Live wording is on. Grill times still come from the kitchen clock."
    : "Demo service. Grill times are calculated here, not by a live model.";
} catch {
  banner.textContent = "Service status did not load.";
}

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sessionStorage.setItem("route66-kitchen-token", tokenInput.value.trim());
  refresh();
});

await refresh();
setInterval(refresh, 3000);
