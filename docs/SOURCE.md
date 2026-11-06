# Source lineage

Domain, schema, and scheduler ideas in this repo started from the private
project [onedrivein-ordernow-preorder](https://github.com/scarsymmetry899/onedrivein-ordernow-preorder)
(ONE Drive-in, Jubilee Hills, Hyderabad).

The copy used here is the attached seed archive, preserved unchanged under
[`reference/one-drivein/`](../reference/one-drivein/). That private GitHub
repository was not modified. This environment could not read the live private
repo, so the archive is the snapshot of record.

The US app does not run those Supabase functions. They stay in the tree so a
reviewer can see what was ported.

## Adapted

| Hyderabad seed | Route 66 scaffold |
| --- | --- |
| `one_drivein_orders` | `drivein_orders` in [`db/schema.sql`](../db/schema.sql) |
| `one_drivein_unavailable` | `drivein_unavailable`, the 86 list, checked when a guest orders |
| Status values `confirmed`, `cooking`, `ready`, `completed`, `no_show` | Same machine. The board shows waiting / firing / ready for the first three live states |
| `eta_timestamp`, `kitchen_start_at` | Same columns. `kitchen_start_at` is `fire_at` from the sandbox solver |
| `car_plate`, `car_model`, `car_color` | Same idea, required plate on the US ticket |
| JSONB `items` on the order row | Kept. US items add `sku`, `prep_minutes`, `station`, `allergens`, `price_cents` |
| Integer money columns | Explicit **USD cents** (`subtotal_cents`, `sales_tax_cents`, `grand_total_cents`) |
| `gst` | `sales_tax_cents` |
| Scheduler decides when the kitchen starts | [`sandbox/fire-time-solver`](../sandbox/fire-time-solver/) computes `fire_at` and `ready_by` from ETA, per-item `prep_minutes`, buffer, open hours, and capacity N |
| Single-outlet, one orders table | Same call for a single fictional Austin lot |
| `updated_at` trigger and indexes on status, ETA, fire time, order number | Kept, renamed |

The original timer rule — start cooking when `kitchen_start_at` is due, even if a location ping is missing — is the reason the solver owns the clock. A guest ETA is an input. The fire time is an output. The browser does not get to send `kitchen_start_at`.

## Left in the Hyderabad seed

These stay in `reference/one-drivein/` and are not dependencies of the US app.

- **Make.com** as the 15-minute cron. The seed's `make/README.md` describes two scenarios. The blueprint JSON files it names were not in the archive. The US scaffold has no Make.com webhook.
- **Telegram as the kitchen display** and as the guest's confirmation channel, including inline "collected" buttons. The US kitchen is `public/kitchen.html`.
- **Razorpay** payment links and any card capture. This scaffold takes no payment.
- **GST and INR.** The original integers were not labeled as paise vs rupees. The US schema is cents on purpose.
- **Jubilee Hills coordinates** (`17.4318`, `78.4082`) and a 5 km GPS radius.
- **Ten counters** and a `restaurant` field on each item. The demo is one US menu.
- **Supabase Edge Functions** as the runtime (`process-order`, `scheduler`, `update-location`).
- **Allow-all row level security.** The US DDL turns RLS on and grants no policies.
- **Phone numbers and Telegram usernames** on the order.
- **Continuous GPS.** `last_lat` / `last_lng` remain on the table, unused. Arrival is `POST /api/orders/:id/here`.
- **No-show ladder** at ETA+15 / +30 / +45. The status value `no_show` still exists. Nothing in the scaffold writes it yet.
- **Client-supplied `kitchen_start_at`.** `process-order` stored whatever timestamp the frontend sent. The US schedule route overwrites that idea with the solver result.
- **`unavailabilityChecker`.** The Make.com notes call that action. The seeded scheduler function does not implement it, so the call would have been a no-op. The US order API rejects SKUs on the 86 list instead.

## What the scaffold adds

Vultr Agent Rush Challenge 1 needs a control plane, a Serverless Inference call, and a sandbox that actually returns a result. Those pieces are new: `agent/`, `sandbox/`, and the Express app. They are stubs and a pure solver, not a production deployment.
