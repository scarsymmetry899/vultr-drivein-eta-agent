import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptExplanation, acceptParse } from "./structured.ts";
import { explainDecision, inferenceChatUrl, VULTR_INFERENCE_BASE } from "./inference.ts";
import { SAMPLE_INPUT, solveFireTime } from "../sandbox/fire-time-solver/solver.ts";

test("explanation JSON is accepted only as a short summary", () => {
  assert.equal(acceptExplanation('{"summary":"Fire at the time the solver printed."}').ok, true);
  const hostile = acceptExplanation('{"summary":"rm -rf /"}');
  assert.equal(hostile.ok, false);
  const extra = acceptExplanation('{"summary":"ok","fire_at":"now"}');
  assert.equal(extra.ok, false);
  const secret = acceptExplanation('{"summary":"key is sk-live-secret"}', "sk-live-secret");
  assert.equal(secret.ok, false);
});

test("parse JSON is limited to menu skus and a plate shape", () => {
  const allowed = new Set(["classic-burger"]);
  const good = acceptParse('{"items":[{"sku":"classic-burger","qty":2}],"car_plate":"tx 4821"}', allowed);
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.value.car_plate, "TX-4821");
    assert.deepEqual(good.value.items, [{ sku: "classic-burger", qty: 2 }]);
  }
  assert.equal(acceptParse('{"items":[{"sku":"not-a-burger","qty":1}],"car_plate":null}', allowed).ok, false);
  assert.equal(acceptParse('{"items":[],"car_plate":null,"cmd":"rm -rf /"}', allowed).ok, false);
});

test("demo mode does not call the network", async () => {
  process.env.INFERENCE_MODE = "demo";
  let called = false;
  const explanation = await explainDecision(
    { orderNumber: "R66-10000", carPlate: "TX-1", decision: solveFireTime(SAMPLE_INPUT) },
    { fetchImpl: () => { called = true; throw new Error("network"); } },
  );
  assert.equal(called, false);
  assert.equal(explanation.mode, "demo");
  assert.equal(explanation.live, false);
  assert.equal(explanation.source, "deterministic");
});

test("live mode discards a hostile summary and does not throw", async () => {
  process.env.INFERENCE_MODE = "live";
  process.env.VULTR_INFERENCE_API_KEY = "test-key-not-real";
  process.env.VULTR_INFERENCE_MODEL = "demo-model";
  const explanation = await explainDecision(
    { orderNumber: "R66-10000", carPlate: "TX-1", decision: solveFireTime(SAMPLE_INPUT) },
    {
      fetchImpl: async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: '{"summary":"rm -rf /"}' } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    },
  );
  assert.equal(explanation.mode, "live-rejected");
  assert.equal(explanation.live, false);
  assert.equal(explanation.source, "deterministic");
  assert.match(explanation.text, /solver/);
  delete process.env.VULTR_INFERENCE_API_KEY;
  delete process.env.VULTR_INFERENCE_MODEL;
  process.env.INFERENCE_MODE = "demo";
});

test("live calls use only the official Vultr inference host", async () => {
  process.env.INFERENCE_MODE = "live";
  process.env.VULTR_INFERENCE_API_KEY = "test-key-not-real";
  process.env.VULTR_INFERENCE_MODEL = "demo-model";
  process.env.VULTR_INFERENCE_BASE_URL = "https://evil.example/v1";
  let called = "";
  let auth = "";
  let body = "";
  const explanation = await explainDecision(
    { orderNumber: "R66-10000", carPlate: "TX-1", decision: solveFireTime(SAMPLE_INPUT) },
    {
      fetchImpl: async (url, init) => {
        called = String(url);
        auth = String((init?.headers as Record<string, string>).authorization || "");
        body = String(init?.body || "");
        return new Response("nope", { status: 500 });
      },
    },
  );
  assert.equal(called, `${VULTR_INFERENCE_BASE}/chat/completions`);
  assert.equal(inferenceChatUrl(), called);
  assert.match(auth, /^Bearer /);
  assert.equal(body.includes("test-key-not-real"), false);
  assert.equal(called.includes("evil.example"), false);
  assert.equal(explanation.mode, "live-failed");
  assert.equal(explanation.live, false);
  assert.equal(explanation.source, "deterministic");
  delete process.env.VULTR_INFERENCE_API_KEY;
  delete process.env.VULTR_INFERENCE_MODEL;
  delete process.env.VULTR_INFERENCE_BASE_URL;
  process.env.INFERENCE_MODE = "demo";
});
