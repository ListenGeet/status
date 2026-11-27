# Geet Status — Release Notes

## v1.0.0 — Initial release

Geet Status is a lightweight, standalone service-health dashboard for Geet.

### Highlights

- Monitors the Geet web app, shared API, and development site through the UptimeRobot v3 API.
- Shows an overall health summary, per-service states, check time, and details when a check cannot be verified.
- Supports manual refresh and automatic browser refresh, backed by a short server-side result cache.
- Handles operational, disrupted, paused, starting, and unknown monitor states.
- Responsive dark interface with Geet branding, keyboard-visible focus, and reduced-motion support.
- Runs on Node.js 20 or newer with no package installation required.

### Configuration and security

- Configure the server, refresh intervals, UptimeRobot endpoint, and the three monitor hosts through environment variables.
- Use a read-only UptimeRobot API key. The key stays on the server and is never sent to the browser.
- The dashboard remains available without a key, but live monitor data is reported as unavailable.

See [README.md](./README.md) and [.env.example](./.env.example) for setup instructions and configuration details.
