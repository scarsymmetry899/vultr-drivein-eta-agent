#!/usr/bin/env bash
# Paste into the Vultr browser console as root, or run: bash deploy/browser-console.sh
# Demo inference only. Does not call Vultr Inference and does not print an API key.
# Writes a kitchen token on this VM only.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this as root in the Vultr browser console." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
PUBLIC_IP="65.20.93.98"
REPO="https://github.com/scarsymmetry899/vultr-drivein-eta-agent.git"
APP_DIR="/opt/route66"
DATA_DIR="/var/lib/route66"
NODE_VERSION="22.23.4"

apt-get update
apt-get install -y ca-certificates curl git docker.io ufw openssl xz-utils
systemctl enable --now docker

if ! /usr/local/bin/node -v 2>/dev/null | grep -q '^v22\.'; then
  curl -fsSL -o /tmp/node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
  tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
  rm -f /tmp/node.tar.xz
fi
hash -r
node -v
npm -v

id route66 >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin route66
usermod -aG docker route66
install -d -o route66 -g route66 "$APP_DIR" "$DATA_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u route66 git clone --depth 1 --branch main "$REPO" "$APP_DIR"
else
  sudo -u route66 git -C "$APP_DIR" fetch --depth 1 origin main
  sudo -u route66 git -C "$APP_DIR" checkout main
  sudo -u route66 git -C "$APP_DIR" pull --ff-only origin main
fi

docker build -f "$APP_DIR/sandbox/Dockerfile" -t route66-fire-solver "$APP_DIR/sandbox"
sudo -u route66 npm --prefix "$APP_DIR" ci --omit=dev

if [ -f "$APP_DIR/.env" ] && grep -q '^KITCHEN_TOKEN=.\+' "$APP_DIR/.env"; then
  KITCHEN_TOKEN="$(grep '^KITCHEN_TOKEN=' "$APP_DIR/.env" | head -n 1 | cut -d= -f2-)"
else
  KITCHEN_TOKEN="$(openssl rand -hex 24)"
fi

umask 077
cat > "$APP_DIR/.env" <<EOF
HOST=0.0.0.0
PORT=8080
DRIVEIN_NAME=Route 66 Drive-In
DRIVEIN_CITY=Austin, TX
DRIVEIN_TIMEZONE=America/Chicago
DRIVEIN_OPEN=00:00
DRIVEIN_CLOSE=24:00
DRIVEIN_LAT=30.2500
DRIVEIN_LNG=-97.7490
SALES_TAX_RATE=0.0825
FIRE_BUFFER_MINUTES=3
KITCHEN_CAPACITY=3
DATABASE_PATH=${DATA_DIR}/drivein.sqlite
INFERENCE_MODE=demo
VULTR_INFERENCE_BASE_URL=https://api.vultrinference.com/v1
VULTR_INFERENCE_API_KEY=
VULTR_INFERENCE_MODEL=
SANDBOX_RUNNER=docker
SANDBOX_IMAGE=route66-fire-solver
SOLVER_TIMEOUT_MS=5000
SOLVER_MAX_OUTPUT_BYTES=16384
SANDBOX_MEMORY=128m
SANDBOX_CPUS=0.50
SANDBOX_PIDS=32
KITCHEN_TOKEN=${KITCHEN_TOKEN}
EOF
chown route66:route66 "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
install -m 600 -o root -g root /dev/null /root/route66-kitchen-token.txt
printf '%s\n' "$KITCHEN_TOKEN" > /root/route66-kitchen-token.txt

cp "$APP_DIR/deploy/route66.service" /etc/systemd/system/route66.service
systemctl daemon-reload
systemctl enable route66
systemctl restart route66

ufw allow OpenSSH
ufw allow 8080/tcp
ufw --force enable

ok=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  if curl -fsS http://127.0.0.1:8080/api/health >/tmp/route66-health.json; then
    ok=1
    break
  fi
  sleep 1
done
if [ "$ok" -ne 1 ]; then
  echo "Health check failed. journalctl -u route66 -n 80" >&2
  journalctl -u route66 -n 80 --no-pager >&2 || true
  exit 1
fi

node <<'NODE'
const fs = require("fs");
const health = JSON.parse(fs.readFileSync("/tmp/route66-health.json", "utf8"));
const problems = [];
if (health.ok !== true) problems.push("ok");
if (health.persistence !== "sqlite") problems.push("persistence");
if (health.isolation !== "docker") problems.push("isolation");
if (health.fail_closed !== true) problems.push("fail_closed");
if (health.inference_mode !== "demo") problems.push("inference_mode");
if (health.inference_configured !== false) problems.push("inference key must stay empty");
if (health.kitchen_auth !== true) problems.push("kitchen_auth");
if (problems.length) {
  console.error(JSON.stringify(health, null, 2));
  console.error("Health failed: " + problems.join(", "));
  process.exit(1);
}
console.log(JSON.stringify(health));
NODE

board="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/kitchen/board)"
guest="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/)"
if [ "$board" != "401" ]; then
  echo "Kitchen board returned ${board}, expected 401 without a token." >&2
  exit 1
fi
if [ "$guest" != "200" ]; then
  echo "Guest page returned ${guest}, expected 200." >&2
  exit 1
fi

if ! sudo -u route66 docker image inspect route66-fire-solver >/dev/null; then
  echo "The route66 user cannot see the solver image." >&2
  exit 1
fi

echo
echo "Guest:  http://${PUBLIC_IP}:8080/"
echo "Kitchen: http://${PUBLIC_IP}:8080/kitchen.html"
echo "Kitchen token (VM only, also in /root/route66-kitchen-token.txt):"
echo "$KITCHEN_TOKEN"
echo "Inference mode is demo. Do not put a Vultr inference key in .env yet."
echo "If the browser cannot connect, open TCP 8080 on the Vultr firewall group for this VM."
