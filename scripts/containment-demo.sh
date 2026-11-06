#!/usr/bin/env bash
# Build the solver image and record one containment run.
# Exits 2 when Docker is missing. Does not print API keys.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p evidence/runs
IMAGE="${SANDBOX_IMAGE:-route66-fire-solver}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN="evidence/runs/${STAMP}.json"

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
if [[ -z "$NODE_BIN" ]]; then
  echo "node was not found on PATH. Evidence was not written." >&2
  exit 1
fi

write_run() {
  "$NODE_BIN" scripts/assemble-evidence.mjs "$STAMP" "$1" "$2" "$3" | tee "$RUN"
}

if ! docker info >/dev/null 2>&1; then
  write_run - null false
  echo "Docker is not available. Isolation was not executed. Evidence: $RUN" >&2
  exit 2
fi

docker build -f sandbox/Dockerfile -t "$IMAGE" sandbox

run_flags=(
  --network=none
  --read-only
  --cap-drop=ALL
  --security-opt no-new-privileges
  --memory=128m
  --memory-swap=128m
  --pids-limit=32
  --cpus=0.50
  --user node
  --tmpfs /tmp:rw,noexec,nosuid,size=16m
)

echo "Boundary probe"
probe_file="$(mktemp)"
docker run --rm "${run_flags[@]}" --entrypoint node "$IMAGE" /sandbox/containment-probe.mjs | tee "$probe_file"

echo "Spin loop (docker kill after 2s)"
spin_id="$(docker run -d "${run_flags[@]}" --entrypoint node "$IMAGE" /sandbox/containment-probe.mjs spin)"
sleep 2
docker kill "$spin_id" >/dev/null
spin_code="$(docker wait "$spin_id")"
docker rm "$spin_id" >/dev/null 2>&1 || true

write_run "$probe_file" "$spin_code" true
rm -f "$probe_file"

echo "Flood (stdout is bounded by the control plane when the API launches the solver)"
set +e
docker run --rm "${run_flags[@]}" --entrypoint node "$IMAGE" /sandbox/containment-probe.mjs flood | head -c 64 >/dev/null
set -e

echo "Evidence written to $RUN. verified is true only when the probe and the killed loop both held."
