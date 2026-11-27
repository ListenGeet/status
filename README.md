<p align="center">
  <img src="https://raw.githubusercontent.com/ListenGeet/geet-dev/main/web/public/brand/geet-wordmark-black-on-white.png" alt="Geet" width="300" />
</p>

<h1 align="center">Geet Status</h1>

<p align="center">
  A live health dashboard for the services behind Geet.
  <br />
  <a href="https://status.listengeet.com">Open the status page</a>
</p>

<p align="center">
  <a href="https://status.listengeet.com">
    <img src="https://img.shields.io/website?url=https%3A%2F%2Fstatus.listengeet.com&label=status.listengeet.com" alt="Status site availability" />
  </a>
  <img src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white" alt="Node.js 20 or newer" />
</p>

This standalone dashboard checks Geet's web app, shared API, and development site through the [UptimeRobot v3 API](https://uptimerobot.com/).

## Monitored services

| Service | Address |
| --- | --- |
| Geet Web | [listengeet.com](https://listengeet.com) |
| Geet API | [api.listengeet.com](https://api.listengeet.com) |
| Geet Development | [dev.listengeet.com](https://dev.listengeet.com) |

The API is shared by the services and is listed once. The dashboard shows each monitor's current state, the time of the last check, and any details returned when a check cannot be verified. Checks refresh automatically while the page is open; use **Refresh checks** to request an immediate update.

## Run locally

Requires Node.js 20 or newer. There are no package dependencies to install.

1. Copy the example environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

   On macOS or Linux, use `cp .env.example .env`.

2. Set `UPTIMEROBOT_API_KEY` in `.env` to a **read-only** UptimeRobot API key.
3. Start the dashboard:

   ```sh
   npm start
   ```

4. Open [http://127.0.0.1:3020](http://127.0.0.1:3020).

Without an API key, the dashboard still loads and reports that live checks are unavailable.

## Configuration

| Variable | Example default | Description |
| --- | --- | --- |
| `STATUS_HOST` | `127.0.0.1` | Address the server listens on. |
| `STATUS_PORT` | `3020` | HTTP port. |
| `STATUS_REQUEST_TIMEOUT_MS` | `5000` | Timeout for each UptimeRobot API request. |
| `STATUS_RESULT_CACHE_MS` | `30000` | How long the server caches monitor results. |
| `STATUS_CLIENT_REFRESH_MS` | `60000` | Automatic refresh interval in the browser. |
| `STATUS_DASHBOARD_API_PATH` | `/api/status` | Local endpoint used by the dashboard. |
| `UPTIMEROBOT_API_URL` | `https://api.uptimerobot.com/v3/monitors` | UptimeRobot monitors endpoint. |
| `UPTIMEROBOT_API_KEY` | *(empty)* | Read-only API key. It is used by the server and never sent to the browser. |
| `UPTIMEROBOT_MONITOR_LIST_LIMIT` | `200` | Maximum number of monitors requested from UptimeRobot. |
| `UPTIMEROBOT_MONITORS_JSON` | See `.env.example` | Exactly three monitors with unique IDs and hostnames. |

## How it works

The server matches each configured hostname to its UptimeRobot monitor and returns a small status snapshot to the browser. The browser never receives the API key. When UptimeRobot is unavailable, the dashboard reports an unverified state rather than treating the service as healthy.

The deployment uses the same environment variables as local development. Keep the API key in the server's environment; do not put it in browser code or commit it to the repository.
