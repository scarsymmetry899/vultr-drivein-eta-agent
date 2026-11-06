# Route 66 Drive-In

A fictional Austin drive-in where a guest preorders with an ETA and a car plate. An agent on a Vultr VM asks the sandbox when to fire the grill. The kitchen board shows the ticket as waiting, firing, or ready.

This repository is a working demo for [Vultr Agent Rush](https://lablab.ai/ai-hackathons/vultr-hackathon), Challenge 1 — **Blast Radius Zero**. An operator already created the VM `route66-drivein-demo` (`65.20.93.98`) and confirmed health plus a fictional checkout at commit `2d8e2dc`. Later commits, including the Austin-hours check and this decision trail, are on `main` and are not confirmed live until that operator runs [`deploy/UPDATE.md`](deploy/UPDATE.md). This repo does not provision Vultr resources. Local runs use deterministic demo inference. `INFERENCE_MODE=live` is not configured on the VM, and no live call has been verified from this repository.

Nothing here is a real restaurant, a real order, or a payment. Do not commit customer data, phone numbers, or API keys.

## The order

1. The guest builds a ticket on the order page: name, plate, color, items, and the time they will pull in.
2. `POST /api/orders` prices the ticket in USD cents and sales tax, and stores it as `confirmed`. Onion rings are 86 (sold out) in the demo.
3. `POST /api/agent/schedule` runs the fire-time solver. The solver returns `fire_at` (stored as `kitchen_start_at`) and `ready_by`. The ticket stores that trail: arrival, prep, fire, ready, and what changed. The sentence under it is labeled separately. Demo wording is deterministic and makes no network call. Live wording, only if `INFERENCE_MODE=live`, must be a short JSON summary from `https://api.vultrinference.com/v1`. A bad or failed reply is labeled and the solver sentence stays. The model cannot set the clock. An early “I’m at the stall” replaces a future fire time and the trail says so.
4. The kitchen board lists **waiting** (`confirmed`), **firing** (`cooking`), and **ready**. Staff can mark a firing ticket ready and a ready ticket picked up (`completed`).
5. `POST /api/orders/:id/here` means the car is at the stall. If the grill has not started, the ticket rush-fires now. A second tap does not move the fire clock. A ticket that is already firing stays on its current clock if schedule is called again.

The sample solver ticket is a Classic Burger, fries, and a chocolate shake for a 6:10 PM CT arrival on 5 Nov 2026. Prep is 8 minutes (the grill; fries and the shake run at the same time) plus a 3-minute buffer, so the bag is ready at 6:07 PM and the grill fires at 5:59 PM. `npm run sandbox:solve` prints that decision as JSON.

## Vultr stack this scaffold is shaped for

Challenge 1 wants Vultr as the control plane, with real work dispatched into an isolated runner.

| Piece | Role here |
| --- | --- |
| [Vultr Cloud Compute](https://www.vultr.com/products/cloud-compute/) VM | Runs this Express app. The VM is the control plane: it takes the order, calls inference, and dispatches the solver. **Not created by this repo.** |
| [Vultr Serverless Inference](https://docs.vultr.com/vultr-inference-api) | OpenAI-compatible chat at `https://api.vultrinference.com/v1` only. The code does not send the key to another host. Used only when `INFERENCE_MODE=live` and both the key and model are set. Output must match a JSON schema, is length-limited, and is display copy only. The deployed VM is still `INFERENCE_MODE=demo`. |
| Docker sandbox | `sandbox/Dockerfile` runs the solver and `containment-probe.mjs`. The API's docker argv drops capabilities, uses `--network=none`, a read-only root, a non-root user, memory, pid, and CPU caps, and a stdout cap. The image has no secrets. |

Pattern A from the challenge (model proposes, sandbox executes, real output comes back) is the path this app is built toward. The numbers on the board come from the solver. Pattern B (sandboxed browser) is not this product.

The default runner is in-process so `npm run dev` works before Docker is installed. Health and the pages call that **demo** mode and **isolation: none**. Set `SANDBOX_RUNNER=docker` after you build the image. If that container cannot start, times out, or writes too much, the API returns 503 and does not schedule the ticket in-process.

## Challenge 1, and what this PR does

Blast Radius Zero asks for a web agent that does real work inside a sandbox on Vultr, plus a later submission with a public demo URL and a video. The video has to show one containment moment: the sandbox absorbing something unsafe.

What is in this codebase:

- Guest and kitchen pages, and the four order/schedule/board/arrival routes.
- A pure solver for `fire_at` / `ready_by` from ETA, per-item `prep_minutes`, buffer, open hours, and capacity N.
- A note filter that classifies a shell-like string and refuses it (`npm run sandbox:solve -- --hostile`). The kitchen labels this as a filter, not a container proof.
- A container probe (`sandbox/containment-probe.mjs`, `scripts/containment-demo.sh`) that tries a network connect, writes, a host file, and the inference key, then reports the kernel's errors. It runs only under Docker.
- Inference with an explicit `demo` or `live` mode. Live text is schema-checked. Demo mode does not call the network.
- Orders in SQLite (`db/sqlite.sql`), so a restart keeps the board.
- Deploy recipe in [`deploy/RUNBOOK.md`](deploy/RUNBOOK.md) and the safe update in [`deploy/UPDATE.md`](deploy/UPDATE.md).

A public URL exists only for the operator-confirmed build at `2d8e2dc`. A containment video has not been recorded. Draft narrative, recording steps, and submission text are in [`docs/HACKATHON.md`](docs/HACKATHON.md). This repo does not submit them. Participants claim credits on the [hackathon page](https://lablab.ai/ai-hackathons/vultr-hackathon). This repo does not contain a gift code. Vultr GPUs are not part of the event and are not used here.

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

The machine `route66-drivein-demo` at `65.20.93.98` was confirmed by the operator at commit `2d8e2dc` (health and a fictional guest checkout). Do not run `browser-console.sh` again. After a later commit is on `main`, use [`deploy/UPDATE.md`](deploy/UPDATE.md). That update keeps `.env`, the kitchen token, Docker mode, and the SQLite file. Startup adds a `decision_trail` column if the existing file does not have one. It does not wipe orders. Leave `INFERENCE_MODE=demo` until a key is set on the VM by the operator and a real call is checked by hand. Health always reports `live_call_verified: false`.

The guest app is separate screens: menu by category, item, bag, checkout (arrival, vehicle, review), and a ticket timeline. The kitchen is a staff board. Demo wording stays in the footer. There is no account and no card charge.

The pit board is not public. Staff actions and the list of plates need `X-Kitchen-Token`.

The demo lot pin in `.env.example` is `30.2500`, `-97.7490` (South Congress, Austin). It is a map pin for the story, not a business listing.

## Environment

See [`.env.example`](.env.example). Inference URL, key, and model are blank on purpose. Sandbox memory, CPU, and pid caps are documented there and enforced on the Docker argv (they are not passed through a shell). Make.com, Telegram, and Razorpay are not required. The Hyderabad template that mentions them is only under `reference/one-drivein/`.

## What was verified here

`npm test` covers the solver (including daylight time), SQLite orders and status transitions, Austin hours, kitchen auth, demo inference that does not call the network, a live call that is forced to `https://api.vultrinference.com/v1` even if another base URL is set, hostile and HTTP-failed model text that does not replace the solver sentence, the decision trail for a normal schedule and an early check-in, and a Docker runner that fails closed when the daemon is missing.

On a build machine that had Docker, an earlier probe returned `boundaries_held: true` (uid 1000, network `ENETUNREACH`, root writes `EROFS`, no inference key in the container). A spin loop stopped with `docker kill` exited 137. That file is not a recording, it was not produced on `65.20.93.98`, and it is not evidence that the current VM build has been re-probed. Run `bash scripts/containment-demo.sh` on the VM after the update if you want a fresh `evidence/runs/*.json` from that host.

## License

MIT. See [LICENSE](LICENSE).
