# Roadmap

This is not shipped enterprise software. The running app is one fictional lot, one SQLite file, and one shared kitchen token.

## What exists

- One Vultr VM demo. The solver sets fire and ready. Optional Vultr inference writes a sentence and cannot set the clock.
- Scheduled fire: while the server process is up, a due `kitchen_start_at` moves a confirmed ticket to cooking. A staff hold skips that. Ready and picked up stay staff actions.
- Optional close-arrival watch. A labeled simulation or a browser-reported reading can start cooking earlier than the scheduled fire, once. Repeated reports do not move the clock. Raw coordinates are not stored. The public demo is HTTP on an IP address, so the browser will not provide device GPS. Device location needs HTTPS on a hostname. Live GPS is not verified.
- Pay at the window. An optional demo marker can say unpaid or marked. Neither is a charge.

## Enterprise path, not built

- Tenant and site isolation: separate data and kitchen credentials per lot. Today every ticket shares one database and one token.
- Roles: named staff accounts instead of one shared token. Today the token is the only staff credential.
- Auditability: an exportable audit log. Today the ticket stores a short action list. A deployed live log was truncated, and broader exceptions were not part of the verified staff test.
- Load: more than one VM and a server database. Today the store is SQLite and the write routes are limited to 30 requests a minute per IP.
- Privacy: shorter capability URLs, plate display limited to staff, and a retention schedule. Today the guest ticket URL shows that guest's plate. The public board does not list plates. Coordinates are not kept.
- Payment integration, not started. Prerequisites, all absent today:
  - A merchant account with a processor the operator chooses.
  - HTTPS on a hostname.
  - A hosted checkout or redirect so this app never sees a card number.
  - A webhook signing secret that stays on the VM.
  - An idempotency key on the checkout session so a repeated webhook does not mark a ticket twice.
  - Amounts already stored in USD cents, compared to the processor amount before any state changes.
  - A failed or unsigned webhook leaves the ticket at pay at the window.

No card form will be added in place of that list.
