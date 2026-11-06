#!/usr/bin/env bash
# Build the solver image and record what the container actually refused.
# Exits 2 when Docker is missing. Does not print API keys.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p evidence
IMAGE="${SANDBOX_IMAGE:-route66-fire-solver}"

if ! docker info >/dev/null 2>&1; then
  printf '%s\n' '{"verified":false,"reason":"docker info failed; isolation was not executed"}' | tee evidence/containment-probe.json
  echo "Docker is not available. Isolation was not executed." >&2
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
docker run --rm "${run_flags[@]}" --entrypoint node "$IMAGE" /sandbox/containment-probe.mjs | tee evidence/containment-probe.json

echo "Spin loop (docker kill after 2s)"
spin_id="$(docker run -d "${run_flags[@]}" --entrypoint node "$IMAGE" /sandbox/containment-probe.mjs spin)"
sleep 2
docker kill "$spin_id" >/dev/null
spin_code="$(docker wait "$spin_id")"
docker rm "$spin_id" >/dev/null 2>&1 || true
printf '{"spin_exit":%s,"killed":%s}\n' "$spin_code" "$([[ "$spin_code" -ne 0 ]] && echo true || echo false)" | tee evidence/containment-spin.json

echo "Flood (stdout is bounded by the control plane when the API launches the solver)"
set +e
docker run --rm "${run_flags[@]}" --entrypoint node "$IMAGE" /sandbox/containment-probe.mjs flood | head -c 64 >/dev/null
set -e
echo "flood stream closed early" | tee evidence/containment-flood.txt

echo "Evidence written under evidence/. Review containment-probe.json before calling isolation verified."
