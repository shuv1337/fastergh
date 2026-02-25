# FasterGH Local systemd Service

This documents the local user-level systemd service used to run `apps/main-site` in production mode.

## Service name and location

- Unit name: `fastergh.service`
- Unit file: `~/.config/systemd/user/fastergh.service`
- Enabled target: `default.target`

Current unit:

```ini
[Unit]
Description=FasterGH Next.js production server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/shuv/repos/fastergh/apps/main-site
ExecStartPre=/usr/bin/rm -rf /home/shuv/repos/fastergh/apps/main-site/.next
ExecStartPre=/home/shuv/.bun/bin/bun run with-env next build
ExecStart=/home/shuv/.bun/bin/bun run with-env next start --hostname 0.0.0.0 --port 4007
Restart=on-failure
RestartSec=3
TimeoutStartSec=300
Environment=NODE_ENV=production
Environment=PORT=4007
Environment=NEXT_TELEMETRY_DISABLED=1
Environment=PATH=/home/shuv/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/bin

[Install]
WantedBy=default.target
```

## Common commands

```bash
# Reload unit files after editing the service
systemctl --user daemon-reload

# Restart service
systemctl --user restart fastergh.service

# Check status
systemctl --user status fastergh.service --no-pager -l

# Tail logs
journalctl --user -u fastergh.service -f
```

## Redeploy workflow

From repo root:

```bash
cd /home/shuv/repos/fastergh

# Optional but recommended if deps changed
bun install

# Pick up unit changes (if any) and restart
systemctl --user daemon-reload
systemctl --user restart fastergh.service

# Verify health
systemctl --user status fastergh.service --no-pager -l
journalctl --user -u fastergh.service -n 80 --no-pager
```

## Notes

- The unit does a clean production rebuild (`rm -rf .next` + `next build`) on each restart.
- Frontend telemetry integrations (PostHog, Sentry, Vercel Speed Insights, Vercel Toolbar) have been removed from `apps/main-site`.
- `NEXT_TELEMETRY_DISABLED=1` remains set as an additional safeguard.
