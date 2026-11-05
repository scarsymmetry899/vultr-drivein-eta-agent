import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface MenuItem {
  sku: string;
  name: string;
  description: string;
  price_cents: number;
  prep_minutes: number;
  station: string;
  allergens: string[];
}

interface MenuFile {
  drive_in: string;
  city: string;
  currency: string;
  items: MenuItem[];
}

let cached: MenuFile | null = null;

export function loadMenu(): MenuFile {
  if (cached) return cached;
  const path = join(dirname(fileURLToPath(import.meta.url)), "../data/menu.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as MenuFile;
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    throw new Error("data/menu.json has no items.");
  }
  cached = parsed;
  return parsed;
}

export function findMenuItem(sku: string): MenuItem | undefined {
  return loadMenu().items.find((item) => item.sku === sku);
}
