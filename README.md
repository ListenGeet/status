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

This standalone Next.js (App Router, TypeScript) dashboard checks Geet's web app, shared API, and development site through the [UptimeRobot v3 API](https://uptimerobot.com/).

## Monitored services

| Service | Address |
| --- | --- |
| Geet Web | [listengeet.com](https://listengeet.com) |
| Geet API | [api.listengeet.com](https://api.listengeet.com) |
| Geet Development | [dev.listengeet.com](https://dev.listengeet.com) |

The API is shared by the services and is listed once. The dashboard shows each monitor's current state, the time of the last check, and any details returned when a check cannot be verified. Checks refresh automatically while the page is open; use **Refresh checks** to request an immediate update.

Search engines can discover the status page through `/robots.txt` and `/sitemap.xml`. The JSON status endpoint is excluded from indexing, and link previews use Geet's branded social image.

## Run locally

Requires Node.js 20.9 or newer.

1. Install dependencies with `npm ci`.
2. Copy the example environment file:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   On macOS or Linux, use `cp .env.example .env.local`.
3. Optionally set `UPTIMEROBOT_API_KEY` in `.env.local` to a **read-only** UptimeRobot API key. Without a key, the dashboard loads but live checks are unavailable.
4. Start the development server with `npm run dev` and open [http://127.0.0.1:3020](http://127.0.0.1:3020).

For production, run `npm run build` followed by `npm start`. The production server listens on port `3000` by default; set `PORT` in the hosting environment to use a different port. `PORT` must be set outside `.env.local` because Next.js needs it before loading application environment files.

## Configuration

Next.js loads `.env.local` / `.env` automatically. All values have defaults; `UPTIMEROBOT_API_KEY` is optional.

| Variable | Default | Description |
| --- | --- | --- |
| `STATUS_REQUEST_TIMEOUT_MS` | `5000` | Timeout for each UptimeRobot API request. |
| `STATUS_RESULT_CACHE_MS` | `30000` | How long the server caches monitor results. |
| `STATUS_CLIENT_REFRESH_MS` | `60000` | Automatic refresh interval in the browser. |
| `UPTIMEROBOT_API_URL` | `https://api.uptimerobot.com/v3/monitors` | UptimeRobot monitors endpoint. |
| `UPTIMEROBOT_API_KEY` | *(empty)* | Optional read-only API key. Server-only, never sent to the browser. |
| `UPTIMEROBOT_MONITOR_LIST_LIMIT` | `200` | Maximum number of monitors requested. |
| `UPTIMEROBOT_MONITORS_JSON` | See `.env.example` | Exactly three monitors with unique IDs and hostnames. |

`STATUS_DASHBOARD_API_PATH` was removed in the Next.js migration; the endpoint is `/api/status` (route handler).

`npm start` uses Next.js defaults: hostname `0.0.0.0` and port `3000`. Set `PORT` in the hosting environment (not in `.env.local`) when the platform supplies a port.

## Structure

- `app/page.tsx` – server-renders the first snapshot
- `app/api/status/route.ts` – JSON endpoint (`?refresh=1` bypasses the cache)
- `components/Dashboard.tsx` – client UI (auto/manual refresh)
- `lib/config.ts`, `lib/status.ts` – env validation and UptimeRobot logic (server-only)

The browser never receives the API key. When UptimeRobot is unavailable, the dashboard reports an unverified state rather than treating the service as healthy.
