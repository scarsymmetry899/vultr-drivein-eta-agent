import { HOSTILE_DEMO_INPUT, SAMPLE_INPUT, solveFireTime } from "./solver.ts";
import type { SolveInput, SolveResult } from "./types.ts";

/**
 * Demo CLI. Stdout is always JSON so the Docker runner can parse it.
 * A banner goes to stderr and is not part of the result.
 *
 *   npm run sandbox:solve
 *   npm run sandbox:solve -- --hostile
 *   npm run sandbox:solve -- --cases
 *   npm run sandbox:solve -- --stdin     # JSON on stdin, used by the container
 */

const timeoutMs = readTimeout(process.env.SOLVER_TIMEOUT_MS);
const timer = setTimeout(() => {
  const expired: SolveResult = {
    decision: "refuse",
    fire_at: null,
    ready_by: null,
    prep_minutes: 0,
    buffer_minutes: 0,
    queue_delay_minutes: 0,
    reason: `Solver exceeded ${timeoutMs}ms and stopped.`,
    warnings: [],
    containment: "rejected",
    contained: false,
    host_effects: "none",
    executed_payload: false,
    rule: null,
  };
  process.stdout.write(`${JSON.stringify(expired)}\n`);
  process.exit(124);
}, timeoutMs);

const args = new Set(process.argv.slice(2));

try {
  if (args.has("--stdin")) {
    const raw = await readStdin();
    const input = JSON.parse(raw) as SolveInput;
    write(solveFireTime(input));
  } else if (args.has("--cases")) {
    console.error("Route 66 fire-time solver — sample cases (pure function, no shell)");
    write(demoCases().map((entry) => ({ name: entry.name, result: solveFireTime(entry.input) })));
  } else if (args.has("--hostile")) {
    console.error("Route 66 fire-time solver — containment drill (payload is not executed)");
    write(solveFireTime(HOSTILE_DEMO_INPUT));
  } else {
    console.error("Route 66 fire-time solver — sample ticket (pure function, no shell)");
    write(solveFireTime(SAMPLE_INPUT));
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Solver failed.";
  write({
    decision: "refuse",
    fire_at: null,
    ready_by: null,
    prep_minutes: 0,
    buffer_minutes: 0,
    queue_delay_minutes: 0,
    reason: message,
    warnings: [],
    containment: "rejected",
    contained: false,
    host_effects: "none",
    executed_payload: false,
    rule: null,
  });
  clearTimeout(timer);
  process.exit(1);
}

clearTimeout(timer);

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function readTimeout(raw: string | undefined): number {
  const parsed = Number(raw ?? 5000);
  if (!Number.isFinite(parsed) || parsed < 200 || parsed > 30_000) return 5000;
  return parsed;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
    if (Buffer.concat(chunks).length > 32_000) {
      throw new Error("Solver input is too large.");
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

function demoCases(): { name: string; input: SolveInput }[] {
  return [
    { name: "sample", input: SAMPLE_INPUT },
    { name: "hostile", input: HOSTILE_DEMO_INPUT },
    {
      name: "before-open",
      input: {
        ...SAMPLE_INPUT,
        now: "2026-11-05T09:00:00-06:00",
        eta: "2026-11-05T10:30:00-06:00",
      },
    },
    {
      name: "capacity",
      input: {
        ...SAMPLE_INPUT,
        capacity_n: 1,
        active_fires: [
          { fire_at: "2026-11-05T17:59:00-06:00", ready_by: "2026-11-05T18:07:00-06:00" },
        ],
      },
    },
    {
      name: "after-close",
      input: {
        ...SAMPLE_INPUT,
        now: "2026-11-05T21:00:00-06:00",
        eta: "2026-11-05T22:30:00-06:00",
      },
    },
  ];
}
