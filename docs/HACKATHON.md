# Challenge 1 draft — Blast Radius Zero

This file is a draft for the operator. It is not a submission. Do not send it to organizers from this repository.

Sources:

- Event: [Vultr Agent Rush](https://lablab.ai/ai-hackathons/vultr-hackathon)
- Inference API: [Vultr Inference API](https://docs.vultr.com/vultr-inference-api)

## What this is

Route 66 Drive-In is a fictional Austin lot. A guest builds a ticket with a plate and an arrival time. The Express app on a Vultr VM stores the order and asks a Docker solver for `fire_at` and `ready_by`. The ticket shows those solver facts, and a separate sentence that is either deterministic demo wording or, only in live mode, a schema-checked summary from Vultr Serverless Inference.

It is not a restaurant, a pilot, or an autonomous kitchen. It does not take payment. It does not claim labor savings.

## What is actually true today

- Public code: this repository.
- Operator-confirmed VM: `route66-drivein-demo`, `65.20.93.98`, Ubuntu 24.04, Mumbai, 1 vCPU / 2 GB. Confirmed at commit `2d8e2dc` with health and one fictional checkout. Later commits are not confirmed on that host until [`deploy/UPDATE.md`](../deploy/UPDATE.md) is run there.
- Inference on that VM: `INFERENCE_MODE=demo`. No live call has been verified. Health reports `live_call_verified: false` on purpose.
- Containment video: not recorded. A laptop Docker probe is not a substitute for a recording or for a probe on the VM.

## Limits

- Guest order create can start a solver container. The API rate-limits `/api/orders` and `/api/agent/schedule` to 30 requests per minute per IP.
- The order UUID is a capability URL. The public board does not list plates. The kitchen board needs `X-Kitchen-Token`.
- The service user is in the `docker` group so it can start the solver. That group can control the Docker daemon.
- The solver container is `--network=none`, read-only, non-root, capability-dropped, and capped (128m memory, 32 pids, 0.50 CPU). The image has no inference key.
- If `SANDBOX_RUNNER=docker` and Docker cannot run the solver, the API returns 503 and does not compute the fire time in-process.
- Live model text is display only. It cannot set `fire_at`.

## Recording script

Record after the VM is on the commit you intend to show, with `SANDBOX_RUNNER=docker` and `INFERENCE_MODE=demo`. Do not put the kitchen token or the inference key on screen.

1. Open `http://65.20.93.98:8080/` on a phone-sized window. Show the menu, add a burger, and open checkout.
2. Set an arrival inside 11:00–22:00 Austin time. Point at the line that shows the phone time and the Austin time. Then show one arrival after 22:00 Austin and the block that refuses it.
3. Finish a fictional ticket. On the ticket, show **How this time was set**: arrival, prep, fire, ready, the change line, and the badge that says the wording is deterministic.
4. On the same ticket, tap **I'm at the stall** before the planned fire. Show the new line that cooking started at check-in and that the earlier fire time was replaced.
5. Open the kitchen page. Show the token gate, then the board with the same plate in the firing lane and the change line on the card. Mark it ready, then picked up.
6. In the VM console, run `bash scripts/containment-demo.sh`. Show `evidence/runs/<stamp>.json` with `verified: true`, `checks.network` blocked, `checks.user` nonroot, `checks.secrets` absent, `checks.filesystem` read-only, and `checks.timeout` killed. Then stop Docker and show a schedule returning 503 with the ticket left unscheduled. Start Docker again before you leave.

If step 6 fails, do not narrate it as containment. Say the probe did not hold.

## Draft submission text

Route 66 Drive-In is a fictional preorder demo for Challenge 1, Blast Radius Zero. The control plane is a Vultr Cloud Compute VM. The guest sets an arrival in America/Chicago. A Docker solver, started with no network, a read-only root, a non-root user, and memory, pid, and CPU limits, returns the grill fire time and the ready time. Those numbers are stored on the ticket. The sentence next to them is labeled as deterministic demo wording. Live Vultr Serverless Inference is wired only to `https://api.vultrinference.com/v1`, schema-checked, and unable to change the fire time. It is not turned on in the deployed environment, and a live call has not been verified. The public demo URL and the containment recording are attached by the operator after the VM update and the recording steps in this file. This is not a real restaurant and it does not process payments.

Code: this repository.
Event: https://lablab.ai/ai-hackathons/vultr-hackathon
Inference: https://docs.vultr.com/vultr-inference-api
