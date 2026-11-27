# Geet Status

Standalone status dashboard kept separate from the Geet web and API projects.

## Run locally

Requires Node.js 20 or newer. No package installation is needed.

```sh
cd status
npm start
```

Open `http://127.0.0.1:3020`.

The server checks the Production and Development Geet web domains, probes every frontend route with safe sample URLs, checks each API health endpoint and home-data endpoint, and verifies the service-worker script and its cache headers. It does not start playback or make changes to either environment.

The database state comes from each API's `/api/health` response. API cache and playback storage show as **Not reported** until that API deployment exposes `checks.cache` and `checks.playback` in the health response. The current health contract only reports database status, so the standalone page reports that honestly instead of guessing.
