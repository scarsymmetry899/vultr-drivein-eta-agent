# Public HTTPS access, verified 8 November 2026

- Guest: https://route66-drivein-demo.duckdns.org/
- Staff: https://route66-drivein-demo.duckdns.org/kitchen.html
- Health: https://route66-drivein-demo.duckdns.org/api/health
- Existing Vultr VM: `route66-drivein-demo`, `65.20.93.98`.

Caddy reverse-proxies the hostname to `127.0.0.1:8080` and manages TLS certificates. HTTP on the hostname redirects to HTTPS. Public port 8080 is closed; do not use the old IP-and-port URL for judges. SSH access was preserved. This access change did not restart or change the Route66 app service.

The setup verification confirmed a rendered guest menu over valid HTTPS, an HTTP 308 redirect, unauthenticated kitchen API 401, public port 8080 closed, and HTTPS health still passing afterward. A separate browser check on 8 November confirmed the HTTPS guest page and public health again.

Public health reported SQLite, Docker isolation, fail-closed scheduling, kitchen authentication, and an accepted `deepseek-v4.1-flash-1017` reply at `2026-11-08T13:58:26.460Z`. It does not return a deployed commit hash. The last VM-recorded application commit remains the dated evidence in [`DEPLOYED.md`](DEPLOYED.md), not a newly inferred SHA from the public check.

Keep the hostname pointing at the VM, Caddy enabled, and ports 80/443 available for web access and certificate renewal. Do not expose 8080 again. Do not include any keys, staff token, or DNS account details in recordings or git.

HTTPS supplies the secure-origin prerequisite for browser location. Real device GPS, location permission, and arrival behavior have not been verified by this access check. No payment processing is enabled.
