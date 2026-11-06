import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Combine one containment run into a single evidence record.
 * The script passes probe JSON and the spin exit code. No secrets belong in this object.
 */
export function assembleContainmentEvidence({ ranAt, probe, spinExit, dockerAvailable }) {
  const networkBlocked = probe?.network !== "connected" && probe?.network !== "ok";
  const nonRoot = probe?.root === false && typeof probe?.uid === "number" && probe.uid > 0;
  const noSecret = probe?.secret_present === false;
  const readOnly = probe?.write_sandbox !== "ok" && probe?.write_etc !== "ok" && probe?.read_shadow !== "ok";
  const killed = typeof spinExit === "number" && spinExit !== 0;
  const verified = Boolean(
    dockerAvailable && probe?.boundaries_held === true && networkBlocked && nonRoot && noSecret && readOnly && killed,
  );
  return {
    ran_at: ranAt,
    verified,
    docker_available: Boolean(dockerAvailable),
    checks: {
      network: networkBlocked ? "blocked" : "not-proven",
      user: nonRoot ? "nonroot" : "not-proven",
      secrets: noSecret ? "absent" : "not-proven",
      filesystem: readOnly ? "read-only" : "not-proven",
      memory: "128m",
      pids: 32,
      cpus: "0.50",
      timeout: killed ? "killed" : "not-proven",
    },
    probe: probe ?? null,
    spin_exit: spinExit ?? null,
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const ranAt = process.argv[2];
  const probePath = process.argv[3];
  const spinRaw = process.argv[4];
  const dockerAvailable = process.argv[5] === "true";
  const probe = !probePath || probePath === "-" ? null : JSON.parse(readFileSync(probePath, "utf8"));
  const spinExit = spinRaw === "null" || spinRaw === undefined ? null : Number(spinRaw);
  process.stdout.write(
    `${JSON.stringify(assembleContainmentEvidence({ ranAt, probe, spinExit, dockerAvailable }), null, 2)}\n`,
  );
}
