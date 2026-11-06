import { matchHostile } from "../sandbox/fire-time-solver/solver.ts";

/** Model text is display copy only. It never chooses fire_at and is never passed to a shell. */
export function acceptExplanation(raw: string, secret?: string): { ok: true; summary: string } | { ok: false; reason: string } {
  const parsed = parseObject(raw);
  if (!parsed.ok) return parsed;
  const keys = Object.keys(parsed.value);
  if (keys.length !== 1 || keys[0] !== "summary") {
    return { ok: false, reason: "Inference JSON must contain only summary." };
  }
  const summary = parsed.value.summary;
  if (typeof summary !== "string") return { ok: false, reason: "summary must be a string." };
  const text = summary.trim();
  if (text.length < 1 || text.length > 280) return { ok: false, reason: "summary length is out of range." };
  if (matchHostile(text)) return { ok: false, reason: "summary was rejected by the output filter." };
  if (secret && secret.length > 0 && text.includes(secret)) {
    return { ok: false, reason: "summary was rejected." };
  }
  return { ok: true, summary: text };
}

export interface AcceptedParse {
  items: { sku: string; qty: number }[];
  car_plate: string | null;
}

export function acceptParse(
  raw: string,
  allowedSkus: Set<string>,
): { ok: true; value: AcceptedParse } | { ok: false; reason: string } {
  const parsed = parseObject(raw);
  if (!parsed.ok) return parsed;
  const keys = Object.keys(parsed.value).filter((key) => parsed.value[key] !== undefined);
  if (keys.some((key) => key !== "items" && key !== "car_plate")) {
    return { ok: false, reason: "Inference JSON has unexpected fields." };
  }
  const itemsRaw = parsed.value.items;
  if (!Array.isArray(itemsRaw)) return { ok: false, reason: "items must be an array." };
  const items: { sku: string; qty: number }[] = [];
  for (const entry of itemsRaw) {
    if (entry === null || typeof entry !== "object") return { ok: false, reason: "Each item must be an object." };
    const row = entry as Record<string, unknown>;
    const rowKeys = Object.keys(row);
    if (rowKeys.some((key) => key !== "sku" && key !== "qty")) {
      return { ok: false, reason: "An item has unexpected fields." };
    }
    if (typeof row.sku !== "string" || !allowedSkus.has(row.sku)) {
      return { ok: false, reason: "An item sku is not on the menu." };
    }
    if (!Number.isInteger(row.qty) || (row.qty as number) < 1 || (row.qty as number) > 8) {
      return { ok: false, reason: "An item quantity is out of range." };
    }
    items.push({ sku: row.sku, qty: row.qty as number });
  }
  const plate = parsed.value.car_plate;
  if (plate !== null && plate !== undefined && typeof plate !== "string") {
    return { ok: false, reason: "car_plate must be a string or null." };
  }
  let carPlate: string | null = null;
  if (typeof plate === "string" && plate.trim()) {
    const normalized = plate.toUpperCase().replace(/[\s-]+/g, "-").replace(/^-|-$/g, "");
    if (!/^[A-Z0-9]{2,8}(-[A-Z0-9]{1,6})?$/.test(normalized)) {
      return { ok: false, reason: "car_plate did not match a plate shape." };
    }
    carPlate = normalized;
  }
  return { ok: true, value: { items, car_plate: carPlate } };
}

export const EXPLANATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary"],
  properties: { summary: { type: "string", maxLength: 280 } },
} as const;

export const PARSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "car_plate"],
  properties: {
    car_plate: { type: ["string", "null"] },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sku", "qty"],
        properties: {
          sku: { type: "string" },
          qty: { type: "integer", minimum: 1, maximum: 8 },
        },
      },
    },
  },
} as const;

function parseObject(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false; reason: string } {
  const cleaned = stripFence(stripReasoning(raw));
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    // Some models add a sentence around the JSON. Take the outermost object and let the schema checks decide.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return { ok: false, reason: "Inference did not return JSON." };
    try {
      value = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return { ok: false, reason: "Inference did not return JSON." };
    }
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "Inference JSON must be an object." };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

/** Reasoning models may prefix their answer with a think block. It is not part of the answer. */
function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}
