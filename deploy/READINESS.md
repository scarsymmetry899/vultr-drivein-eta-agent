# Release readiness — Route 66 Drive-In

Existing VM: `route66-drivein-demo`, `65.20.93.98`. Full sanitized record: [DEPLOYED.md](DEPLOYED.md). This is a fictional demo, not a real restaurant.

## Deployment and API verification on 7 November

- [x] PR #13 merged; application `65ca138a54f41a7ba394de4b5abb749bcc57c594` deployed.
- [x] Root-only database/configuration backup; integrity check passed.
- [x] Three existing orders preserved; decision trail, hold, arrival opt-in, and payment-state migration columns present.
- [x] 24-hour Austin service: `00:00`–`24:00`.
- [x] Dependency install, typecheck, and all 72 tests passed on VM after hours change.
- [x] Docker solver rebuilt; service restarted at 10:56:46 UTC on 7 November.
- [x] Kitchen token unchanged; protected config retained mode 600.
- [x] Health: SQLite, Docker, fail-closed, live/configured inference, kitchen authentication; unauthenticated board 401.
- [x] Scheduling and staff hold verified. Hold blocks automatic firing and labeled close-arrival simulation; held check-in returns 409.
- [x] Release hold and labeled close-arrival simulation start cooking. GPS verification stays false.
- [x] Staff ready and pickup reach completed; repeated pickup returns 409.
- [x] Fresh schema-accepted inference at 11:03:21.133 UTC on 7 November.

These checks were authenticated localhost API calls, not video footage. Completed ticket `R66-12515` is retained. Inference verification resets on restart.

## Public access checked on 8 November

- [x] HTTPS guest page renders at https://route66-drivein-demo.duckdns.org/.
- [x] Health reports SQLite, Docker isolation, fail-closed, kitchen authentication, and live inference verified at `2026-11-08T13:58:26.460Z`.
- [x] HTTPS access record captured in [`ACCESS.md`](ACCESS.md); public port 8080 is closed.
- [ ] Fresh VM checkout SHA checked directly. Public health does not report one. The dated application release above is the last VM-recorded SHA.

## Submission check on 8 November, 15:50 UTC

- [x] Six-slide PDF complete and attached to the saved draft.
- [ ] Final browser demo video uploaded and verified, with no tokens or keys exposed.
- [x] Official deadline and requirements verified: **8 November 2026, 23:00 UTC** (**9 November, 04:30 IST**).
- [x] Basic LabLab fields saved; portal progress 57%. Track C2-Powering the Future of Work, Customer Support, Vultr, Online.
- [ ] Required submission fields saved and final artifacts attached.
- [ ] User reviews final entry before submission.

The draft still needs its required video and remaining technical fields. No final submission has been sent. Fresh VM containment probing is not in the verified release evidence. If included in the video, run and record the actual probe.

Official source and exact deadline quote: [`docs/HACKATHON.md`](../docs/HACKATHON.md#verified-deadline-and-requirements). Required final fields include cover, video, slides, descriptions/tags, public repository, app platform, and HTTPS application URL. Challenge 2 does not require a video containment moment.

## Boundaries

HTTPS on the public hostname is verified. Real device GPS and its permission flow remain unverified. Simulation must stay labeled. Pay at the window is the default; demo payment markers do not charge money. Enterprise features, real prepayment, and real GPS remain future work, not release blockers.

Keep staff tokens, keys, private backups, and customer data out of git and recordings. No additional paid resources were provisioned. Use [UPDATE.md](UPDATE.md) for future releases; do not rerun the original installation paste.
