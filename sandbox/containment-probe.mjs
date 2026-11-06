/**
 * Runs inside the solver container. It tries the boundaries and reports what the
 * kernel actually did. It does not interpret guest notes and it does not spawn a shell.
 *
 *   node containment-probe.mjs        boundary report on stdout
 *   node containment-probe.mjs spin   loop until the outer timeout kills the process
 *   node containment-probe.mjs flood  write far more than the control-plane cap
 */
import fs from "node:fs";
import net from "node:net";

const mode = process.argv[2] ?? "probe";

if (mode === "spin") {
  setInterval(() => {}, 1000);
} else if (mode === "flood") {
  const chunk = "A".repeat(4096);
  for (let i = 0; i < 64; i += 1) process.stdout.write(chunk);
} else {
  const report = await probe();
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

async function probe() {
  const uid = typeof process.getuid === "function" ? process.getuid() : -1;
  const writeSandbox = attempt(() => fs.writeFileSync("/sandbox/pwned", "x"));
  const writeEtc = attempt(() => fs.writeFileSync("/etc/pwned", "x"));
  const readShadow = attempt(() => fs.readFileSync("/etc/shadow"));
  const hostCanary = attempt(() => fs.readFileSync("/host-canary"));
  const tmpWrite = attempt(() => {
    fs.writeFileSync("/tmp/route66-probe", "ok");
    fs.unlinkSync("/tmp/route66-probe");
  });
  const network = await probeNetwork();
  const secretPresent = Boolean(process.env.VULTR_INFERENCE_API_KEY);
  const boundariesHeld =
    uid > 0 &&
    !secretPresent &&
    writeSandbox !== "ok" &&
    writeEtc !== "ok" &&
    network !== "connected" &&
    hostCanary !== "ok" &&
    readShadow !== "ok";
  return {
    probe: "route66-containment",
    uid,
    root: uid === 0,
    secret_present: secretPresent,
    write_sandbox: writeSandbox,
    write_etc: writeEtc,
    read_shadow: readShadow,
    network,
    host_canary: hostCanary,
    tmp_write: tmpWrite === "ok",
    boundaries_held: boundariesHeld,
  };
}

function attempt(fn) {
  try {
    fn();
    return "ok";
  } catch (error) {
    return error && error.code ? String(error.code) : "error";
  }
}

function probeNetwork() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "1.1.1.1", port: 80 });
    const done = (code) => {
      socket.destroy();
      resolve(code);
    };
    socket.setTimeout(800);
    socket.once("connect", () => done("connected"));
    socket.once("timeout", () => done("timeout"));
    socket.once("error", (error) => done(error.code || "error"));
  });
}
