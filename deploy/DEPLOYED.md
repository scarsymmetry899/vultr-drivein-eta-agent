# Deployment record — 7 Nov 2026

The operator updated the existing VM `route66-drivein-demo` (`65.20.93.98`) over SSH with [`UPDATE.md`](UPDATE.md). This note is that report. It is not a second install, a LabLab submission, or a check repeated from this repository. Checksums, the kitchen token, the inference key, and ticket rows are not copied here.

## Code already on `main`

[Pull request 14](https://github.com/scarsymmetry899/vultr-drivein-eta-agent/pull/14) merged as `6704bcc5801b11b253fdfdd51d64fd24cfeae709`. Parents: `40bfec3f71318c2e2b8060d44342800cf9308290` and `e82305581b38dd30c8769402821f97da461728de`.

On that tree, a due fire still moves a waiting ticket to cooking. Passing `ready_by` does not mark the bag ready. `npm test` on that tree was 49 passed, and `tsc --noEmit` passed. Those commands were not re-run on the VM. [Pull request 13](https://github.com/scarsymmetry899/vultr-drivein-eta-agent/pull/13) was not merged.

## What the operator reported at 13:45:56 IST

- `/opt/route66` was on `main` with a clean work tree.
- `HEAD` was `6704bcc5801b11b253fdfdd51d64fd24cfeae709`, the same commit as `origin/main`.
- The `route66` systemd unit was active after the restart.
- Public health at `http://65.20.93.98:8080/api/health` was `ok: true`, persistence `sqlite`, isolation `docker`, `fail_closed: true`, `inference_mode: live`, inference configured, `kitchen_auth: true`, and `live_call_verified: false`.
- The kitchen board without a token returned 401.
- The `.env` file, the kitchen token file, and the SQLite file had the same checksums before and after the update.

No new inference call was made for this update. No fictional ticket was scheduled after the restart, so the ready and picked-up clicks were not exercised on this process. The unit test for “past `ready_by` stays cooking” is in the merged code. It is not a VM recording.

## Inference on this process

`live_call_verified: false` is what the restart does. The last accepted reply this repository has a record of is model `deepseek-v4.1-flash-1017` at `2026-11-06T19:23:01.701Z`, from the process the restart replaced. Ticket `R66-23873` at 00:53 IST on 7 Nov 2026, with Austin tiles at 1:49 PM and 1:57 PM CST, belongs to that earlier process. The guest footer on the current process should say that no reply has been accepted yet until someone taps **Time the grill** and the reply passes the schema.

An older ticket, `R66-17299`, accepted the same model at `2026-11-06T17:59:23.023Z`. That sentence still showed UTC. A later restart cleared it. It is not the current process either.

## Still not in this repository

- A demo video.
- A slide deck.
- A LabLab submission. The project page is https://lablab.build/ai-hackathons/vultr-hackathon/route66.
- A containment probe run on `65.20.93.98` after this update. Earlier probes were on other machines. See the README.
- A post-restart ticket that shows staff marking the bag ready and picked up.
