# Update the existing VM

`route66-drivein-demo` is already at `65.20.93.98`. Do not run `browser-console.sh` again. That script rewrites `.env`. This update keeps the kitchen token, `SANDBOX_RUNNER=docker`, the current `INFERENCE_MODE`, and the SQLite file.

Paste as root in the Vultr browser console after this change is on `main`:

```bash
set -euo pipefail
cd /opt/route66
sudo -u route66 git fetch origin main
sudo -u route66 git checkout main
sudo -u route66 git pull --ff-only origin main
test -f /opt/route66/.env
grep -q '^KITCHEN_TOKEN=.\+' /opt/route66/.env
grep -q '^SANDBOX_RUNNER=docker' /opt/route66/.env
grep -Eq '^INFERENCE_MODE=(demo|live)$' /opt/route66/.env
grep -q '^DATABASE_PATH=/var/lib/route66/drivein.sqlite' /opt/route66/.env
docker build -f /opt/route66/sandbox/Dockerfile -t route66-fire-solver /opt/route66/sandbox
sudo -u route66 npm --prefix /opt/route66 ci --omit=dev
systemctl restart route66
sleep 2
curl -fsS http://127.0.0.1:8080/api/health
echo
curl -s -o /dev/null -w 'kitchen_without_token:%{http_code}\n' http://127.0.0.1:8080/api/kitchen/board
```

Stop if any `grep` fails. Do not copy a new `.env` over the old one.

Expect health to include `"persistence":"sqlite"`, `"isolation":"docker"`, `"inference_mode":"demo"` (or `live` after the section below), `"inference_endpoint":"https://api.vultrinference.com/v1"`, `"live_call_verified":false`, `"kitchen_auth":true`. The kitchen line should be `kitchen_without_token:401`.

On startup the app adds `decision_trail` to an existing SQLite file if that column is missing. It does not delete orders. Do not delete `/var/lib/route66/drivein.sqlite`.

## Turn on live Vultr Inference

The key belongs only in `/opt/route66/.env` on the VM. It is never in git, never in the browser, and never passed into the sandbox. Do not paste it into a chat or a screen recording.

### Easiest: one command over SSH

The Vultr browser console does not paste reliably, so do this from your own computer's terminal (macOS Terminal, or Windows PowerShell; both have `ssh`). The root password is on the server's Overview page in the Vultr dashboard.

```bash
ssh -t root@65.20.93.98 "cd /opt/route66 && sudo -u route66 git pull --ff-only origin main && bash scripts/set-inference.sh"
```

It asks for the key with hidden input (paste, then Enter; nothing shows), lists the models the key can use, saves both to `.env` without changing its owner or mode, makes one live call, switches `INFERENCE_MODE=live` only if that call verified, and restarts the service. If the call fails it leaves `demo` on and prints why.

### By hand

1. In the Vultr console, open Serverless Inference and copy the API key.
2. On the VM, as root: `nano /opt/route66/.env` and set `VULTR_INFERENCE_API_KEY=` to the key. Leave `INFERENCE_MODE=demo` for now.
3. List the models the key can use, then set one:

```bash
cd /opt/route66 && sudo -u route66 npm run inference:check
```

It prints model ids and exits 2. Put one in `VULTR_INFERENCE_MODEL=` in `.env`.

4. Make one live call. It must print `"verified": true` and exit 0:

```bash
cd /opt/route66 && sudo -u route66 npm run inference:check
```

Keep `evidence/runs/inference-*.json`. It has the model, the summary, and the solver times, and no key.

5. Turn it on for guests:

```bash
sed -i 's/^INFERENCE_MODE=demo$/INFERENCE_MODE=live/' /opt/route66/.env
systemctl restart route66
```

6. Place one fictional ticket and tap **Time the grill**. The ticket badge should read “Wording from Vultr Serverless Inference · <model>”, and `curl -s http://127.0.0.1:8080/api/health` should show `"live_call_verified":true`. That flag resets on restart until the next live reply.

If step 4 fails, leave `INFERENCE_MODE=demo`. A failed or rejected reply never changes a fire time; the ticket shows the solver sentence and says live inference did not answer.

After the service is healthy, record containment on the VM with `bash /opt/route66/scripts/containment-demo.sh` and keep the new `evidence/runs/*.json`. That file is the per-run evidence. A laptop run is not the VM.

Guest: `https://route66-drivein-demo.duckdns.org/`
Kitchen: `https://route66-drivein-demo.duckdns.org/kitchen.html` with the existing token in `/root/route66-kitchen-token.txt`.

The last VM-recorded application release is `65ca138a54f41a7ba394de4b5abb749bcc57c594`, restarted at 10:56:46 UTC on 7 November. See [`DEPLOYED.md`](DEPLOYED.md). HTTPS now proxies to localhost port 8080; the public port is closed. Preserve Caddy and firewall settings described in [`ACCESS.md`](ACCESS.md). Do not paste the block again unless a later commit is on `main`.
