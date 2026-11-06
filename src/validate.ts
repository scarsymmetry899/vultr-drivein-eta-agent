import type { AppConfig } from "./config.ts";
import { findMenuItem } from "./menu.ts";
import { describeArrivalHours, matchHostile } from "../sandbox/fire-time-solver/solver.ts";
import { unavailableBySku } from "./store.ts";
import type { NewOrderInput, OrderItem } from "./types.ts";

const COLORS = new Set(["red", "white", "black", "blue", "silver", "green", "yellow", "other"]);

export function parseOrderBody(body: unknown, config: AppConfig, now = new Date()): NewOrderInput | { error: string } {
  if (body === null || typeof body !== "object") return { error: "Order body must be an object." };
  const record = body as Record<string, unknown>;

  const customerName = cleanName(record.customer_name);
  if (typeof customerName !== "string") return { error: customerName.error };

  const plate = normalizePlate(record.car_plate);
  if (typeof plate !== "string") return { error: plate.error };

  const color = typeof record.car_color === "string" ? record.car_color.trim().toLowerCase() : "";
  if (!COLORS.has(color)) return { error: "Pick a car color." };

  const model = cleanModel(record.car_model);
  if (typeof model !== "string") return { error: model.error };

  const notes = cleanNotes(record.notes ?? record.special_notes);
  if (typeof notes !== "string") return { error: notes.error };

  const etaRaw = record.eta ?? record.eta_timestamp;
  if (typeof etaRaw !== "string") return { error: "An arrival time is required." };
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(etaRaw.trim())) {
    return { error: "Arrival time must include a timezone offset." };
  }
  const eta = new Date(etaRaw);
  if (Number.isNaN(eta.getTime())) return { error: "Arrival time must be a timestamp." };
  const skewMs = 18 * 60 * 60 * 1000;
  if (eta.getTime() < now.getTime() - 5 * 60_000) return { error: "That arrival time is already in the past." };
  if (eta.getTime() > now.getTime() + skewMs) return { error: "Arrival time must be within 18 hours." };
  const hours = describeArrivalHours(eta, config.open, config.close, config.timezone);
  if (!hours.ok) {
    return { error: `${hours.reason} The lot hours are Austin time, not the time on your phone.` };
  }

  const lines = readLines(record.items);
  if ("error" in lines) return lines;

  let subtotal = 0;
  for (const line of lines.items) subtotal += line.price_cents * line.qty;
  const salesTax = Math.round(subtotal * config.salesTaxRate);
  const orderType = eta.getTime() <= now.getTime() + 2 * 60_000 ? "now" : "preorder";

  return {
    customer_name: customerName,
    car_plate: plate,
    car_model: model,
    car_color: color,
    items: lines.items,
    special_notes: notes,
    eta_timestamp: eta.toISOString(),
    eta_time: formatEta(eta, config.timezone),
    subtotal_cents: subtotal,
    sales_tax_cents: salesTax,
    order_type: orderType,
  };
}

function readLines(value: unknown): { items: OrderItem[] } | { error: string } {
  if (!Array.isArray(value) || value.length === 0) return { error: "Add at least one menu item." };
  if (value.length > 12) return { error: "Too many items on one ticket." };
  const items: OrderItem[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") return { error: "Each item needs a sku and a quantity." };
    const row = entry as Record<string, unknown>;
    const sku = typeof row.sku === "string" ? row.sku.trim() : "";
    const menuItem = findMenuItem(sku);
    if (!menuItem) return { error: `Unknown item ${sku || "(blank)"}.` };
    const soldOut = unavailableBySku(sku);
    if (soldOut) return { error: `${menuItem.name} is 86 (sold out). ${soldOut.reason}` };
    const qty = row.qty;
    if (!Number.isInteger(qty) || (qty as number) < 1 || (qty as number) > 8) {
      return { error: `${menuItem.name} quantity must be a whole number from 1 to 8.` };
    }
    items.push({
      sku: menuItem.sku,
      name: menuItem.name,
      qty: qty as number,
      price_cents: menuItem.price_cents,
      prep_minutes: menuItem.prep_minutes,
      station: menuItem.station,
      allergens: [...menuItem.allergens],
    });
  }
  return { items };
}

function cleanName(value: unknown): string | { error: string } {
  if (typeof value !== "string") return { error: "A name is required." };
  const name = value.trim();
  if (!/^[\p{L}][\p{L} .'-]{0,59}$/u.test(name)) {
    return { error: "Name should be letters, up to 60 characters." };
  }
  return name;
}

export function normalizePlate(value: unknown): string | { error: string } {
  if (typeof value !== "string") return { error: "A car plate is required." };
  const plate = value.toUpperCase().replace(/[\s-]+/g, "-").replace(/^-|-$/g, "");
  if (!/^[A-Z0-9]{2,8}(-[A-Z0-9]{1,6})?$/.test(plate)) {
    return { error: "Plate should look like TX-4821." };
  }
  return plate;
}

function cleanModel(value: unknown): string | { error: string } {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") return { error: "Car model must be text." };
  const model = value.trim();
  if (model.length > 40 || !/^[A-Za-z0-9][A-Za-z0-9 .'-]*$/.test(model)) {
    return { error: "Car model should be short plain text." };
  }
  return model;
}

function cleanNotes(value: unknown): string | { error: string } {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") return { error: "Notes must be text." };
  if (value.length > 200) return { error: "Notes must be 200 characters or fewer." };
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    return { error: "Notes contain a character we can't print on a ticket." };
  }
  const rule = matchHostile(value);
  if (rule) return { error: "That note can't go on a ticket." };
  return value.trim();
}

function formatEta(eta: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(eta);
}
