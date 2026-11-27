# Geet Status

Standalone status dashboard kept separate from the Geet web and API projects.

## Run locally

Requires Node.js 20 or newer. No package installation is needed.

```sh
cd status
Copy-Item .env.example .env  # PowerShell; on macOS/Linux use: cp .env.example .env
npm start
```

The server address comes from `STATUS_HOST` and `STATUS_PORT` in `.env`.

The configured environments and exact route paths are in `STATUS_ENVIRONMENTS_JSON` and `STATUS_WEB_ROUTE_PATHS_JSON`. Timeout, route concurrency, cache duration, endpoint paths, and the service-worker cache marker are also environment settings. No service URL or runtime setting is embedded in the application code. Add a valid resource URL to the route list when checking pages that need an existing record.

The server probes each configured frontend route, checks each configured API health and home-data endpoint, and verifies the configured service-worker script and its cache headers. It does not start playback or make changes to either environment.

The database state comes from each API's health response. API cache and playback storage show as **Not reported** until that API deployment exposes `checks.cache` and `checks.playback` in the health response. The current health contract only reports database status, so the standalone page reports that honestly instead of guessing.
