const lanes = {
  waiting: document.querySelector("#waiting"),
  firing: document.querySelector("#firing"),
  ready: document.querySelector("#ready"),
};
const statusLine = document.querySelector("#status-line");
const drillButton = document.querySelector("#drill");
const drillOut = document.querySelector("#drill-out");

function clock(iso, timeZone) {
  if (!iso) return "not set";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function renderLane(node, cards, timeZone) {
  node.replaceChildren();
  if (cards.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No tickets in this lane.";
    node.append(empty);
    return;
  }
  for (const card of cards) {
    const article = document.createElement("article");
    article.className = "card";
    const number = document.createElement("p");
    number.className = "meta";
    number.textContent = card.order_number;
    if (card.guest_here) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = "AT THE STALL";
      number.prepend(chip, " ");
    }
    const plate = document.createElement("p");
    plate.className = "plate";
    plate.textContent = card.car_plate;
    const who = document.createElement("p");
    who.textContent = `${card.customer_name} · ${card.car_color} ${card.car_model}`.trim();
    const items = document.createElement("p");
    items.textContent = card.items.map((item) => `${item.qty} × ${item.name}`).join(", ");
    const times = document.createElement("p");
    times.className = "meta";
    times.textContent = `ETA ${card.eta_time}. Fire ${clock(card.kitchen_start_at, timeZone)}. Ready ${clock(card.ready_by, timeZone)}.`;
    article.append(number, plate, who, items, times);
    if (card.special_notes) {
      const notes = document.createElement("p");
      notes.textContent = card.special_notes;
      article.append(notes);
    }
    if (card.schedule_reason) {
      const reason = document.createElement("p");
      reason.className = "meta";
      reason.textContent = card.schedule_reason;
      article.append(reason);
    }
    node.append(article);
  }
}

async function refresh() {
  try {
    const response = await fetch("/api/kitchen/board");
    if (!response.ok) throw new Error("Board request failed.");
    const board = await response.json();
    renderLane(lanes.waiting, board.waiting, board.timezone);
    renderLane(lanes.firing, board.firing, board.timezone);
    renderLane(lanes.ready, board.ready, board.timezone);
    const when = new Intl.DateTimeFormat("en-US", {
      timeZone: board.timezone,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(board.as_of));
    statusLine.textContent = `${board.drive_in} · ${when} · ${board.waiting.length} waiting · ${board.firing.length} firing · ${board.ready.length} ready`;
  } catch (error) {
    statusLine.textContent = error instanceof Error ? error.message : "Board unavailable.";
  }
}

drillButton.addEventListener("click", async () => {
  drillButton.disabled = true;
  try {
    const response = await fetch("/api/agent/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ containment_drill: true }),
    });
    const body = await response.json();
    const decision = body.decision ?? {};
    drillOut.hidden = false;
    drillOut.textContent = [
      `containment: ${decision.containment}`,
      `contained: ${decision.contained}`,
      `executed_payload: ${decision.executed_payload}`,
      `host_effects: ${decision.host_effects}`,
      `rule: ${decision.rule}`,
      `runner: ${body.runner}`,
      decision.reason ?? "",
      body.explanation?.text ?? "",
    ].join("\n");
  } catch (error) {
    drillOut.hidden = false;
    drillOut.textContent = error instanceof Error ? error.message : "Drill failed.";
  } finally {
    drillButton.disabled = false;
  }
});

await refresh();
setInterval(refresh, 3000);
