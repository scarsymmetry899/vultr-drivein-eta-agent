#!/usr/bin/env bash
# Put the Vultr Inference key and model into .env on the VM, check one live call,
# and turn live mode on only if that call passed.
#
#   Run as root on the VM:   bash /opt/route66/scripts/set-inference.sh
#   From your own computer:  ssh -t root@65.20.93.98 "bash /opt/route66/scripts/set-inference.sh"
#
# The key is read with hidden input. It is never echoed, never put on a command line,
# and never written anywhere except .env (owner route66, mode 600 is kept).
set -euo pipefail
set +x

APP_DIR="${APP_DIR:-/opt/route66}"
ENV_FILE="$APP_DIR/.env"
APP_USER="${APP_USER:-route66}"
BASE="https://api.vultrinference.com/v1"

if [[ "$(id -u)" != "0" ]]; then
  echo "Run this as root (it edits $ENV_FILE and restarts the service)." >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "$ENV_FILE was not found. Deploy the app first." >&2
  exit 1
fi

set_var() {
  local name="$1" value="$2" tmp
  tmp="$(mktemp)"
  grep -v "^${name}=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$name" "$value" >> "$tmp"
  # cat > keeps the file's owner and mode.
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

echo "Paste the Vultr Serverless Inference API key and press Enter."
echo "Nothing will show while you paste. That is expected."
read -rsp "Key: " KEY
echo
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
if [[ -z "$KEY" ]]; then
  echo "No key entered. Nothing changed." >&2
  exit 1
fi
echo "Key received (${#KEY} characters)."

echo "Asking Vultr which models this key can use…"
MODELS=""
if MODELS_JSON="$(printf 'url = "%s/models"\nheader = "Authorization: Bearer %s"\n' "$BASE" "$KEY" | curl -fsS --max-time 15 --config - 2>/dev/null)"; then
  MODELS="$(printf '%s' "$MODELS_JSON" | /usr/local/bin/node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { for (const m of JSON.parse(s).data || []) if (m && m.id) console.log(m.id); } catch {}
    });' || true)"
fi

MODEL=""
if [[ -n "$MODELS" ]]; then
  mapfile -t LIST <<< "$MODELS"
  echo "Models for this key:"
  for i in "${!LIST[@]}"; do printf '  %2d) %s\n' "$((i + 1))" "${LIST[$i]}"; done
  read -rp "Pick a number (or type a model id): " CHOICE
  if [[ "$CHOICE" =~ ^[0-9]+$ ]] && (( CHOICE >= 1 && CHOICE <= ${#LIST[@]} )); then
    MODEL="${LIST[$((CHOICE - 1))]}"
  else
    MODEL="$CHOICE"
  fi
else
  echo "Could not list models (check the key, or the VM's outbound network)."
  read -rp "Type the model id from the Vultr console: " MODEL
fi
MODEL="$(printf '%s' "$MODEL" | tr -d '[:space:]')"
if [[ -z "$MODEL" ]]; then
  echo "No model chosen. Nothing changed." >&2
  exit 1
fi

set_var VULTR_INFERENCE_API_KEY "$KEY"
set_var VULTR_INFERENCE_MODEL "$MODEL"
unset KEY MODELS_JSON
echo "Saved the key and model ($MODEL) to $ENV_FILE."

echo "Making one live call…"
set +e
(cd "$APP_DIR" && sudo -u "$APP_USER" env PATH=/usr/local/bin:/usr/bin:/bin npm run -s inference:check)
CHECK=$?
set -e

if [[ "$CHECK" == "0" ]]; then
  set_var INFERENCE_MODE live
  echo "Live call verified. INFERENCE_MODE=live."
else
  set_var INFERENCE_MODE demo
  echo "Live call did NOT verify. INFERENCE_MODE stays demo. The 'mode' and 'warning' lines above say why."
fi

systemctl restart route66
sleep 3
echo "Health:"
curl -fsS http://127.0.0.1:8080/api/health || echo "Health did not answer yet. Try: systemctl status route66"
echo
if [[ "$CHECK" == "0" ]]; then
  echo "Next: place one fictional ticket and tap Time the grill. Health then shows live_call_verified: true."
fi
exit "$CHECK"
