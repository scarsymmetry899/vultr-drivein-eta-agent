import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import type { AppConfig } from "./config.ts";
import { solveFireTime } from "../sandbox/fire-time-solver/solver.ts";
import type { SolveInput, SolveResult } from "../sandbox/fire-time-solver/types.ts";

export type Isolation = "none" | "docker";
export type SpawnLike = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export class SandboxUnavailableError extends Error {
  readonly isolation = "docker" as const;
  readonly failClosed = true;
  constructor(message: string) {
    super(message);
    this.name = "SandboxUnavailableError";
  }
}

export interface RunnerOutcome {
  result: SolveResult;
  runner: "inprocess" | "docker";
  isolation: Isolation;
  warning: string | null;
}

export interface ProbeReport {
  probe: string;
  uid: number;
  root: boolean;
  secret_present: boolean;
  write_sandbox: string;
  write_etc: string;
  read_shadow: string;
  network: string;
  host_canary: string;
  tmp_write: boolean;
  boundaries_held: boolean;
}

/**
 * Child environment for the docker CLI. The inference key is not copied in.
 * Docker would not inject host env into the container unless `-e` is passed,
 * and these args never pass `-e`.
 */
export function sandboxChildEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  if (source.PATH) env.PATH = source.PATH;
  if (source.HOME) env.HOME = source.HOME;
  if (source.DOCKER_HOST) env.DOCKER_HOST = source.DOCKER_HOST;
  return env;
}

export function dockerRunArgs(config: AppConfig, options: { entrypoint?: string; args: string[] }): string[] {
  const args = [
    "run",
    "--rm",
    "-i",
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt",
    "no-new-privileges",
    "--memory",
    config.sandboxMemory,
    "--memory-swap",
    config.sandboxMemory,
    "--pids-limit",
    String(config.sandboxPids),
    "--cpus",
    config.sandboxCpus,
    "--user",
    "node",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=16m",
  ];
  if (options.entrypoint) args.push("--entrypoint", options.entrypoint);
  args.push(config.sandboxImage, ...options.args);
  return args;
}

/**
 * In-process mode is an explicit demo with no isolation.
 * Docker mode fail-closes: a daemon error, timeout, or oversized stdout does not
 * fall back to the in-process solver.
 */
export async function runSolver(
  input: SolveInput,
  config: AppConfig,
  spawnImpl: SpawnLike = spawn,
  childEnv: NodeJS.ProcessEnv = sandboxChildEnv(),
): Promise<RunnerOutcome> {
  if (config.sandboxRunner !== "docker") {
    return {
      result: solveFireTime(input),
      runner: "inprocess",
      isolation: "none",
      warning: "Demo runner. The solver ran in this process, not in a sandbox.",
    };
  }
  const result = await runCaptured<SolveResult>(
    config,
    { args: ["--stdin"] },
    JSON.stringify(input),
    spawnImpl,
    (stdout) => JSON.parse(stdout) as SolveResult,
    childEnv,
  );
  return { result, runner: "docker", isolation: "docker", warning: null };
}

/** Runs the boundary probe inside the solver image. Refuses to pretend when Docker is off. */
export async function runContainmentProbe(
  config: AppConfig,
  spawnImpl: SpawnLike = spawn,
): Promise<ProbeReport> {
  if (config.sandboxRunner !== "docker") {
    throw new SandboxUnavailableError(
      "The boundary probe requires SANDBOX_RUNNER=docker. In-process demo mode cannot prove isolation.",
    );
  }
  return runCaptured(
    config,
    { entrypoint: "node", args: ["/sandbox/containment-probe.mjs"] },
    "",
    spawnImpl,
    (stdout) => parseProbe(stdout),
  );
}

async function runCaptured<T>(
  config: AppConfig,
  command: { entrypoint?: string; args: string[] },
  stdin: string,
  spawnImpl: SpawnLike,
  parse: (stdout: string) => T,
  childEnv: NodeJS.ProcessEnv = sandboxChildEnv(),
): Promise<T> {
  const args = dockerRunArgs(config, command);
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortReason: string | null = null;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new SandboxUnavailableError(message));
    };
    const ok = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    let child: ChildProcess;
    try {
      child = spawnImpl("docker", args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: childEnv,
      });
    } catch (error) {
      fail(error instanceof Error ? error.message : "Could not start docker.");
      return;
    }
    if (!child.stdin || !child.stdout || !child.stderr) {
      child.kill("SIGKILL");
      fail("Sandbox pipes were not created. The ticket was not scheduled.");
      return;
    }
    timer = setTimeout(() => {
      abortReason = `Sandbox exceeded ${config.solverTimeoutMs}ms and was killed. The ticket was not scheduled.`;
      child.kill("SIGKILL");
      fail(abortReason);
    }, config.solverTimeoutMs);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > config.solverMaxOutputBytes) {
        abortReason = "Sandbox output exceeded the cap and was killed. The ticket was not scheduled.";
        child.kill("SIGKILL");
        fail(abortReason);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 2000) stderr = stderr.slice(0, 2000);
    });
    child.on("error", (error) => {
      fail(`${error.message}. The ticket was not scheduled.`);
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        fail(abortReason ?? redact(stderr.trim().slice(0, 300) || `docker exited ${code}`).concat(" The ticket was not scheduled."));
        return;
      }
      try {
        ok(parse(stdout));
      } catch {
        fail("Sandbox returned output the control plane would not accept. The ticket was not scheduled.");
      }
    });
    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
}

function parseProbe(stdout: string): ProbeReport {
  const value = JSON.parse(stdout) as Partial<ProbeReport>;
  const report: ProbeReport = {
    probe: typeof value.probe === "string" ? value.probe : "",
    uid: typeof value.uid === "number" ? value.uid : -1,
    root: value.root === true,
    secret_present: value.secret_present === true,
    write_sandbox: typeof value.write_sandbox === "string" ? value.write_sandbox : "",
    write_etc: typeof value.write_etc === "string" ? value.write_etc : "",
    read_shadow: typeof value.read_shadow === "string" ? value.read_shadow : "",
    network: typeof value.network === "string" ? value.network : "",
    host_canary: typeof value.host_canary === "string" ? value.host_canary : "",
    tmp_write: value.tmp_write === true,
    boundaries_held: value.boundaries_held === true,
  };
  if (report.probe !== "route66-containment") {
    throw new Error("unexpected probe");
  }
  return report;
}

function redact(message: string): string {
  const key = process.env.VULTR_INFERENCE_API_KEY?.trim();
  return key ? message.split(key).join("[redacted]") : message;
}
