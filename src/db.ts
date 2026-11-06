import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

let database: DatabaseSync | null = null;
let databasePath: string | null = null;

export function databaseFile(): string {
  return process.env.DATABASE_PATH?.trim() || join(process.cwd(), "data", "drivein.sqlite");
}

export function openDatabase(): DatabaseSync {
  const path = databaseFile();
  if (database && databasePath === path) return database;
  if (database) {
    database.close();
    database = null;
  }
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const next = new DatabaseSync(path);
  next.exec("PRAGMA foreign_keys = ON;");
  next.exec("PRAGMA busy_timeout = 3000;");
  if (path !== ":memory:") next.exec("PRAGMA journal_mode = WAL;");
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "../db/sqlite.sql");
  next.exec(readFileSync(schemaPath, "utf8"));
  seedUnavailable(next);
  database = next;
  databasePath = path;
  return next;
}

export function closeDatabase(): void {
  database?.close();
  database = null;
  databasePath = null;
}

export function databaseOk(): boolean {
  const row = openDatabase().prepare("SELECT 1 AS ok").get() as { ok: number } | undefined;
  return row?.ok === 1;
}

function seedUnavailable(db: DatabaseSync): void {
  const count = db.prepare("SELECT COUNT(*) AS n FROM drivein_unavailable").get() as { n: number };
  if (Number(count.n) > 0) return;
  db.prepare(
    `INSERT INTO drivein_unavailable (sku, item_name, station, reason, flagged_by, resolved, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
  ).run(
    "onion-rings",
    "Onion Rings",
    "fryer",
    "Fryer basket is down for this demo.",
    "kitchen",
    "2026-11-05T15:00:00.000Z",
  );
}
