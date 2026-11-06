# Update the existing VM

`route66-drivein-demo` is already at `65.20.93.98`. Do not run `browser-console.sh` again. That script rewrites `.env`. This update keeps the kitchen token, `SANDBOX_RUNNER=docker`, `INFERENCE_MODE=demo`, and the SQLite file.

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
grep -q '^INFERENCE_MODE=demo' /opt/route66/.env
grep -q '^DATABASE_PATH=/var/lib/route66/drivein.sqlite' /opt/route66/.env
docker build -f /opt/route66/sandbox/Dockerfile -t route66-fire-solver /opt/route66/sandbox
sudo -u route66 npm --prefix /opt/route66 ci --omit=dev
systemctl restart route66
sleep 2
curl -fsS http://127.0.0.1:8080/api/health
echo
curl -s -o /dev/null -w 'kitchen_without_token:%{http_code}\n' http://127.0.0.1:8080/api/kitchen/board
```

Stop if any `grep` fails. Do not copy a new `.env` over the old one. Do not set a Vultr inference key.

Expect health to include `"persistence":"sqlite"`, `"isolation":"docker"`, `"inference_mode":"demo"`, `"kitchen_auth":true`. The kitchen line should be `kitchen_without_token:401`.

Guest: `http://65.20.93.98:8080/`
Kitchen: `http://65.20.93.98:8080/kitchen.html` with the existing token in `/root/route66-kitchen-token.txt`.
