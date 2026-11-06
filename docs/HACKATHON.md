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
- Operator-confirmed VM: `route66-drivein-demo`, `65.20.93.98`, Ubuntu 24.04, Mumbai, 1 vCPU / 2 GB. The operator reported containment checks passing on that VM after the decision-trail update. Later commits are live there only after [`deploy/UPDATE.md`](../deploy/UPDATE.md) is run again.
- Inference on that VM: `INFERENCE_MODE=demo` until [Turn on live Vultr Inference](../deploy/UPDATE.md#turn-on-live-vultr-inference) passes. `npm run inference:check` is the one-command proof. Health shows `live_call_verified: true` only after an accepted live reply.
- Containment: verified on a Docker build container on 6 Nov 2026 (probe, killed loop, Docker-down drill, real daemon stop). Re-run on the VM for the video.
- Containment video: not recorded.

## Limits

- Guest order create can start a solver container. The API rate-limits `/api/orders` and `/api/agent/schedule` to 30 requests per minute per IP.
- The order UUID is a capability URL. The public board does not list plates. The kitchen board needs `X-Kitchen-Token`.
- The service user is in the `docker` group so it can start the solver. That group can control the Docker daemon.
- The solver container is `--network=none`, read-only, non-root, capability-dropped, and capped (128m memory, 32 pids, 0.50 CPU). The image has no inference key.
- If `SANDBOX_RUNNER=docker` and Docker cannot run the solver, the API returns 503 and does not compute the fire time in-process.
- Live model text is display only. It cannot set `fire_at`.

## Recording script

Story in one line: a guest changes plans, the agent re-times the grill, and hostile input cannot reach the restaurant.

Record after the VM is on the commit you intend to show, with `SANDBOX_RUNNER=docker`. Use `INFERENCE_MODE=live` only if `npm run inference:check` passed on the VM; otherwise say the wording is deterministic. Never show the kitchen token or the inference key.

**Beat 1 — the agent decides (about 60 s)**

1. Phone-sized window at `http://65.20.93.98:8080/`. Add a burger, fries and a shake. Checkout: tap an arrival slot about 40 minutes out. Point at the line that converts your time to Austin time and the lot-hours bar.
2. Plate and car color, Review, Send order. On the ticket tap **Time the grill**.
3. Show the fire clock and **How this time was set**: Arrival, Prep, Fire, Ready. If live, point at “Wording from Vultr Serverless Inference · <model>” and say the model wrote the sentence but the solver set the clock.

**Beat 2 — the guest changes plans (about 30 s)**

4. Tap **I'm at the stall** well before the fire time. The clock flips to On the grill. The Fire and Ready tiles show the old times under the new ones, and What changed reads `fire … → …, ready … → …`.
5. Desktop window, `kitchen.html`, unlock with the token off camera. The same plate is in Firing with “Rush fire at check-in · planned …”. Mark ready, then Picked up.

**Beat 3 — nothing escapes (about 60 s)**

6. Kitchen System check. **Run the note filter**: REFUSED, nothing executed.
7. **Run the sandbox probe**: each boundary answers HELD (network ENETUNREACH, writes EROFS, no key in the container), ending in `boundaries_held: true`.
8. **Run the Docker-down drill**: FAIL-CLOSED, HTTP 503, ticket not scheduled, no in-process fallback.
9. Optional, stronger: in the VM console `systemctl stop docker`, time a grill on a new ticket and show the 503 with the ticket still Waiting, then `systemctl start docker`. Also show `bash scripts/containment-demo.sh` printing `verified: true` and the spin loop killed with 137.

If any step does not hold, do not narrate it as containment. Say what failed.

## Draft submission text

Route 66 Drive-In is a fictional preorder demo for Challenge 1, Blast Radius Zero. The control plane is a Vultr Cloud Compute VM. The guest sets an arrival in America/Chicago. A Docker solver, started with no network, a read-only root, a non-root user, and memory, pid, and CPU limits, returns the grill fire time and the ready time. Those numbers are stored on the ticket. The sentence next to them is labeled as deterministic demo wording. Live Vultr Serverless Inference is wired only to `https://api.vultrinference.com/v1`, schema-checked, and unable to change the fire time. Whether it is turned on in the deployed environment is stated in the video and backed by `evidence/runs/inference-*.json` from `npm run inference:check` on the VM. The public demo URL and the containment recording are attached by the operator after the VM update and the recording steps in this file. This is not a real restaurant and it does not process payments.

Code: this repository.
Event: https://lablab.ai/ai-hackathons/vultr-hackathon
Inference: https://docs.vultr.com/vultr-inference-api
