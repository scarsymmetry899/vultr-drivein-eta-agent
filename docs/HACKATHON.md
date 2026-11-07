# Challenge 2 draft — Future of Work

This file is a draft for the operator. It is not a submission, a slide deck, or a registration change. Do not send it to organizers from this repository.

The service is rule-based and multi-step. A guest orders. The solver schedules the grill. An early arrival re-times that clock. Kitchen staff mark the bag ready, then picked up. Vultr Serverless Inference may write the sentence. It does not own the clock, the bag, or the handoff. Challenge 1 containment is the boundary around the solver, not a claim that the kitchen is autonomous.

## Narration

One spoken line: the guest sets an arrival, the solver times the grill, a person finishes the bag.

Say who owns each step. The guest times the grill and can check in early. The solver sets fire and ready. Kitchen staff mark ready and picked up. If the bag is overdue or the car is late, say that a person decides and the board will not close the ticket by itself. If the footer names a model, say that reply was accepted by this server process and clears on restart. If the footer says no reply has been accepted yet, do not call the sentence a live model. Pay is at the window. There is no card charge, no labor savings, and no real restaurant.

A video has not been recorded. A slide deck has not been made. A final submission has not been sent. Ready and picked up were not clicked on the process that started at 13:45:56 IST on 7 Nov 2026.

## Observed live reply

The operator reports the VM is serving `6704bcc5801b11b253fdfdd51d64fd24cfeae709`. At 13:45:56 IST on 7 Nov 2026, health showed `live_call_verified: false` because the restart cleared the flag. The record is [`deploy/DEPLOYED.md`](../deploy/DEPLOYED.md). Until the next accepted reply, the footer is deterministic wording.

The previous process accepted `deepseek-v4.1-flash-1017` for ticket `R66-23873` at 00:53 IST on 7 Nov 2026. The Austin tiles were 1:49 PM and 1:57 PM CST. That check is not this process.

An earlier ticket, `R66-17299`, accepted the same model at `2026-11-06T17:59:23.023Z`. That sentence still contained `2026-11-06T18:19:00.000Z` and `2026-11-06T18:27:00.000Z`, while the tiles were 12:19 PM and 12:27 PM Austin. A restart cleared that check too.

## Hackathon account

Project page: https://lablab.build/ai-hackathons/vultr-hackathon/route66

The operator reports one member, enrolled, with Discord joined. Online was chosen. A form field was not saved. This file does not change that registration.

Sources:

- Event: [Vultr Agent Rush](https://lablab.ai/ai-hackathons/vultr-hackathon)
- Inference API: [Vultr Inference API](https://docs.vultr.com/vultr-inference-api)

## What this is

Route 66 Drive-In is a fictional Austin lot and a Challenge 2 service counter. The event's named focus areas are sales operations, finance and accounting, HR and recruitment, customer support, and procurement. This demo is closest to customer support and is not those other desks. A guest builds a ticket with a plate and an arrival time. The Express app on a Vultr VM stores the order and asks a Docker solver for `fire_at` and `ready_by`. The ticket shows those solver facts, and a separate sentence that is either deterministic demo wording or, only in live mode, a schema-checked summary from Vultr Serverless Inference. Timestamps inside that sentence are shown in Austin time. The stored fire and ready values stay ISO.

It is not a restaurant, a pilot, or an autonomous kitchen. It does not take payment. It does not claim labor savings.

## What is actually true today

- Public code: this repository, `main` at `6704bcc5801b11b253fdfdd51d64fd24cfeae709` after pull request 14.
- Operator-reported VM: `route66-drivein-demo`, `65.20.93.98`, Ubuntu 24.04, Mumbai, 1 vCPU / 2 GB, serving that same SHA. Reported at 13:45:56 IST on 7 Nov 2026. Health: ok, sqlite, docker, fail-closed, inference mode live and configured, kitchen auth on, `live_call_verified: false`. Kitchen without a token: 401. Config, token, and SQLite checksums matched across the update.
- The last accepted model reply on record is `deepseek-v4.1-flash-1017` for ticket `R66-23873` at 00:53 IST on 7 Nov 2026. It belongs to the process this restart replaced. No new model call was made for the update.
- Staff ready and picked up on this restarted board: not clicked. The merged unit test covers the rule. It is not a recording of the VM.
- Containment: verified on a Docker build container on 6 Nov 2026 (probe, killed loop, Docker-down drill, real daemon stop). Re-run on the VM when recording.
- Video, slide deck, and final submission: not sent.

## Limits

- Guest order create can start a solver container. The API rate-limits `/api/orders` and `/api/agent/schedule` to 30 requests per minute per IP.
- The order UUID is a capability URL. The public board does not list plates. The kitchen board needs `X-Kitchen-Token`.
- The service user is in the `docker` group so it can start the solver. That group can control the Docker daemon.
- The solver container is `--network=none`, read-only, non-root, capability-dropped, and capped (128m memory, 32 pids, 0.50 CPU). The image has no inference key.
- If `SANDBOX_RUNNER=docker` and Docker cannot run the solver, the API returns 503 and does not compute the fire time in-process.
- Live model text is display only. It cannot set `fire_at`.

## Recording script

Story in one line: a guest changes plans, the agent re-times the grill, and hostile input cannot reach the restaurant.

The operator reports the VM is on `6704bcc` with `SANDBOX_RUNNER=docker` and, after the 13:45:56 IST restart, no accepted reply in this process. Read the footer before you speak. If it says no reply has been accepted, say the wording is deterministic. If a new Time the grill names a model, say that reply was accepted by this process and clears on restart. Never show the kitchen token or the inference key. Point at the model sentence and confirm the times are Austin clock times, not raw UTC. Mark ready and picked up on camera if you show them. Do not say an earlier session already proved those clicks on this process.

**Beat 1 — the agent decides (about 60 s)**

1. Phone-sized window at `http://65.20.93.98:8080/`. Add a burger, fries and a shake. Checkout: tap an arrival slot about 40 minutes out. Point at the line that converts your time to Austin time and the lot-hours bar.
2. Plate and car color, Review, Send order. On the ticket tap **Time the grill**.
3. Show the fire clock and **How this time was set**: Arrival, Prep, Fire, Ready. If live, point at “Wording from Vultr Serverless Inference · <model>” and say the model wrote the sentence but the solver set the clock.

**Beat 2 — the guest changes plans (about 30 s)**

4. Tap **I'm at the stall** well before the fire time. The clock flips to On the grill. The Fire and Ready tiles show the old times under the new ones, and What changed reads `fire … → …, ready … → …`.
5. Desktop window, `kitchen.html`, unlock with the token off camera. The same plate is in Firing with “Rush fire at check-in · planned …”, the next-step line for kitchen staff, and Who did what on the guest ticket naming the guest check-in. Mark ready, then Picked up. If the status line shows a refusal, leave it on screen. Do not narrate a refused change as saved.

**Beat 3 — nothing escapes (about 60 s)**

6. Kitchen System check. **Run the note filter**: REFUSED, nothing executed.
7. **Run the sandbox probe**: each boundary answers HELD (network ENETUNREACH, writes EROFS, no key in the container), ending in `boundaries_held: true`.
8. **Run the Docker-down drill**: FAIL-CLOSED, HTTP 503, ticket not scheduled, no in-process fallback.
9. Optional, stronger: in the VM console `systemctl stop docker`, time a grill on a new ticket and show the 503 with the ticket still Waiting, then `systemctl start docker`. Also show `bash scripts/containment-demo.sh` printing `verified: true` and the spin loop killed with 137.

If any step does not hold, do not narrate it as containment. Say what failed.

## Draft submission text

Route 66 Drive-In is a fictional restaurant service counter for Challenge 2, Future of Work. The named focus areas are sales operations, finance and accounting, HR and recruitment, customer support, and procurement. This demo is closest to customer support: a guest ticket, a timing check, a bounded action, and a person when the bag or the car needs a decision. It is not a CRM, a ledger, a hiring desk, or a purchasing system. The control plane is a Vultr Cloud Compute VM. The guest sets an arrival in America/Chicago. A Docker solver, started with no network, a read-only root, a non-root user, and memory, pid, and CPU limits, returns the grill fire time and the ready time. Those numbers stay on the ticket. An early check-in re-times them by rule. Passing the ready time does not mark the bag ready. Kitchen staff do that, then mark it picked up. Vultr Serverless Inference, wired only to `https://api.vultrinference.com/v1`, may supply the sentence. It is schema-checked and cannot change the fire time. The public URL is http://65.20.93.98:8080/ on commit 6704bcc. At 13:45:56 IST on 7 Nov 2026 the operator reported health ok, Docker isolation, inference mode live, and live_call_verified false after the restart. An earlier process accepted deepseek-v4.1-flash-1017 for ticket R66-23873 at 00:53 IST, with Austin tiles at 1:49 PM and 1:57 PM CST. That check is not the current process. A video, a deck, and a final submission have not been sent. This is not a real restaurant, it does not process payments, and it does not claim labor savings or an enterprise rollout.

Focus areas: https://lablab.ai/ai-hackathons/vultr-hackathon
Project page: https://lablab.build/ai-hackathons/vultr-hackathon/route66

Code: this repository.
Event: https://lablab.ai/ai-hackathons/vultr-hackathon
Inference: https://docs.vultr.com/vultr-inference-api
