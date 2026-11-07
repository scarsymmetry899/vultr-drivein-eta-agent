export interface AppConfig {
  host: string;
  port: number;
  driveIn: string;
  city: string;
  timezone: string;
  open: string;
  close: string;
  lat: number;
  lng: number;
  salesTaxRate: number;
  bufferMinutes: number;
  capacity: number;
  sandboxRunner: "inprocess" | "docker";
  sandboxImage: string;
  solverTimeoutMs: number;
  solverMaxOutputBytes: number;
  sandboxMemory: string;
  sandboxCpus: string;
  sandboxPids: number;
  inferenceMode: "demo" | "live";
  databasePath: string;
}

export function loadConfig(): AppConfig {
  const sandboxRunner = process.env.SANDBOX_RUNNER === "docker" ? "docker" : "inprocess";
  return {
    host: process.env.HOST?.trim() || "0.0.0.0",
    port: intInRange(process.env.PORT, 8080, 1, 65535, "PORT"),
    driveIn: process.env.DRIVEIN_NAME?.trim() || "Route 66 Drive-In",
    city: process.env.DRIVEIN_CITY?.trim() || "Austin, TX",
    timezone: timeZone(process.env.DRIVEIN_TIMEZONE),
    open: clock(process.env.DRIVEIN_OPEN, "00:00", "DRIVEIN_OPEN"),
    close: clock(process.env.DRIVEIN_CLOSE, "24:00", "DRIVEIN_CLOSE"),
    lat: floatInRange(process.env.DRIVEIN_LAT, 30.25, -90, 90, "DRIVEIN_LAT"),
    lng: floatInRange(process.env.DRIVEIN_LNG, -97.749, -180, 180, "DRIVEIN_LNG"),
    salesTaxRate: floatInRange(process.env.SALES_TAX_RATE, 0.0825, 0, 0.25, "SALES_TAX_RATE"),
    bufferMinutes: intInRange(process.env.FIRE_BUFFER_MINUTES, 3, 0, 30, "FIRE_BUFFER_MINUTES"),
    capacity: intInRange(process.env.KITCHEN_CAPACITY, 3, 1, 20, "KITCHEN_CAPACITY"),
    sandboxRunner,
    sandboxImage: imageName(process.env.SANDBOX_IMAGE),
    solverTimeoutMs: intInRange(process.env.SOLVER_TIMEOUT_MS, 5000, 200, 30_000, "SOLVER_TIMEOUT_MS"),
    solverMaxOutputBytes: intInRange(process.env.SOLVER_MAX_OUTPUT_BYTES, 16_384, 1024, 65_536, "SOLVER_MAX_OUTPUT_BYTES"),
    sandboxMemory: memory(process.env.SANDBOX_MEMORY),
    sandboxCpus: cpus(process.env.SANDBOX_CPUS),
    sandboxPids: intInRange(process.env.SANDBOX_PIDS, 32, 8, 256, "SANDBOX_PIDS"),
    inferenceMode: inferenceMode(process.env.INFERENCE_MODE),
    databasePath: process.env.DATABASE_PATH?.trim() || "data/drivein.sqlite",
  };
}

function intInRange(raw: string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function floatInRange(raw: string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number from ${min} to ${max}.`);
  }
  return value;
}

function timeZone(raw: string | undefined): string {
  const value = raw?.trim() || "America/Chicago";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
  } catch {
    throw new Error(`DRIVEIN_TIMEZONE is not a known zone (${value}).`);
  }
  return value;
}

function inferenceMode(raw: string | undefined): "demo" | "live" {
  const value = (raw ?? "demo").trim().toLowerCase();
  if (value === "demo" || value === "live") return value;
  throw new Error("INFERENCE_MODE must be demo or live.");
}

function clock(raw: string | undefined, fallback: string, name: string): string {
  const value = raw?.trim() || fallback;
  if (name === "DRIVEIN_CLOSE" && value === "24:00") return value;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error(`${name} must be HH:MM, or 24:00 for close.`);
  }
  return value;
}

function imageName(raw: string | undefined): string {
  const value = raw?.trim() || "route66-fire-solver";
  if (!/^[a-z0-9][a-z0-9._:/-]{0,127}$/i.test(value)) {
    throw new Error("SANDBOX_IMAGE must be a Docker image name.");
  }
  return value;
}

function memory(raw: string | undefined): string {
  const value = raw?.trim() || "128m";
  if (!/^\d+[bkmg]$/i.test(value)) throw new Error("SANDBOX_MEMORY must look like 128m.");
  return value;
}

function cpus(raw: string | undefined): string {
  const value = raw?.trim() || "0.50";
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("SANDBOX_CPUS must be a number.");
  return value;
}
