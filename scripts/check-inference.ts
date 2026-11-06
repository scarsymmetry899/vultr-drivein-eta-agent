/**
 * One live call to Vultr Serverless Inference, using the key and model in .env.
 *
 *   npm run inference:check
 *
 * - Never prints the key. The evidence file never contains it.
 * - With no model set, lists the models this key can use and stops.
 * - Forces INFERENCE_MODE=live for this process only. It does not edit .env.
 * - Fire and ready come from the solver. The model only writes the sentence.
 *
 * Exit 0: a live reply passed the schema. Exit 1: the call failed or was discarded. Exit 2: not configured.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadDotEnv } from "../src/env.ts";
import { explainDecision, VULTR_INFERENCE_BASE } from "../agent/inference.ts";
import { SAMPLE_INPUT, solveFireTime } from "../sandbox/fire-time-solver/solver.ts";

loadDotEnv();

const key = process.env.VULTR_INFERENCE_API_KEY?.trim() ?? "";
const model = process.env.VULTR_INFERENCE_MODEL?.trim() ?? "";

if (!key) {
  console.error("VULTR_INFERENCE_API_KEY is empty in .env. Add the key from the Vultr console (Serverless Inference), then run again.");
  process.exit(2);
}

if (!model) {
  console.error("VULTR_INFERENCE_MODEL is empty. Models this key can use:");
  try {
    const response = await fetch(`${VULTR_INFERENCE_BASE}/models`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      console.error(`  GET /models answered HTTP ${response.status}. Check the key.`);
      process.exit(1);
    }
    const body = (await response.json()) as { data?: { id?: string }[] };
    for (const entry of body.data ?? []) if (entry.id) console.error(`  ${entry.id}`);
  } catch (error) {
    console.error(`  Could not list models: ${error instanceof Error ? error.message.split(key).join("[redacted]") : "request failed"}`);
    process.exit(1);
  }
  console.error("Set VULTR_INFERENCE_MODEL to one of these in .env, then run again.");
  process.exit(2);
}

process.env.INFERENCE_MODE = "live";
const decision = solveFireTime(SAMPLE_INPUT);
const started = Date.now();
const explanation = await explainDecision({ orderNumber: "R66-CHECK", carPlate: "KLM-4821", decision });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

const record = {
  kind: "vultr-inference-check",
  stamp,
  endpoint: `${VULTR_INFERENCE_BASE}/chat/completions`,
  model,
  latency_ms: Date.now() - started,
  verified: explanation.live === true && explanation.source === "vultr",
  mode: explanation.mode,
  summary: explanation.text,
  warning: explanation.warning,
  solver: { fire_at: decision.fire_at, ready_by: decision.ready_by, prep_minutes: decision.prep_minutes },
  note: "fire_at and ready_by came from the solver. The summary is display text and cannot change them.",
};

mkdirSync("evidence/runs", { recursive: true });
const file = `evidence/runs/inference-${stamp}.json`;
writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify(record, null, 2));
console.error(record.verified ? `Live call verified. Evidence: ${file}` : `Live call NOT verified (${record.mode}). Evidence: ${file}`);
process.exit(record.verified ? 0 : 1);
