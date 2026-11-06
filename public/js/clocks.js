/** Display copy only. Solver fields such as fire_at stay ISO strings. */
const ISO_CLOCK = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})/g;

export function presentIsoClocks(text, timeZone = "America/Chicago") {
  if (typeof text !== "string" || !text) return text;
  return text.replace(ISO_CLOCK, (iso) => {
    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) return iso;
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(when);
  });
}

/** Footer and sidebar. A verified live reply is for this process only. */
export function serviceFootnote(health) {
  const pay = "Pay at the window. This demo does not take a card.";
  const base = "Demo lot in Austin. Fire times come from the solver on this server.";
  if (!health || typeof health !== "object") return `${base} ${pay}`;
  const model = typeof health.live_call_model === "string" ? health.live_call_model.trim() : "";
  if (health.live_call_verified === true) {
    const which = model ? ` (${model})` : "";
    return `${base} A Vultr Serverless Inference reply was accepted${which}. That check belongs to this server process and clears on restart. ${pay}`;
  }
  if (health.inference_mode === "live") {
    return `${base} Live inference is selected. This process has not accepted a model reply yet. ${pay}`;
  }
  return `${base} Wording is deterministic until a live reply is accepted. ${pay}`;
}
