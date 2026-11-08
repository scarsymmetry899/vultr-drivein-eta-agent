# Verified release — 7 November 2026

PR [#13](https://github.com/scarsymmetry899/vultr-drivein-eta-agent/pull/13) was merged and application commit `65ca138a54f41a7ba394de4b5abb749bcc57c594` deployed to the existing `route66-drivein-demo` VM (`65.20.93.98`). Public app: http://65.20.93.98:8080/.

## Deployment evidence

- Root-only SQLite/configuration backup completed at 10:53:15 UTC; SQLite integrity check passed. Three existing orders were backed up and preserved after migration.
- Clean checkout fast-forwarded from `6704bcc5801b11b253fdfdd51d64fd24cfeae709` to the released application SHA.
- Dependency installation and typecheck passed on the VM. Initial tests with legacy 11:00–22:00 hours had 70 passes and two hours-related failures. After the requested 00:00–24:00 configuration change, all **72 tests passed**, zero failed.
- Docker solver image rebuilt, production dependencies installed, service restarted successfully at **10:56:46 UTC**.
- Configuration changed only in `DRIVEIN_OPEN=00:00` and `DRIVEIN_CLOSE=24:00`. Kitchen token remained byte-identical. Configuration remained mode 600, owned by route66; private backup directory remained root-only, mode 700. Checkout was clean.

## Live API evidence

These were authenticated localhost API checks on the VM, not browser clicks or video footage.

- All three existing order IDs survived. Migration columns `decision_trail`, `fire_hold`, `arrival_opt_in`, and `payment_state` were present.
- Health reported ok, SQLite persistence, Docker isolation, fail-closed scheduling, live/configured inference, and kitchen authentication. Unauthenticated kitchen board returned 401.
- Fictional ticket `R66-12515` was created for an overnight Austin arrival. A staff hold prevented scheduling and a labeled close-arrival simulation from starting cooking. Stall check-in while held returned 409.
- After hold release, labeled close-arrival simulation started cooking. `live_gps_verified` remained false.
- Staff ready and pickup reached completed; repeated pickup returned 409. Completed test ticket remains as evidence.
- Fresh schema-accepted inference from `deepseek-v4.1-flash-1017` at `2026-11-07T11:03:21.133Z` set `live_call_verified=true`. This flag is process-local and resets on restart.

## Submission status

As of 8 November, the six-slide PDF is complete. The actual demo video has not been recorded, LabLab fields have not been saved, and final submission has not been sent. Current deadline and requirements still need verification. Final entry remains subject to user review before submission.

No real GPS, real payment, enterprise rollout, fresh VM containment probe, or demo recording is claimed. Earlier containment probes were on build machines. If shown on video, run and record the actual VM probe and narrate only its observed result. No extra paid resource was provisioned.
