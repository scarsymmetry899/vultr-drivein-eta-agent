import type { SolveResult } from "../sandbox/fire-time-solver/types.ts";
import { EXPLANATION_SCHEMA, PARSE_SCHEMA, acceptExplanation, acceptParse } from "./structured.ts";
import { loadConfig } from "../src/config.ts";

export type InferenceMode = "demo" | "live" | "live-failed" | "live-rejected";

export interface Explanation {
  mode: InferenceMode;
  live: boolean;
  source: "deterministic" | "vultr";
  model: string | null;
  text: string;
  warning: string | null;
}

export interface ParseResult {
  mode: InferenceMode;
  live: boolean;
  source: "deterministic" | "vultr";
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

/** Every live call goes here. The key is not sent to any other host. */
export const VULTR_INFERENCE_BASE = "https://api.vultrinference.com/v1";

export function inferenceChatUrl(): string {
  return `${VULTR_INFERENCE_BASE}/chat/completions`;
}

type FetchLike = typeof fetch;

let lastLive: { at: string; model: string } | null = null;

/**
 * True only after this process got a live Vultr reply that passed the schema.
 * It resets on restart. A key alone never makes it true.
 */
export function liveCallStatus(): { verified: boolean; at: string | null; model: string | null } {
  return { verified: lastLive !== null, at: lastLive?.at ?? null, model: lastLive?.model ?? null };
}

export function resetLiveCallStatus(): void {
  lastLive = null;
}

function recordLive(model: string | null): void {
  lastLive = { at: new Date().toISOString(), model: model ?? "" };
}

/** A key is present. Live mode still has to be selected explicitly. */
export function inferenceConfigured(): boolean {
  const key = process.env.VULTR_INFERENCE_API_KEY?.trim() ?? "";
  const model = process.env.VULTR_INFERENCE_MODEL?.trim() ?? "";
  return key.length > 0 && !PLACEHOLDER.test(key) && model.length > 0 && !PLACEHOLDER.test(model);
}

export function configuredInferenceMode(): "demo" | "live" {
  return loadConfig().inferenceMode;
}

/**
 * Explain a solver decision. Demo mode never calls the network.
 * Live mode asks Vultr for a JSON summary, then drops anything that fails the schema.
 * The summary cannot change fire_at.
 */
export async function explainDecision(
  input: { orderNumber: string; carPlate: string; decision: SolveResult },
  options?: { fetchImpl?: FetchLike },
): Promise<Explanation> {
  const text = deterministicExplanation(input.orderNumber, input.decision);
  if (configuredInferenceMode() === "demo") {
    return { mode: "demo", live: false, source: "deterministic", model: null, text, warning: null };
  }
  const model = process.env.VULTR_INFERENCE_MODEL?.trim() || null;
  if (!inferenceConfigured()) {
    return {
      mode: "live-failed",
      live: false,
      source: "deterministic",
      model,
      text,
      warning: "INFERENCE_MODE=live but the API key or model is empty. No request was sent.",
    };
  }
  try {
    const raw = await chat(
      "Reply with JSON only: {\"summary\":\"one or two sentences\"}. Use only the facts in the user JSON. Do not invent a different fire time. Do not include shell commands or secrets.",
      {
        order_number: input.orderNumber,
        car_plate: input.carPlate,
        decision: input.decision.decision,
        fire_at: input.decision.fire_at,
        ready_by: input.decision.ready_by,
        prep_minutes: input.decision.prep_minutes,
        reason: input.decision.reason,
      },
      "fire_explanation",
      EXPLANATION_SCHEMA,
      options?.fetchImpl ?? fetch,
    );
    const accepted = acceptExplanation(raw, process.env.VULTR_INFERENCE_API_KEY);
    if (!accepted.ok) {
      return {
        mode: "live-rejected",
        live: false,
        source: "deterministic",
        model,
        text,
        warning: `Model output was discarded. ${accepted.reason}`,
      };
    }
    recordLive(model);
    return { mode: "live", live: true, source: "vultr", model, text: accepted.summary, warning: null };
  } catch (error) {
    return {
      mode: "live-failed",
      live: false,
      source: "deterministic",
      model,
      text,
      warning: redact(error instanceof Error ? error.message : "Inference request failed."),
    };
  }
}

/** Parse free text. The stored ticket is never replaced with this result. */
export async function parseUtterance(
  utterance: string,
  menu: MenuName[],
  options?: { fetchImpl?: FetchLike },
): Promise<ParseResult> {
  const stub = stubParse(utterance, menu);
  if (configuredInferenceMode() === "demo") return { ...stub, mode: "demo", live: false };
  if (!inferenceConfigured()) {
    return {
      ...stub,
      mode: "live-failed",
      live: false,
      warning: "INFERENCE_MODE=live but the API key or model is empty. No request was sent.",
    };
  }
  try {
    const raw = await chat(
      "Reply with JSON only matching the schema. Use only skus from the menu. If unsure, use an empty items array and null car_plate.",
      { utterance: utterance.slice(0, 500), menu },
      "order_parse",
      PARSE_SCHEMA,
      options?.fetchImpl ?? fetch,
    );
    const accepted = acceptParse(raw, new Set(menu.map((item) => item.sku)));
    if (!accepted.ok) {
      return {
        ...stub,
        mode: "live-rejected",
        live: false,
        warning: `Model output was discarded. ${accepted.reason}`,
      };
    }
    const names = new Map(menu.map((item) => [item.sku, item.name]));
    recordLive(process.env.VULTR_INFERENCE_MODEL?.trim() || null);
    return {
      mode: "live",
      live: true,
      source: "vultr",
      items: accepted.value.items.map((item) => ({
        sku: item.sku,
        qty: item.qty,
        name: names.get(item.sku) ?? item.sku,
      })),
      car_plate: accepted.value.car_plate,
      note: "Live parse was validated against the menu. It did not change the stored order.",
      warning: null,
    };
  } catch (error) {
    return {
      ...stub,
      mode: "live-failed",
      live: false,
      warning: redact(error instanceof Error ? error.message : "Inference parse failed."),
    };
  }
}

function deterministicExplanation(orderNumber: string, decision: SolveResult): string {
  if (decision.containment === "hostile-refused") {
    return `${orderNumber} stayed off the wheel. ${decision.reason}`;
  }
  if (decision.decision === "refuse") return `I did not schedule ${orderNumber}. ${decision.reason}`;
  return `${orderNumber}: ${decision.reason} Those times came from the solver.`;
}

function stubParse(utterance: string, menu: MenuName[]): Omit<ParseResult, "mode" | "live"> {
  const lower = utterance.toLowerCase();
  const items: ParseResult["items"] = [];
  for (const item of menu) {
    if (lower.includes(item.name.toLowerCase())) items.push({ sku: item.sku, qty: 1, name: item.name });
  }
  const plate = utterance.toUpperCase().match(/\b[A-Z0-9]{2,8}-[A-Z0-9]{1,6}\b/);
  return {
    source: "deterministic",
    items,
    car_plate: plate?.[0] ?? null,
    note: "Demo mode matched menu names and a plate shape. It did not change the stored order.",
    warning: null,
  };
}

async function chat(
  system: string,
  payload: unknown,
  schemaName: string,
  schema: object,
  fetchImpl: FetchLike,
): Promise<string> {
  const key = process.env.VULTR_INFERENCE_API_KEY?.trim() ?? "";
  const model = process.env.VULTR_INFERENCE_MODEL?.trim() ?? "";
  const send = (structured: boolean) =>
    fetchImpl(inferenceChatUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 1024,
        ...(structured
          ? { response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } } }
          : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
      signal: AbortSignal.timeout(8_000),
    });
  let response = await send(true);
  // Some hosted models reject json_schema. Ask again for plain JSON; the reply is still schema-checked here.
  if (response.status === 400 || response.status === 422) response = await send(false);
  if (!response.ok) throw new Error(`Inference HTTP ${response.status}`);
  const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

function redact(message: string): string {
  const key = process.env.VULTR_INFERENCE_API_KEY?.trim();
  const text = key ? message.split(key).join("[redacted]") : message;
  return text.slice(0, 300);
}
