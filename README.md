# Geet Status

Standalone status dashboard for three UptimeRobot monitors: `listengeet.com`, the shared `api.listengeet.com` API, and `dev.listengeet.com`.

## Configure and run

Requires Node.js 20 or newer. No package installation is needed.

```powershell
Copy-Item .env.example .env
```

Set `UPTIMEROBOT_API_KEY` in `.env` to a read-only UptimeRobot API key, then run:

```sh
npm start
```

The key is used only by the server and is never sent to the browser. Monitor URLs, labels, API endpoint, polling interval, cache duration, and server binding are configured through environment variables. The monitor list must contain exactly three unique hosts. The API is a shared monitor, so it appears once.

The server queries UptimeRobot's v3 monitors API, matching each configured host to its monitor and displaying the returned monitor state. Without a key, the dashboard still loads and reports that live data is unavailable. Refreshing on the page uses a short server cache to limit API requests.
