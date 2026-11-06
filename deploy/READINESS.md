# Readiness checklist for route66-drivein-demo

VM already created: `route66-drivein-demo`, `65.20.93.98`, Ubuntu 24.04, Mumbai, 1 vCPU / 2 GB / 55 GB. This checklist does not create or resize it. It is the original first paste. The VM is already running. Later changes, including live inference wording, go through [`UPDATE.md`](UPDATE.md). Do not paste the script again.

Do not paste the script until `main` contains `deploy/browser-console.sh`. Confirm the deploy PR is merged first.

## Before you paste

- [ ] Vultr browser console is open as root on `65.20.93.98`.
- [ ] No SSH key is required for this path. Do not open extra ports.
- [ ] If this VM has a Vultr firewall group, it must allow TCP 8080. The script cannot change that group. Port 22 stays allowed in ufw so a later SSH key still works. The browser console does not use port 22.
- [ ] You will not set `INFERENCE_MODE=live` or paste an inference key.

## Paste

```bash
curl -fsSL https://raw.githubusercontent.com/scarsymmetry899/vultr-drivein-eta-agent/main/deploy/browser-console.sh | bash
```

The script is idempotent. A second run keeps the existing kitchen token.

## The script is done only if it prints all of these

- Health JSON with `"ok": true`, `"persistence": "sqlite"`, `"isolation": "docker"`, `"fail_closed": true`, `"inference_mode": "demo"`, `"inference_configured": false`, `"kitchen_auth": true`
- Guest HTTP 200 and kitchen board HTTP 401 without a token
- A kitchen token line, also stored at `/root/route66-kitchen-token.txt` mode 600

## After that, from your own browser

- [ ] `http://65.20.93.98:8080/` loads the menu in USD. Onion rings show 86. There is no pay button.
- [ ] Send a fictional ticket, set the fire time, then tap I'm at the stall.
- [ ] `http://65.20.93.98:8080/kitchen.html` does not list plates until you unlock it with the token.
- [ ] Mark ready and Picked up work only after unlock.
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' http://65.20.93.98:8080/api/kitchen/board` prints `401`.

## What stays off the public internet

- Kitchen board, mark ready, picked up, note filter, and sandbox probe require `X-Kitchen-Token`.
- The token is generated on the VM. It is not in git.
- SQLite lives at `/var/lib/route66/drivein.sqlite`.
- The solver container is started locally by the app. Docker's port is not opened.
- Demo mode does not call Vultr Serverless Inference.

## Known limits

- Anyone can place a fictional order. That can start a short-lived solver container. The guest routes allow 30 requests per minute per address.
- A guest who has their ticket id can open that one ticket. The id is a random UUID, not shown on the public board.
- This file does not mean the app is deployed. The console paste is still yours to run.
