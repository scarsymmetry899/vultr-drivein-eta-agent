import assert from "node:assert/strict";
import { test } from "node:test";
import { assembleContainmentEvidence } from "./assemble-evidence.mjs";

const probe = {
  probe: "route66-containment",
  uid: 1000,
  root: false,
  secret_present: false,
  write_sandbox: "EROFS",
  write_etc: "EROFS",
  read_shadow: "EACCES",
  network: "ENETUNREACH",
  host_canary: "ENOENT",
  tmp_write: true,
  boundaries_held: true,
};

test("a full probe plus a killed spin loop is verified evidence", () => {
  const evidence = assembleContainmentEvidence({
    ranAt: "2026-11-06T04:00:00Z",
    probe,
    spinExit: 137,
    dockerAvailable: true,
  });
  assert.equal(evidence.verified, true);
  assert.equal(evidence.checks.network, "blocked");
  assert.equal(evidence.checks.user, "nonroot");
  assert.equal(evidence.checks.secrets, "absent");
  assert.equal(evidence.checks.filesystem, "read-only");
  assert.equal(evidence.checks.timeout, "killed");
});

test("missing Docker is not verified", () => {
  const evidence = assembleContainmentEvidence({
    ranAt: "2026-11-06T04:00:00Z",
    probe: null,
    spinExit: null,
    dockerAvailable: false,
  });
  assert.equal(evidence.verified, false);
  assert.equal(evidence.checks.timeout, "not-proven");
});
