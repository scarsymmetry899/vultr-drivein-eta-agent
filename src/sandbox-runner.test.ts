import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import type { ChildProcess } from "node:child_process";
import type { AppConfig } from "./config.ts";
import { dockerRunArgs, runSolver, sandboxChildEnv, SandboxUnavailableError } from "./sandbox-runner.ts";
import type { SpawnLike } from "./sandbox-runner.ts";
import { SAMPLE_INPUT } from "../sandbox/fire-time-solver/solver.ts";
import { DOCKER_DOWN_SOCKET, runFailClosedDrill } from "./schedule.ts";

function dockerConfig(): AppConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    driveIn: "Route 66 Drive-In",
    city: "Austin, TX",
    timezone: "America/Chicago",
    open: "11:00",
    close: "22:00",
    lat: 30.25,
    lng: -97.749,
    salesTaxRate: 0.0825,
    bufferMinutes: 3,
    capacity: 3,
    sandboxRunner: "docker",
    sandboxImage: "route66-fire-solver",
    solverTimeoutMs: 1000,
    solverMaxOutputBytes: 1024,
    sandboxMemory: "128m",
    sandboxCpus: "0.50",
    sandboxPids: 32,
    inferenceMode: "demo",
    databasePath: ":memory:",
  };
}

function fakeSpawn(start: (child: ChildProcess, stdin: PassThrough, stdout: PassThrough) => void): SpawnLike {
  return () => {
    const child = new EventEmitter() as ChildProcess;
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    child.stdin = stdin;
    child.stdout = stdout;
    child.stderr = stderr;
    child.kill = () => {
      child.emit("close", 1, "SIGKILL");
      return true;
    };
    queueMicrotask(() => start(child, stdin, stdout));
    return child;
  };
}

test("docker argv asks for a non-root read-only sandbox with no network", () => {
  const args = dockerRunArgs(dockerConfig(), { args: ["--stdin"] });
  assert.ok(args.includes("--network=none"));
  assert.ok(args.includes("--read-only"));
  assert.ok(args.includes("--cap-drop=ALL"));
  assert.ok(args.includes("--user"));
  assert.ok(args.includes("node"));
  assert.ok(args.includes("--memory"));
  assert.ok(args.includes("128m"));
  assert.ok(args.includes("--pids-limit"));
  assert.equal(args.includes("-e"), false);
  assert.equal(args.includes("--env"), false);
  assert.equal(args.some((arg) => arg.includes("VULTR_INFERENCE_API_KEY")), false);
});

test("the docker client environment does not receive the inference key", () => {
  const env = sandboxChildEnv({
    PATH: "/usr/bin",
    HOME: "/tmp",
    VULTR_INFERENCE_API_KEY: "super-secret",
    INFERENCE_MODE: "live",
  });
  assert.equal(env.PATH, "/usr/bin");
  assert.equal(env.VULTR_INFERENCE_API_KEY, undefined);
  assert.equal(env.INFERENCE_MODE, undefined);
});

test("a missing docker daemon fails closed", async () => {
  const spawnImpl = fakeSpawn((child) => {
    child.emit("error", new Error("spawn docker ENOENT"));
  });
  await assert.rejects(
    () => runSolver(SAMPLE_INPUT, dockerConfig(), spawnImpl),
    (error: unknown) => error instanceof SandboxUnavailableError && /not scheduled/.test(error.message),
  );
});

test("oversized sandbox output is killed and not parsed", async () => {
  const spawnImpl = fakeSpawn((_child, _stdin, stdout) => {
    stdout.write("x".repeat(5000));
  });
  await assert.rejects(
    () => runSolver(SAMPLE_INPUT, dockerConfig(), spawnImpl),
    /cap/,
  );
});

test("docker stdout is the schedule, not a recomputed in-process result", async () => {
  const planted = {
    decision: "refuse",
    fire_at: null,
    ready_by: null,
    prep_minutes: 12345,
    buffer_minutes: 0,
    queue_delay_minutes: 0,
    reason: "from the container",
    warnings: [],
    containment: "rejected",
    contained: false,
    host_effects: "none",
    executed_payload: false,
    rule: null,
  };
  const spawnImpl = fakeSpawn((child, _stdin, stdout) => {
    stdout.end(JSON.stringify(planted));
    child.emit("close", 0);
  });
  const outcome = await runSolver(SAMPLE_INPUT, dockerConfig(), spawnImpl);
  assert.equal(outcome.isolation, "docker");
  assert.equal(outcome.result.prep_minutes, 12345);
  assert.equal(outcome.result.reason, "from the container");
});

test("docker-down drill points docker at a missing daemon and reports fail-closed", async () => {
  let seenHost = "";
  const spawnImpl: SpawnLike = (_cmd, _args, options) => {
    seenHost = String((options as { env?: NodeJS.ProcessEnv }).env?.DOCKER_HOST ?? "");
    return fakeSpawn((child) => child.emit("close", 1, null))("docker", [], {});
  };
  const report = await runFailClosedDrill(dockerConfig(), spawnImpl);
  assert.equal(seenHost, DOCKER_DOWN_SOCKET);
  assert.equal(report.applicable, true);
  assert.equal(report.held, true);
  assert.equal(report.status, 503);
  assert.equal(report.scheduled, false);
  assert.equal(report.in_process_fallback, false);
});

test("docker-down drill says it proves nothing in-process", async () => {
  const report = await runFailClosedDrill({ ...dockerConfig(), sandboxRunner: "inprocess" });
  assert.equal(report.applicable, false);
  assert.equal(report.held, false);
});
