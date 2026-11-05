import type { SolveResult } from "../sandbox/fire-time-solver/types.ts";

export interface Explanation {
  source: "stub" | "vultr";
  model: string | null;
  text: string;
  warning: string | null;
}

export interface ParseResult {
  source: "stub" | "vultr";
  items: { sku: string; qty: number; name: string }[];
  car_plate: string | null;
  note: string;
  warning: string | null;
}

export interface MenuName {
  sku: string;
  name: string;
}

const PLACEHOLDER = /^(your[_-]|changeme|placeholder|todo)?$/i;

/** True when a real key and model are both set. Empty and placeholder keys stay on the stub. */
export function inferenceConfigured(): boolean {
  const key = process.env.VULTR_INFERENCE_API_KEY?.trim() ?? "";
  const model = process.env.VULTR_INFERENCE_MODEL?.trim() ?? "";
  return key.length > 0 && !PLACEHOLDER.test(key) && model.length > 0 && !PLACEHOLDER.test(model);
}

/**
 * Read the solver result back in a sentence.
 * The model is not allowed to pick a different fire time. The sandbox numbers win.
 */
export async function explainDecision(input: {
  orderNumber: string;
  carPlate: string;
  decision: SolveResult;
}): Promise<Explanation> {
  const fallback = stubExplanation(input.orderNumber, input.decision);
  if (!inferenceConfigured()) {
    return { source: "stub", model: null, text: fallback, warning: null };
  }
  try {
    const text = await chat(
      [
        "You explain a drive-in kitchen fire time in one or two short sentences.",
        "Use only the timestamps and reason in the JSON.",
        "Do not invent a different fire time, do not suggest shell commands, and do not ask for secrets.",
      ].join(" "),
      {
        order_number: input.orderNumber,
        car_plate: input.carPlate,
        decision: input.decision.decision,
        fire_at: input.decision.fire_at,
        ready_by: input.decision.ready_by,
        prep_minutes: input.decision.prep_minutes,
        reason: input.decision.reason,
        containment: input.decision.containment,
      },
    );
    return {
      source: "vultr",
      model: process.env.VULTR_INFERENCE_MODEL?.trim() ?? null,
      text: text || fallback,
      warning: text ? null : "Inference returned an empty explanation. Showed the solver text.",
    };
  } catch (error) {
    return {
      source: "stub",
      model: process.env.VULTR_INFERENCE_MODEL?.trim() ?? null,
      text: fallback,
      warning: redact(error instanceof Error ? error.message : "Inference request failed."),
    };
  }
}

/**
 * Turn a free-text utterance into menu hits. The scaffold does not write this
 * parse onto the order. The stored ticket remains what the guest submitted.
 */
export async function parseUtterance(utterance: string, menu: MenuName[]): Promise<ParseResult> {
  const stub = stubParse(utterance, menu);
  if (!inferenceConfigured()) return stub;
  try {
    const text = await chat(
      [
        "Extract a drive-in order. Reply with JSON only:",
        '{"items":[{"sku":"string","qty":1}],"car_plate":null}.',
        "Use only skus from the menu list. If unsure, return an empty items array.",
      ].join(" "),
      { utterance: utterance.slice(0, 500), menu },
    );
    const parsed = JSON.parse(stripFence(text)) as { items?: { sku?: string; qty?: number }[]; car_plate?: string | null };
    const allowed = new Map(menu.map((item) => [item.sku, item.name]));
    const items: ParseResult["items"] = [];
    for (const entry of parsed.items ?? []) {
      const name = entry.sku ? allowed.get(entry.sku) : undefined;
      const qty = entry.qty;
      if (!name || !entry.sku || !Number.isInteger(qty) || (qty as number) < 1 || (qty as number) > 8) continue;
      items.push({ sku: entry.sku, qty: qty as number, name });
    }
    const plate = typeof parsed.car_plate === "string" ? parsed.car_plate.slice(0, 16) : stub.car_plate;
    return { source: "vultr", items, car_plate: plate, note: utterance.slice(0, 200), warning: null };
  } catch (error) {
    return {
      ...stub,
      warning: redact(error instanceof Error ? error.message : "Inference parse failed."),
    };
  }
}

function stubExplanation(orderNumber: string, decision: SolveResult): string {
  if (decision.containment === "hostile-refused") {
    return `${orderNumber} stayed off the wheel. ${decision.reason}`;
  }
  if (decision.decision === "refuse") {
    return `I did not schedule ${orderNumber}. ${decision.reason}`;
  }
  return `${orderNumber}: ${decision.reason} Those times came from the solver.`;
}

function stubParse(utterance: string, menu: MenuName[]): ParseResult {
  const lower = utterance.toLowerCase();
  const items: ParseResult["items"] = [];
  for (const item of menu) {
    if (lower.includes(item.name.toLowerCase())) items.push({ sku: item.sku, qty: 1, name: item.name });
  }
  const plate = utterance.toUpperCase().match(/\b[A-Z0-9]{2,8}-[A-Z0-9]{1,6}\b/);
  return {
    source: "stub",
    items,
    car_plate: plate?.[0] ?? null,
    note: "Stub matched menu names and a plate shape. It did not change the stored order.",
    warning: null,
  };
}

async function chat(system: string, payload: unknown): Promise<string> {
  const base = (process.env.VULTR_INFERENCE_BASE_URL?.trim() || "https://api.vultrinference.com/v1").replace(/\/$/, "");
  const key = process.env.VULTR_INFERENCE_API_KEY?.trim() ?? "";
  const model = process.env.VULTR_INFERENCE_MODEL?.trim() ?? "";
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 180,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Inference HTTP ${response.status}`);
  }
  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}

function redact(message: string): string {
  const key = process.env.VULTR_INFERENCE_API_KEY?.trim();
  if (!key) return message.slice(0, 300);
  return message.split(key).join("[redacted]").slice(0, 300);
}
