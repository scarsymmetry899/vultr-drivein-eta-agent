# Challenge 2 draft — Future of Work

This file is a draft for the operator. It is not a submission, a slide deck, or a registration change. Do not send it to organizers from this repository.

The service is rule-based and multi-step. A guest orders. The solver schedules the grill. An early arrival re-times that clock. Kitchen staff mark the bag ready, then picked up. Vultr Serverless Inference may write the sentence. It does not own the clock, the bag, or the handoff. Challenge 1 containment is the boundary around the solver, not a claim that the kitchen is autonomous.

## Narration

One spoken line: the guest sets an arrival, the solver times the grill, a person finishes the bag.

Say who owns each step. The guest times the grill and can check in early. The solver sets fire and ready. Kitchen staff mark ready and picked up. If the bag is overdue or the car is late, say that a person decides and the board will not close the ticket by itself. If the footer names a model, say that reply was accepted by this server process and clears on restart. If the footer says no reply has been accepted yet, do not call the sentence a live model. Pay is at the window. There is no card charge, no labor savings, and no real restaurant.

At the 8 November 15:50 UTC readiness check, the six-slide PDF is complete and attached, and the LabLab draft shows 57% with basic fields saved. Video and remaining technical fields are pending. Final submission has not been sent. Ready and pickup were verified through authenticated localhost API calls, not browser footage.

## Observed live reply

The last VM-recorded application release is `65ca138a54f41a7ba394de4b5abb749bcc57c594`, merged via PR #13 and restarted at 10:56:46 UTC on 7 November. A fresh schema-accepted `deepseek-v4.1-flash-1017` response at `2026-11-07T11:03:21.133Z` set `live_call_verified=true`. This flag resets on restart; inspect it again when recording. Evidence: [`deploy/DEPLOYED.md`](../deploy/DEPLOYED.md).

## Hackathon account

Project page: https://lablab.build/ai-hackathons/vultr-hackathon/route66

The signed-in team page was checked on 8 November: one member, Online participation, C2-Powering the Future of Work, and a draft in progress. The saved basic form shows Customer Support and Vultr. This file does not change that registration.

Sources:

- Event: [Vultr Agent Rush](https://lablab.ai/ai-hackathons/vultr-hackathon)
- Inference API: [Vultr Inference API](https://docs.vultr.com/vultr-inference-api)

## What this is

Route 66 Drive-In is a fictional Austin lot and a Challenge 2 service counter. The event's named focus areas are sales operations, finance and accounting, HR and recruitment, customer support, and procurement. This demo is closest to customer support and is not those other desks. A guest builds a ticket with a plate and an arrival time. The Express app on a Vultr VM stores the order and asks a Docker solver for `fire_at` and `ready_by`. The ticket shows those solver facts, and a separate sentence that is either deterministic demo wording or, only in live mode, a schema-checked summary from Vultr Serverless Inference. Timestamps inside that sentence are shown in Austin time. The stored fire and ready values stay ISO.

It is not a restaurant, a pilot, or an autonomous kitchen. It does not take payment. It does not claim labor savings.

## What is actually true today

The existing VM was backed up and updated on **7 November 2026**. Full sanitized evidence: [`deploy/DEPLOYED.md`](../deploy/DEPLOYED.md). Current checklist: [`deploy/READINESS.md`](../deploy/READINESS.md).

- PR [#13](https://github.com/scarsymmetry899/vultr-drivein-eta-agent/pull/13) is merged. Last VM-recorded application release: `65ca138a54f41a7ba394de4b5abb749bcc57c594` on `route66-drivein-demo` (`65.20.93.98`), restarted at 10:56:46 UTC.
- Root-only database/configuration backup passed integrity checking. Three existing orders survived migration. Kitchen token was unchanged; only service hours changed to `00:00`–`24:00` in Austin.
- Dependency installation, typecheck, and **72 tests** passed on the VM after the hours change. Docker solver was rebuilt.
- Authenticated localhost API checks verified scheduling, staff hold, labeled close-arrival simulation, hold release, ready, and pickup. Held check-in and repeated pickup returned 409. Completed fictional ticket `R66-12515` remains as evidence. These checks are not a browser recording.
- Health reported SQLite, Docker, fail-closed, live/configured inference, and kitchen authentication. Unauthenticated board returned 401. A schema-accepted `deepseek-v4.1-flash-1017` reply at `2026-11-07T11:03:21.133Z` set process-local inference verification true; restart clears it.
- Submission check on 8 November at 15:50 UTC: PDF attached and basic fields saved; portal shows 57%. Video and remaining technical fields are pending. The verified deadline is 8 November 23:00 UTC (9 November 04:30 IST). Final submission has not been sent and requires user review.

## Limits

- Guest order create can start a solver container. The API rate-limits `/api/orders` and `/api/agent/schedule` to 30 requests per minute per IP.
- The order UUID is a capability URL. The public board does not list plates. The kitchen board needs `X-Kitchen-Token`.
- The service user is in the `docker` group so it can start the solver. That group can control the Docker daemon.
- The solver container is `--network=none`, read-only, non-root, capability-dropped, and capped (128m memory, 32 pids, 0.50 CPU). The image has no inference key.
- If `SANDBOX_RUNNER=docker` and Docker cannot run the solver, the API returns 503 and does not compute the fire time in-process.
- Live model text is display only. It cannot set `fire_at`.

## Recording script

Story in one line: a guest changes plans, the solver re-times the grill, and kitchen staff complete the handoff.

The last VM-recorded application release is `65ca138`, with Docker isolation and 24-hour service. Public health does not expose its commit hash. Inspect the current footer before recording: the latest response observed in public health was accepted at 13:58:26.460 UTC on 8 November, but restart clears the flag. If no reply has been accepted on the current process, say the wording is deterministic. Never show the kitchen token or inference key. Show Austin clock times. Mark ready and picked up on camera if demonstrated; earlier API checks are not footage.

**Beat 1 — the agent decides (about 60 s)**

1. Phone-sized window at `https://route66-drivein-demo.duckdns.org/`. Add a burger, fries and a shake. Checkout: tap an arrival slot about 40 minutes out. Point at the line that converts your time to Austin time and the lot-hours bar.
2. Plate and car color, Review, Send order. On the ticket tap **Time the grill**.
3. Show the fire clock and **How this time was set**: Arrival, Prep, Fire, Ready. If live, point at “Wording from Vultr Serverless Inference · <model>” and say the model wrote the sentence but the solver set the clock.

**Beat 2 — the guest changes plans (about 30 s)**

4. Tap **I'm at the stall** well before the fire time. The clock flips to On the grill. The Fire and Ready tiles show the old times under the new ones, and What changed reads `fire … → …, ready … → …`.
5. Desktop window, `kitchen.html`, unlock with the token off camera. The same plate is in Firing with “Rush fire at check-in · planned …”, the next-step line for kitchen staff, and Who did what on the guest ticket naming the guest check-in. Mark ready, then Picked up. If the status line shows a refusal, leave it on screen. Do not narrate a refused change as saved.

**Optional Beat 3 — containment evidence (about 60 s)**

Challenge 2 requires a recorded workflow demo, but the event reserves the mandatory containment moment for Challenge 1. Include these checks only if actually recorded; do not delay the required service workflow to stage an unverified proof.

6. Kitchen System check. **Run the note filter**: REFUSED, nothing executed.
7. **Run the sandbox probe**: each boundary answers HELD (network ENETUNREACH, writes EROFS, no key in the container), ending in `boundaries_held: true`.
8. **Run the Docker-down drill**: FAIL-CLOSED, HTTP 503, ticket not scheduled, no in-process fallback.
9. Optional, stronger: in the VM console `systemctl stop docker`, time a grill on a new ticket and show the 503 with the ticket still Waiting, then `systemctl start docker`. Also show `bash scripts/containment-demo.sh` printing `verified: true` and the spin loop killed with 137.

If any step does not hold, do not narrate it as containment. Say what failed.

## Draft submission text

Route 66 Drive-In is a fictional restaurant service counter for Challenge 2, Future of Work. It is closest to customer support: a guest ticket, a timing check, a bounded action, and a human handoff. A Vultr Cloud Compute VM runs the workflow with SQLite persistence and 24-hour service in America/Chicago. A Docker solver, isolated with no network, read-only root, non-root execution, and resource limits, determines fire and ready times. Staff holds block automatic starts; labeled close-arrival simulation or stall check-in can advance cooking when allowed. Kitchen staff mark ready and picked up; elapsed time does not finish the bag. Optional Vultr Serverless Inference produces schema-checked display wording and cannot set the clock. The public application is https://route66-drivein-demo.duckdns.org/. The last VM-recorded application release is 65ca138a54f41a7ba394de4b5abb749bcc57c594; public health does not report a commit hash. On 7 November 2026, the VM passed typecheck and 72 tests; authenticated API checks verified migration, scheduling, holds, arrival simulation, staff handoff, and a fresh deepseek-v4.1-flash-1017 reply. These checks are not a browser recording. Real GPS, payment processing, and enterprise capabilities remain future work. This is not a real restaurant or a claim of labor savings.

Preparation check on 8 November at 15:50 UTC: PDF attached, basic fields saved, draft at 57%; video and remaining technical fields pending. Deadline and requirements are verified below. Final entry needs user review; nothing has been submitted.

Focus areas: https://lablab.ai/ai-hackathons/vultr-hackathon
Project page: https://lablab.build/ai-hackathons/vultr-hackathon/route66

Code: this repository.
Event: https://lablab.ai/ai-hackathons/vultr-hackathon
Inference: https://docs.vultr.com/vultr-inference-api

## Verified deadline and requirements

Checked in the live [official event page](https://lablab.build/ai-hackathons/vultr-hackathon) on 8 November 2026. The banner reads **“Deadline: Nov 9, 4:30 AM IST”**. The schedule says **“Nov 9”**, **“4:30 AM India Standard Time”**, **“End of Submissions!”**. That is **8 November 2026 at 23:00 UTC**. The live page has a schedule that the search snapshot omitted.

Challenge 2 accepts multi-step rule-based workflows. It requires a public GitHub repository with setup instructions, a Vultr-hosted backend and web app, demo URL, recorded video, and architecture/use-case explanation. Inference is optional. The mandatory video containment moment applies to Challenge 1.

LabLab also asks for a title, short and long descriptions, technology/category tags, cover image, video, slides, app platform, and application URL. The README should explain Vultr's role and backend architecture. A separate architecture report is not needed. Official judging requires submission on LabLab; Vultr Community sharing is optional.

Use the HTTPS URL in every final field and slide. Do not use the old port-8080 public URL. Reopen the final draft, verify every attachment and URL, and obtain the user's review before submitting.
