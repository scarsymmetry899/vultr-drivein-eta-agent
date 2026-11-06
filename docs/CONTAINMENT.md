# Containment demo script

Use this when a recording needs the sandbox boundary. That boundary is how the Challenge 2 service runs the solver. The shot proves the container, not a finished submission. A video has not been recorded. Say what the shot actually proves.

## 1. Note filter, on a laptop

`npm run sandbox:solve -- --hostile`

The JSON shows `containment: "hostile-refused"` and `executed_payload: false`. This is the solver refusing a string. It is not a container boundary. The kitchen button **Run the note filter** is the same check, and the page says so.

## 2. Container boundaries, on a machine with Docker

`bash scripts/containment-demo.sh`

The script writes one file, `evidence/runs/<UTC stamp>.json`.

Show that file when `verified` is true:

- `checks.network` is `blocked`
- `checks.user` is `nonroot`
- `checks.secrets` is `absent`
- `checks.filesystem` is `read-only`
- `checks.timeout` is `killed` (`spin_exit` is not 0; the script uses `docker kill` after two seconds)
- `probe.boundaries_held` is true

If Docker is not installed, the script exits 2 and the same file has `verified: false`. Do not narrate that run as isolation.

## 3. Fail closed

With `SANDBOX_RUNNER=docker`, stop Docker and send a schedule. The API returns 503 and does not invent a fire time in the API process. The ticket stays unscheduled.

For the video without stopping Docker on the VM, use **Run the Docker-down drill** in the kitchen System check (`POST /api/agent/fail-closed`, kitchen token required). It runs the same solver call a schedule uses, with the docker CLI pointed at `unix:///run/route66-docker-down-drill.sock`, which does not exist. Expect `FAIL-CLOSED`, HTTP 503, ticket not scheduled, no in-process fallback. It uses the sample ticket and writes no order. In-process mode answers `N/A`, because there is no sandbox to lose.

## What this repo has not done

The operator created `route66-drivein-demo` separately. A probe JSON from a laptop is not a substitute for the command above on that VM, and it is not a video.
