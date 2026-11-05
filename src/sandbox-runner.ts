import { spawn } from "node:child_process";
import type { AppConfig } from "./config.ts";
import { solveFireTime } from "../sandbox/fire-time-solver/solver.ts";
import type { SolveInput, SolveResult } from "../sandbox/fire-time-solver/types.ts";

export interface RunnerOutcome {
  result: SolveResult;
  runner: "inprocess" | "docker" | "inprocess-fallback";
  warning: string | null;
}

/**
 * Run the fire-time solver.
 * `inprocess` calls the pure function in this process (laptop default).
 * `docker` pipes JSON to the container on stdin. The note is never a shell argument.
 * If Docker is missing, the pure function runs and the response says so.
 */
export async function runSolver(input: SolveInput, config: AppConfig): Promise<RunnerOutcome> {
  if (config.sandboxRunner !== "docker") {
    return { result: solveFireTime(input), runner: "inprocess", warning: null };
  }
  try {
    const result = await runInDocker(input, config);
    return { result, runner: "docker", warning: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Docker runner failed.";
    const result = solveFireTime(input);
    result.warnings = [...result.warnings, "Docker runner was unavailable. Used the in-process solver."];
    return {
      result,
      runner: "inprocess-fallback",
      warning: message.slice(0, 300),
    };
  }
}

function runInDocker(input: SolveInput, config: AppConfig): Promise<SolveResult> {
  return new Promise((resolve, reject) => {
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
      config.sandboxImage,
      "--stdin",
    ];
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    if (!child.stdin || !child.stdout || !child.stderr) {
      child.kill("SIGKILL");
      reject(new Error("sandbox pipes were not created"));
      return;
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("sandbox timeout"));
    }, config.solverTimeoutMs);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim().slice(0, 300) || `docker exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as SolveResult);
      } catch {
        reject(new Error("sandbox returned non-JSON"));
      }
    });
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}
