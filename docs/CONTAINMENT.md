# Containment demo script

Use this when recording the Challenge 1 video. Say what the shot actually proves.

## 1. Note filter, on a laptop

`npm run sandbox:solve -- --hostile`

The JSON shows `containment: "hostile-refused"` and `executed_payload: false`. This is the solver refusing a string. It is not a container boundary. The kitchen button **Run the note filter** is the same check, and the page says so.

## 2. Container boundaries, on a machine with Docker

`bash scripts/containment-demo.sh`

Show `evidence/containment-probe.json`:

- `uid` is not 0
- `secret_present` is false (the inference key was not in the container)
- `network` is not `connected`
- writes under `/sandbox` and `/etc` failed
- `/host-canary` was not readable
- `boundaries_held` is true

Then show `evidence/containment-spin.json` with a non-zero `spin_exit`. The `timeout` command killed the loop. The host shell kept running.

If Docker is not installed, the script exits 2 and writes `verified: false`. Do not narrate that run as isolation.

## 3. Fail closed

With `SANDBOX_RUNNER=docker`, stop Docker and send a schedule. The API returns 503 and does not invent a fire time in the API process. The ticket stays unscheduled.

## What this repo has not done

No Vultr VM was created from this repository. A probe JSON checked in from another machine is not a substitute for the command above on the VM you submit.
