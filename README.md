# Route 66 Drive-In

A fictional Austin drive-in where a guest preorders with an ETA and a car plate. An agent on a Vultr VM asks the sandbox when to fire the grill. The kitchen board shows the ticket as waiting, firing, or ready.

This repository is a **scaffold** for [Vultr Agent Rush](https://lablab.ai/ai-hackathons/vultr-hackathon), Challenge 1 — **Blast Radius Zero**. It is not deployed. No Vultr resources are provisioned from this PR, and the demo runs on your laptop with a local inference stub.

Nothing here is a real restaurant, a real order, or a payment. Do not commit customer data, phone numbers, or API keys.

## The order

1. The guest builds a ticket on the order page: name, plate, color, items, and the time they will pull in.
2. `POST /api/orders` prices the ticket in USD cents and sales tax, and stores it as `confirmed`. Onion rings are 86 (sold out) in the demo.
3. `POST /api/agent/schedule` sends the ticket to the fire-time solver. The solver returns `fire_at` (stored as `kitchen_start_at`) and `ready_by`. Vultr Serverless Inference, when a key is set, only explains that result. It does not choose the clock.
4. The kitchen board lists **waiting** (`confirmed`), **firing** (`cooking`), and **ready**.
5. `POST /api/orders/:id/here` means the car is at the stall. If the grill has not started, the ticket rush-fires now. A ticket that is already firing stays on its current clock if schedule is called again.

The sample solver ticket is a Classic Burger, fries, and a chocolate shake for a 6:10 PM CT arrival on 5 Nov 2026. Prep is 8 minutes (the grill; fries and the shake run at the same time) plus a 3-minute buffer, so the bag is ready at 6:07 PM and the grill fires at 5:59 PM. `npm run sandbox:solve` prints that decision as JSON.

## Vultr stack this scaffold is shaped for

Challenge 1 wants Vultr as the control plane, with real work dispatched into an isolated runner.

| Piece | Role here |
| --- | --- |
| [Vultr Cloud Compute](https://www.vultr.com/products/cloud-compute/) VM | Runs this Express app. The VM is the control plane: it takes the order, calls inference, and dispatches the solver. **Not created by this repo.** |
| [Vultr Serverless Inference](https://docs.vultr.com/vultr-inference-api) | OpenAI-compatible chat at `https://api.vultrinference.com/v1`. `agent/inference.ts` calls it when `VULTR_INFERENCE_API_KEY` and `VULTR_INFERENCE_MODEL` are set. With no key, a stub reads the solver result back and does not invent times. |
| Docker sandbox | `sandbox/Dockerfile` runs only the fire-time solver. The intended `docker run` drops capabilities, uses `--network=none`, a read-only root, 128 MB of memory, and a 5-second kill. The image has no secrets. |

Pattern A from the challenge (model proposes, sandbox executes, real output comes back) is the path this app is built toward. The numbers on the board come from the solver. Pattern B (sandboxed browser) is not this product.

The default runner is in-process so `npm run dev` works before Docker is installed. Set `SANDBOX_RUNNER=docker` after you build the image. If that container cannot start, the API says so and falls back to the same pure function.

## Challenge 1, and what this PR does

Blast Radius Zero asks for a web agent that does real work inside a sandbox on Vultr, plus a later submission with a public demo URL and a video. The video has to show one containment moment: the sandbox absorbing something unsafe.

This PR is the starting codebase for that build:

- Guest and kitchen pages, and the four order/schedule/board/arrival routes.
- A pure solver for `fire_at` / `ready_by` from ETA, per-item `prep_minutes`, buffer, open hours, and capacity N.
- A hostile-input path that classifies a shell-like note and refuses it. The note is never passed to a shell. `npm run sandbox:solve -- --hostile` and the kitchen **Containment drill** button both exercise it.
- Inference wired to the Vultr URL, with the key left blank.
- Deploy notes below. They are steps, not a claim that a VM is already up.

Hackathon submission still needs a Vultr VM, a public URL, and the containment video. Participants claim credits on the [hackathon page](https://lablab.ai/ai-hackathons/vultr-hackathon). This repo does not contain a gift code. Vultr GPUs are not part of the event and are not used here.

## How this differs from ONE Drive-in

The domain ideas — an ETA, a plate, a single orders table, a kitchen start time, and an 86 list — come from the Hyderabad ONE Drive-in project `onedrivein-ordernow-preorder`. The seed snapshot is in [`reference/one-drivein/`](reference/one-drivein/) and is not executed. Full table of what moved and what stayed behind: [`docs/SOURCE.md`](docs/SOURCE.md).

In short, the US scaffold uses USD cents and sales tax, one Austin menu, a web kitchen board, and a sandbox that computes `fire_at`. It does not depend on Make.com, Telegram, Razorpay, GST, Jubilee Hills counters, or Supabase edge functions. Arrival is the guest tapping **I'm at the stall**, not a GPS watch.

## Layout

```
public/                 guest order page and kitchen board
src/                    Express control plane (in-memory orders)
agent/inference.ts      Vultr Serverless Inference client, plus the no-key stub
sandbox/fire-time-solver/   pure fire_at / ready_by solver and demo CLI
sandbox/Dockerfile      isolated runner
data/menu.json          burgers, fries, shakes, allergens, prep minutes
db/schema.sql           Postgres shape (drivein_orders, drivein_unavailable)
reference/one-drivein/  unmodified Hyderabad seed
```

Orders live in process memory and reset on restart. `db/schema.sql` is the table shape for a later database. The status machine is `confirmed | cooking | ready | completed | no_show`. This scaffold writes the first three. `completed` and `no_show` are reserved and unused.

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

Then set `SANDBOX_RUNNER=docker` in `.env` if the API should dispatch into that image.

## Deploy on a Vultr VM

Not done in this repository. When you are ready:

1. Create a Vultr Cloud Compute VM (Ubuntu LTS) and install Node.js 22 and Docker. The VM is the control plane, not just a static host.
2. Clone this repo on the VM. Copy `.env.example` to `.env` **on the VM only**. Set `VULTR_INFERENCE_API_KEY` and `VULTR_INFERENCE_MODEL` from the [inference docs](https://docs.vultr.com/vultr-inference-api) and the live model list. Leave the key out of git.
3. Build `route66-fire-solver` with the `docker build` above. Set `SANDBOX_RUNNER=docker`.
4. Run `npm ci && npm start` under a process manager. Put a public URL in front of port 8080 when you submit on LabLab.
5. Confirm a normal ticket gets a `fire_at`, and confirm the containment drill still reports `contained: true` and `executed_payload: false`.

The demo lot pin in `.env.example` is `30.2500`, `-97.7490` (South Congress, Austin). It is a map pin for the story, not a business listing.

## Environment

See [`.env.example`](.env.example). Inference URL, key, and model are blank on purpose. Sandbox memory, CPU, and pid caps are documented there and enforced on the Docker argv (they are not passed through a shell). Make.com, Telegram, and Razorpay are not required. The Hyderabad template that mentions them is only under `reference/one-drivein/`.

## License

MIT. See [LICENSE](LICENSE).
