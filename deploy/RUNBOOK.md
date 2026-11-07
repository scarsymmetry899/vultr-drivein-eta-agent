# Vultr VM runbook

The VM `route66-drivein-demo` (`65.20.93.98`) already exists. Do not create another one from this repo. Do not re-run [`browser-console.sh`](browser-console.sh). It rewrites `.env`. Updates go through [`UPDATE.md`](UPDATE.md).

The operator reports that VM is serving `6704bcc5801b11b253fdfdd51d64fd24cfeae709` after the 13:45:56 IST update on 7 Nov 2026. Inference mode stayed `live`. `live_call_verified` is false until this process accepts another reply. The record is [`DEPLOYED.md`](DEPLOYED.md). The install steps below are the original recipe, not a second install.

The steps below are the same install, spelled out. The script is the one to paste.

## What you bring

- A Vultr Cloud Compute VM (Ubuntu LTS) you create yourself.
- Node.js 22 and Docker Engine on that VM.
- A `.env` that stays on the VM. Start from `.env.example`.
- For live copy only: `INFERENCE_MODE=live`, `VULTR_INFERENCE_API_KEY`, and `VULTR_INFERENCE_MODEL` from the [inference docs](https://docs.vultr.com/vultr-inference-api). On a new machine, leave `INFERENCE_MODE=demo` until those exist. The existing VM already has live mode set by the operator. The key stays on that machine.

The inference key is read by the API process. It is not copied into the solver image, not passed with `docker -e`, and not returned by `/api/health`.

## Install

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin route66 || true
sudo usermod -aG docker route66
sudo mkdir -p /opt/route66 /var/lib/route66
sudo chown -R route66:route66 /opt/route66 /var/lib/route66
# clone this repo into /opt/route66, then:
cd /opt/route66
cp .env.example .env
# edit .env on the VM
# DATABASE_PATH=/var/lib/route66/drivein.sqlite
# SANDBOX_RUNNER=docker
# INFERENCE_MODE=demo
docker build -f sandbox/Dockerfile -t route66-fire-solver sandbox
npm ci
sudo cp deploy/route66.service /etc/systemd/system/route66.service
sudo systemctl daemon-reload
sudo systemctl enable --now route66
```

Health: `curl -fsS http://127.0.0.1:8080/api/health`

Expect `"ok": true`, `"persistence": "sqlite"`, `"isolation": "docker"`, `"fail_closed": true`, and `"inference_mode": "demo"` until you deliberately switch to live.

Put a public URL in front of port 8080 only when you are ready to submit. This repo does not do that step.

## Containment check on the VM

```bash
bash scripts/containment-demo.sh
```

The script builds the solver image, runs the boundary probe, and kills a spin loop with `timeout`. It writes JSON under `evidence/` on that machine. Do not commit that folder if a run ever includes local paths you do not want published. The script does not print the inference key.

## Compose alternative

`deploy/docker-compose.yml` builds the control plane and mounts the Docker socket so the app can start the solver. The socket is root-equivalent on the host. Use it only if you accept that, and still build `route66-fire-solver` on the VM first.

## Security notes

- `SANDBOX_RUNNER=docker` does not fall back to an in-process solve. A dead daemon leaves the ticket unscheduled.
- Solver flags: `--network=none`, `--read-only`, `--cap-drop=ALL`, `--user node`, memory, pid, and CPU caps, a 16 MB noexec `/tmp`, and a stdout cap.
- Guest pages do not collect a card number. Copy says pay at the window.
- The kitchen board, mark-ready, picked-up, note filter, and sandbox probe require `KITCHEN_TOKEN`. Without that token those routes answer 401, or 503 if the token was never set. The guest menu does not list plates.
- Do not use `deploy/docker-compose.yml` for the public demo. It mounts the Docker socket into the app container. The console script runs the app on the host and only lets it start the solver.
- Orders are fictional demo rows in SQLite. Do not load real customer data.
