# Route 66 Drive-In

A fictional Austin drive-in. A guest opens a ticket with an arrival time and a plate. The solver on a Vultr VM decides when the grill fires. Kitchen staff mark the bag ready and hand it off. Optional Vultr Serverless Inference may write the sentence under those times. It does not set them.

This repository is the Challenge 2 entry for [Vultr Agent Rush](https://lablab.ai/ai-hackathons/vultr-hackathon), **Future of Work**. The event names five focus areas: sales operations, finance and accounting, HR and recruitment, customer support, and procurement ([event page](https://lablab.ai/ai-hackathons/vultr-hackathon)). This demo is a restaurant service counter. The nearest named area is customer support: a ticket is opened, the timing is checked, a bounded action is taken, and a person is required when the bag or the car needs a decision. It is not a CRM, a ledger, a hiring desk, or a purchasing system.

The isolated solver is the Challenge 1 boundary this service uses. The fire time and the ready time come from that solver. The model is optional wording.

## Where the project stands

The operator reported the VM update at 13:45:56 IST on 7 Nov 2026. The sanitized record is [`deploy/DEPLOYED.md`](deploy/DEPLOYED.md). This repo does not provision Vultr resources and has not seen the inference key.

- The VM `route66-drivein-demo` (`65.20.93.98`) is on `main` at `6704bcc5801b11b253fdfdd51d64fd24cfeae709`, the merge of pull request 14. The work tree was clean, and that SHA matched `origin/main`. The `route66` service was active after the restart.
- Public health was ok, SQLite, Docker, fail-closed, inference mode `live`, inference configured, kitchen auth on, and `live_call_verified: false`. The kitchen board without a token was 401. The `.env` file, the kitchen token file, and the SQLite file kept the same checksums. No new model call and no new ticket were part of that check.
- The previous process had accepted `deepseek-v4.1-flash-1017` at `2026-11-06T19:23:01.701Z` for ticket `R66-23873` (00:53 IST on 7 Nov 2026; Austin tiles 1:49 PM and 1:57 PM CST). That flag died with the restart. The current footer should not name a live reply until the next accepted one.
- An earlier ticket, `R66-17299`, accepted the same model at `2026-11-06T17:59:23.023Z`. That sentence still showed UTC. A restart cleared that check.
- LabLab project page: [route66](https://lablab.build/ai-hackathons/vultr-hackathon/route66). One member. Enrolled. Discord joined. Online was chosen. A form field was not saved. No video, no slide deck, and no final submission have been sent.
- Ready and picked up on this restarted board were not clicked. The merged unit test says a due fire starts cooking and a passed `ready_by` stays with staff. That click is not a VM recording.

Nothing here is a real restaurant, a real order, a payment, a labor saving, or an enterprise rollout. Do not commit customer data, phone numbers, or API keys. License is MIT. The Hyderabad adaptation is disclosed in [`docs/SOURCE.md`](docs/SOURCE.md).

## The order

1. The guest builds a ticket on the order page: name, plate, color, items, and the time they will pull in.
2. `POST /api/orders` prices the ticket in USD cents and sales tax, and stores it as `confirmed`. Onion rings are 86 (sold out) in the demo.
3. `POST /api/agent/schedule` runs the fire-time solver. The solver returns `fire_at` (stored as `kitchen_start_at`) and `ready_by`. The ticket stores that trail: arrival, prep, fire, ready, and what changed. The sentence under it is labeled separately. Demo wording is deterministic and makes no network call. Live wording, only if `INFERENCE_MODE=live`, must be a short JSON summary from `https://api.vultrinference.com/v1`. A bad or failed reply is labeled and the solver sentence stays. The model cannot set the clock. An early “I’m at the stall” replaces a future fire time and the trail says so with both clocks, for example `fire 5:59 PM CST → 5:50 PM CST`. The ticket's Fire and Ready tiles show the old time under the new one, and the kitchen card says “Rush fire at check-in · planned 5:59”.
4. The kitchen board lists **waiting** (`confirmed`), **firing** (`cooking`), and **ready**. Each card says who acts next. Kitchen staff mark a firing ticket ready and a ready ticket picked up (`completed`). Those two steps are people. An overdue bag or a late car stays on the card until someone acts. A refused status change stays on the status line. It is not replaced by the lane counts.
5. `POST /api/orders/:id/here` means the car is at the stall. If the grill has not started, the check-in rule rush-fires now and the trail records the guest as the actor. A second tap does not move the fire clock. A ticket that is already firing stays on its current clock if schedule is called again. A second Time the grill while the first call is still running waits for that call. It does not start a second one.

The sample solver ticket is a Classic Burger, fries, and a chocolate shake for a 6:10 PM CT arrival on 5 Nov 2026. Prep is 8 minutes (the grill; fries and the shake run at the same time) plus a 3-minute buffer, so the bag is ready at 6:07 PM and the grill fires at 5:59 PM. `npm run sandbox:solve` prints that decision as JSON.

## Vultr stack

Challenge 2 asks for a Vultr VM backend and a public web app. Serverless Inference is optional. This app uses the VM for the service workflow. Inference, when live, only supplies the sentence. Challenge 1's sandbox is how the solver runs.

| Piece | Role here |
| --- | --- |
| [Vultr Cloud Compute](https://www.vultr.com/products/cloud-compute/) VM | Runs this Express app. The VM is the control plane: it takes the order, calls inference, and dispatches the solver. **Not created by this repo.** |
| [Vultr Serverless Inference](https://docs.vultr.com/vultr-inference-api) | Optional. OpenAI-compatible chat at `https://api.vultrinference.com/v1` only. The code does not send the key to another host. Used only when `INFERENCE_MODE=live` and both the key and model are set. Output must match a JSON schema, is length-limited, and is display copy only. ISO timestamps inside that sentence are shown in Austin time. The stored solver timestamps stay ISO. The process restarted at 13:45:56 IST on 7 Nov 2026 reports `live_call_verified: false`. The last accepted reply on record, `deepseek-v4.1-flash-1017` for ticket `R66-23873`, belongs to the process that restart replaced. |
| Docker sandbox | `sandbox/Dockerfile` runs the solver and `containment-probe.mjs`. The API's docker argv drops capabilities, uses `--network=none`, a read-only root, a non-root user, memory, pid, and CPU caps, and a stdout cap. The image has no secrets. |

The numbers on the board come from the solver. The model does not propose the fire time. A sandboxed browser is not this product.

The default runner is in-process so `npm run dev` works before Docker is installed. Health and the pages call that **demo** mode and **isolation: none**. Set `SANDBOX_RUNNER=docker` after you build the image. If that container cannot start, times out, or writes too much, the API returns 503 and does not schedule the ticket in-process.

## Challenge 2 workflow

Future of Work asks for a multi-step workflow on a Vultr VM, with a public web app. Inference is optional. A video and a clear use-case explanation are still submission items. They are not in this repository yet. Draft narration is in [`docs/HACKATHON.md`](docs/HACKATHON.md). This repo does not submit it, does not publish a deck, and does not message organizers.

The service steps are rules:

1. The guest builds the ticket.
2. The solver sets fire and ready.
3. An early check-in re-times a future fire. A second check-in does not move the clock.
4. Kitchen staff mark the bag ready.
5. Kitchen staff mark it picked up.

Exceptions stay visible. A closed-hours arrival is refused. A sold-out item is refused. If Docker cannot run the solver, the API returns 503 and does not invent a fire time. An overdue bag or a late car stays on the board until a person acts.

What is in this codebase:

- Guest and kitchen pages, and the four order/schedule/board/arrival routes.
- A pure solver for `fire_at` / `ready_by` from ETA, per-item `prep_minutes`, buffer, open hours, and capacity N.
- A note filter that classifies a shell-like string and refuses it (`npm run sandbox:solve -- --hostile`). The kitchen labels this as a filter, not a container proof.
- A container probe (`sandbox/containment-probe.mjs`, `scripts/containment-demo.sh`) that tries a network connect, writes, a host file, and the inference key, then reports the kernel's errors. It runs only under Docker.
- Inference with an explicit `demo` or `live` mode. Live text is schema-checked. Demo mode does not call the network.
- Orders in SQLite (`db/sqlite.sql`), so a restart keeps the board.
- Deploy recipe in [`deploy/RUNBOOK.md`](deploy/RUNBOOK.md) and the safe update in [`deploy/UPDATE.md`](deploy/UPDATE.md).

The public URL is `http://65.20.93.98:8080/`. The operator reports it is serving `6704bcc5801b11b253fdfdd51d64fd24cfeae709`. A video has not been recorded. Vultr GPUs are not part of the event and are not used here.

## How this differs from ONE Drive-in

The domain ideas — an ETA, a plate, a single orders table, a kitchen start time, and an 86 list — come from the Hyderabad ONE Drive-in project `onedrivein-ordernow-preorder`. The seed snapshot is in [`reference/one-drivein/`](reference/one-drivein/) and is not executed. Full table of what moved and what stayed behind: [`docs/SOURCE.md`](docs/SOURCE.md).

In short, the US scaffold uses USD cents and sales tax, one Austin menu, a web kitchen board, and a sandbox that computes `fire_at`. It does not depend on Make.com, Telegram, Razorpay, GST, Jubilee Hills counters, or Supabase edge functions. Arrival is the guest tapping **I'm at the stall**, not a GPS watch.

## Layout

```
public/                     guest order page and kitchen board
src/                        Express control plane
db/sqlite.sql               running SQLite store
db/schema.sql               Postgres-shaped reference
agent/                      demo vs live inference, schema checks
sandbox/fire-time-solver/   pure fire_at / ready_by solver
sandbox/containment-probe.mjs
sandbox/Dockerfile          isolated runner
deploy/                     VM unit, compose, runbook
reference/one-drivein/      unmodified Hyderabad seed
```

Orders persist in the SQLite file from `DATABASE_PATH` (default `data/drivein.sqlite`). The status machine is `confirmed | cooking | ready | completed | no_show`. This app writes the first four. `no_show` is reserved. Conditional updates keep a second "I'm here" or a late schedule from moving a ticket backwards.

## Run locally

Node.js 22 or newer.

```bash
npm ci
npm test
npm run dev
```

Open `http://localhost:8080` for the guest page and `http://localhost:8080/kitchen.html` for the board. The demo window is 11:00–22:00 America/Chicago. An arrival outside that window is refused when you schedule.

```bash
npm run sandbox:solve
npm run sandbox:solve -- --hostile
npm run sandbox:solve -- --cases
```

Stdout is JSON. A one-line banner goes to stderr so a container can parse stdout.

```bash
docker build -f sandbox/Dockerfile -t route66-fire-solver sandbox
timeout 5s docker run --rm -i \
  --network=none \
  --read-only \
  --cap-drop=ALL \
  --security-opt no-new-privileges \
  --memory=128m --memory-swap=128m \
  --pids-limit=32 \
  --cpus=0.50 \
  --user node \
  route66-fire-solver
```

Then set `SANDBOX_RUNNER=docker` in `.env` if the API should dispatch into that image. A failed container does not schedule the ticket. The boundary probe is `bash scripts/containment-demo.sh`. It writes one JSON file under `evidence/runs/`. If Docker is down, that file has `verified: false` and the script exits 2. See [`docs/CONTAINMENT.md`](docs/CONTAINMENT.md). A checked-in probe from a laptop is not a video and is not the Vultr VM.

## Deploy on the existing Vultr VM

The machine `route66-drivein-demo` at `65.20.93.98` is the operator's VM. Do not run `browser-console.sh` again. After a later commit is on `main`, use [`deploy/UPDATE.md`](deploy/UPDATE.md). The update reported at 13:45:56 IST on 7 Nov 2026 is [`deploy/DEPLOYED.md`](deploy/DEPLOYED.md). That update keeps `.env`, the kitchen token, Docker mode, the inference key, and the SQLite file. Startup adds a `decision_trail` column if the existing file does not have one. It does not wipe orders. Health reports `live_call_verified: true` only after this server process got a live Vultr reply that passed the schema. It goes back to `false` on restart until the next live reply. The guest footer follows that process. It names the model after an accepted reply, and it does not claim a reply this process has not accepted.

The guest app is separate screens: menu by category, item, bag, checkout (arrival, vehicle, review), and a ticket with a live fire clock. Under 960px it is a phone layout with a tab bar. At 960px and up it has a sidebar, a bag rail on the menu, and checkout arrival and vehicle side by side. The kitchen is a staff board. There is no account and no card charge.

The pit board is not public. Staff actions and the list of plates need `X-Kitchen-Token`.

The demo lot pin in `.env.example` is `30.2500`, `-97.7490` (South Congress, Austin). It is a map pin for the story, not a business listing.

## Proving it

Three proofs, each with a command and a kitchen button. The kitchen buttons need the token.

| Proof | Command | Kitchen (System check) |
| --- | --- | --- |
| The agent's decision is visible | Place a ticket, time the grill, tap **I'm at the stall** early | Firing card shows “Rush fire at check-in · planned …” |
| Hostile work stays inside the sandbox | `bash scripts/containment-demo.sh` | **Run the sandbox probe** streams each boundary as HELD or BROKEN |
| Scheduling stops when the sandbox is gone | stop Docker, then time a grill: HTTP 503, ticket stays `confirmed` | **Run the Docker-down drill** points the docker CLI at a missing daemon and runs the real solver path |
| Live Vultr Inference answers | `npm run inference:check` | chip `live_call_verified true · <model>` |

`bash scripts/set-inference.sh` (as root on the VM, ideally over SSH) asks for the key with hidden input, lets you pick a model, saves both, runs the check, and turns live mode on only if it passed. `npm run inference:check` reads the key and model from `.env`, never prints the key, and writes `evidence/runs/inference-<stamp>.json`. With no model set it lists the models the key can use. If the model rejects `json_schema` output, the app asks once more for plain JSON and still schema-checks the reply.

## Environment

See [`.env.example`](.env.example). Inference URL, key, and model are blank on purpose. Sandbox memory, CPU, and pid caps are documented there and enforced on the Docker argv (they are not passed through a shell). Make.com, Telegram, and Razorpay are not required. The Hyderabad template that mentions them is only under `reference/one-drivein/`.

## What was verified here

`npm test` covers the solver (including daylight time), SQLite orders and status transitions, Austin hours, kitchen auth, demo inference that does not call the network, a live call that is forced to `https://api.vultrinference.com/v1` even if another base URL is set, hostile and HTTP-failed model text that does not replace the solver sentence, the decision trail for a normal schedule and an early check-in, and a Docker runner that fails closed when the daemon is missing.

Tests also cover the early check-in trail with both clocks, the Docker-down drill, the json_schema retry, `live_call_verified` turning true only after an accepted live reply, Austin wording for the UTC sentence returned on ticket `R66-17299`, the footer for a verified reply and for live mode with no reply yet, and kitchen attribution for ready and picked up. A ticket whose fire time and ready time are already past stays `cooking` across two board reads. It does not move to ready by itself. The solver `fire_at` in the Austin-wording test stays `2026-11-06T18:19:00.000Z`. On that tree, `npm test` was 49 passed and `tsc --noEmit` passed. Those commands were not re-run on the VM.

On 6 Nov 2026, in a cloud build container with Docker 29.9.2 (not the VM), `bash scripts/containment-demo.sh` returned `verified: true`: uid 1000, network `ENETUNREACH`, `/etc` and `/sandbox` writes `EROFS`, `/etc/shadow` `EACCES`, no inference key, spin loop exit 137. The app on `SANDBOX_RUNNER=docker` scheduled a ticket in the container, the kitchen probe reported `boundaries_held: true`, the Docker-down drill returned 503 with nothing scheduled, and with the daemon actually stopped a schedule returned 503 and the ticket stayed `confirmed`. That run is not evidence for `65.20.93.98`.

Before that, on a build machine that had Docker, an earlier probe returned `boundaries_held: true` (uid 1000, network `ENETUNREACH`, root writes `EROFS`, no inference key in the container). A spin loop stopped with `docker kill` exited 137. That file is not a recording, it was not produced on `65.20.93.98`, and it is not evidence that the current VM build has been re-probed. Run `bash scripts/containment-demo.sh` on the VM after the update if you want a fresh `evidence/runs/*.json` from that host.

## License

MIT. See [LICENSE](LICENSE).
