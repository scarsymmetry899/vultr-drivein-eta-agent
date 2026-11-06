# Route 66 Drive-In

A fictional Austin drive-in where a guest preorders with an ETA and a car plate. An agent on a Vultr VM asks the sandbox when to fire the grill. The kitchen board shows the ticket as waiting, firing, or ready.

This repository is a working demo for [Vultr Agent Rush](https://lablab.ai/ai-hackathons/vultr-hackathon), Challenge 1 — **Blast Radius Zero**. It is not deployed. No Vultr resources are provisioned from this repo. Local runs use deterministic demo inference unless you set `INFERENCE_MODE=live` on a machine that has a key.

Nothing here is a real restaurant, a real order, or a payment. Do not commit customer data, phone numbers, or API keys.

## The order

1. The guest builds a ticket on the order page: name, plate, color, items, and the time they will pull in.
2. `POST /api/orders` prices the ticket in USD cents and sales tax, and stores it as `confirmed`. Onion rings are 86 (sold out) in the demo.
3. `POST /api/agent/schedule` runs the fire-time solver. The solver returns `fire_at` (stored as `kitchen_start_at`) and `ready_by`. In demo mode the sentence under the ticket is deterministic. In live mode Vultr Serverless Inference may supply a JSON `summary`, which is rejected if it fails the schema. The model cannot set the clock.
4. The kitchen board lists **waiting** (`confirmed`), **firing** (`cooking`), and **ready**. Staff can mark a firing ticket ready and a ready ticket picked up (`completed`).
5. `POST /api/orders/:id/here` means the car is at the stall. If the grill has not started, the ticket rush-fires now. A second tap does not move the fire clock. A ticket that is already firing stays on its current clock if schedule is called again.

The sample solver ticket is a Classic Burger, fries, and a chocolate shake for a 6:10 PM CT arrival on 5 Nov 2026. Prep is 8 minutes (the grill; fries and the shake run at the same time) plus a 3-minute buffer, so the bag is ready at 6:07 PM and the grill fires at 5:59 PM. `npm run sandbox:solve` prints that decision as JSON.

## Vultr stack this scaffold is shaped for

Challenge 1 wants Vultr as the control plane, with real work dispatched into an isolated runner.

| Piece | Role here |
| --- | --- |
| [Vultr Cloud Compute](https://www.vultr.com/products/cloud-compute/) VM | Runs this Express app. The VM is the control plane: it takes the order, calls inference, and dispatches the solver. **Not created by this repo.** |
| [Vultr Serverless Inference](https://docs.vultr.com/vultr-inference-api) | OpenAI-compatible chat at `https://api.vultrinference.com/v1`. Used only when `INFERENCE_MODE=live` and both the key and model are set. Output must match a JSON schema and is display copy only. |
| Docker sandbox | `sandbox/Dockerfile` runs the solver and `containment-probe.mjs`. The API's docker argv drops capabilities, uses `--network=none`, a read-only root, a non-root user, memory, pid, and CPU caps, and a stdout cap. The image has no secrets. |

Pattern A from the challenge (model proposes, sandbox executes, real output comes back) is the path this app is built toward. The numbers on the board come from the solver. Pattern B (sandboxed browser) is not this product.

The default runner is in-process so `npm run dev` works before Docker is installed. Health and the pages call that **demo** mode and **isolation: none**. Set `SANDBOX_RUNNER=docker` after you build the image. If that container cannot start, times out, or writes too much, the API returns 503 and does not schedule the ticket in-process.

## Challenge 1, and what this PR does

Blast Radius Zero asks for a web agent that does real work inside a sandbox on Vultr, plus a later submission with a public demo URL and a video. The video has to show one containment moment: the sandbox absorbing something unsafe.

This PR is the starting codebase for that build:

- Guest and kitchen pages, and the four order/schedule/board/arrival routes.
- A pure solver for `fire_at` / `ready_by` from ETA, per-item `prep_minutes`, buffer, open hours, and capacity N.
- A note filter that classifies a shell-like string and refuses it (`npm run sandbox:solve -- --hostile`). The kitchen labels this as a filter, not a container proof.
- A container probe (`sandbox/containment-probe.mjs`, `scripts/containment-demo.sh`) that tries a network connect, writes, a host file, and the inference key, then reports the kernel's errors. It runs only under Docker.
- Inference with an explicit `demo` or `live` mode. Live text is schema-checked. Demo mode does not call the network.
- Orders in SQLite (`db/sqlite.sql`), so a restart keeps the board.
- Deploy recipe in [`deploy/RUNBOOK.md`](deploy/RUNBOOK.md). It is a recipe, not a claim that a VM is already up.

Hackathon submission still needs a Vultr VM, a public URL, and the containment video. Participants claim credits on the [hackathon page](https://lablab.ai/ai-hackathons/vultr-hackathon). This repo does not contain a gift code. Vultr GPUs are not part of the event and are not used here.

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

Then set `SANDBOX_RUNNER=docker` in `.env` if the API should dispatch into that image. A failed container does not schedule the ticket. The boundary probe is `bash scripts/containment-demo.sh`. See [`docs/CONTAINMENT.md`](docs/CONTAINMENT.md).

## Deploy on the existing Vultr VM

Not done yet. The machine is `route66-drivein-demo` at `65.20.93.98`. After this change is on `main`, paste the root console command in [`deploy/READINESS.md`](deploy/READINESS.md). It installs Node 22 and Docker, builds the solver image, keeps SQLite on disk, runs demo inference (no API key), and locks the kitchen behind a token generated on the VM.

The pit board is not public. Guest ordering is. Staff actions and the list of plates need `X-Kitchen-Token`.

The demo lot pin in `.env.example` is `30.2500`, `-97.7490` (South Congress, Austin). It is a map pin for the story, not a business listing.

Guest pages are mobile-first: menu, bag, plate, arrival time, then a ticket with **I'm at the stall**. There is no account and no card charge. The kitchen is a separate high-contrast board with Waiting, Firing, and Ready, plus text labels for overdue tickets.

## Environment

See [`.env.example`](.env.example). Inference URL, key, and model are blank on purpose. Sandbox memory, CPU, and pid caps are documented there and enforced on the Docker argv (they are not passed through a shell). Make.com, Telegram, and Razorpay are not required. The Hyderabad template that mentions them is only under `reference/one-drivein/`.

## What was verified here

`npm test` — 24 tests. They cover the solver (including a July daylight-time ETA), SQLite orders across a reopen, status transitions, demo inference that does not call the network, live output that is discarded when it fails the schema, and a Docker runner that fails closed when the daemon is missing.

On this build machine Docker Engine did start. `scripts/containment-demo.sh` is what you run on the VM. A probe in this environment returned `boundaries_held: true` (uid 1000, network `ENETUNREACH`, root writes `EROFS`, no inference key in the container). A spin loop was stopped with `docker kill` and exited 137. That is not a Vultr VM, and it is not a public demo URL.

## License

MIT. See [LICENSE](LICENSE).
