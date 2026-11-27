import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(root, 'public');

async function loadLocalEnvironment() {
  let source;
  try {
    source = await readFile(resolve(root, '.env'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  for (const line of source.split(/\r?\n/)) {
    const content = line.trim();
    if (!content || content.startsWith('#')) continue;
    const separator = content.indexOf('=');
    if (separator < 1) continue;
    const key = content.slice(0, separator).trim();
    let value = content.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

await loadLocalEnvironment();

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveInteger(name) {
  const value = Number.parseInt(required(name), 10);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function jsonEnvironment(name) {
  try {
    return JSON.parse(required(name));
  } catch (error) {
    throw new Error(`${name} must contain valid JSON: ${error.message}`);
  }
}

function httpUrl(value, label) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${label} must use HTTP or HTTPS`);
  }
  return parsed.toString().replace(/\/$/, '');
}

function monitorHost(value) {
  return new URL(value).hostname.toLowerCase();
}

const config = {
  host: required('STATUS_HOST'),
  port: positiveInteger('STATUS_PORT'),
  requestTimeoutMs: positiveInteger('STATUS_REQUEST_TIMEOUT_MS'),
  resultCacheMs: positiveInteger('STATUS_RESULT_CACHE_MS'),
  clientRefreshMs: positiveInteger('STATUS_CLIENT_REFRESH_MS'),
  monitorListLimit: positiveInteger('UPTIMEROBOT_MONITOR_LIST_LIMIT'),
  apiUrl: httpUrl(required('UPTIMEROBOT_API_URL'), 'UPTIMEROBOT_API_URL'),
  apiKey: process.env.UPTIMEROBOT_API_KEY?.trim() ?? '',
  dashboardApiPath: required('STATUS_DASHBOARD_API_PATH'),
  monitors: jsonEnvironment('UPTIMEROBOT_MONITORS_JSON'),
};

if (!/^\/[A-Za-z0-9/_-]+$/.test(config.dashboardApiPath)) {
  throw new Error('STATUS_DASHBOARD_API_PATH must be a local absolute path');
}
if (!Array.isArray(config.monitors) || config.monitors.length !== 3) {
  throw new Error('UPTIMEROBOT_MONITORS_JSON must contain exactly three monitors');
}
config.monitors = config.monitors.map((monitor) => {
  for (const field of ['id', 'label', 'url']) {
    if (typeof monitor[field] !== 'string' || !monitor[field].trim()) {
      throw new Error(`Each UptimeRobot monitor requires ${field}`);
    }
  }
  const url = httpUrl(monitor.url, `${monitor.id}.url`);
  return { id: monitor.id, label: monitor.label, url, host: monitorHost(url) };
});
if (new Set(config.monitors.map((monitor) => monitor.id)).size !== config.monitors.length) {
  throw new Error('UptimeRobot monitor ids must be unique');
}
if (new Set(config.monitors.map((monitor) => monitor.host)).size !== config.monitors.length) {
  throw new Error('UptimeRobot monitor hosts must be unique');
}

let snapshotCache;

async function request(url) {
  return fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json', Authorization: `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
}

function monitorState(status) {
  if (status === 'UP') return 'operational';
  if (status === 'DOWN' || status === 'LOOKS_DOWN') return 'down';
  if (status === 'PAUSED') return 'paused';
  if (status === 'STARTED') return 'checking';
  return 'unknown';
}

function apiErrorMessage(status) {
  if (status === 401 || status === 403) return 'UptimeRobot rejected the API key';
  if (status === 429) return 'UptimeRobot rate limit reached';
  return `UptimeRobot request failed (HTTP ${status})`;
}

async function checkMonitor(target) {
  if (!config.apiKey) {
    return { ...target, state: 'unknown', detail: 'Add a read-only UptimeRobot API key in .env' };
  }

  const url = new URL(config.apiUrl);
  url.searchParams.set('url', target.host);
  url.searchParams.set('limit', String(config.monitorListLimit));

  try {
    const response = await request(url);
    if (!response.ok) {
      return { ...target, state: 'unknown', detail: apiErrorMessage(response.status) };
    }
    const body = await response.json();
    if (!Array.isArray(body.data)) {
      return { ...target, state: 'unknown', detail: 'Unexpected UptimeRobot response' };
    }

    const matches = body.data.filter((monitor) => {
      if (typeof monitor.url !== 'string') return false;
      try {
        return monitorHost(monitor.url) === target.host;
      } catch {
        return false;
      }
    });
    if (matches.length === 0) {
      return { ...target, state: 'unknown', detail: 'No matching UptimeRobot monitor found' };
    }
    if (matches.length > 1) {
      return { ...target, state: 'unknown', detail: 'More than one monitor matches this host' };
    }

    const monitor = matches[0];
    const rawStatus = typeof monitor.status === 'string' ? monitor.status.toUpperCase() : '';
    const state = monitorState(rawStatus);
    return {
      ...target,
      state,
      monitorName: typeof monitor.name === 'string' ? monitor.name : target.label,
      detail: state === 'unknown' ? 'UptimeRobot returned an unrecognized monitor status' : rawStatus,
      responseTime: Number.isFinite(monitor.responseTime) ? monitor.responseTime : null,
    };
  } catch {
    return { ...target, state: 'unknown', detail: 'Could not reach the UptimeRobot API' };
  }
}

async function getSnapshot(force = false) {
  if (!force && snapshotCache?.expiresAt > Date.now()) return snapshotCache.promise;
  const promise = Promise.all(config.monitors.map(checkMonitor)).then((monitors) => ({
    checkedAt: new Date().toISOString(),
    clientRefreshMs: config.clientRefreshMs,
    monitors,
  }));
  snapshotCache = { expiresAt: Date.now() + config.resultCacheMs, promise };
  try {
    return await promise;
  } catch {
    snapshotCache = undefined;
    return {
      checkedAt: new Date().toISOString(),
      clientRefreshMs: config.clientRefreshMs,
      monitors: config.monitors.map((monitor) => ({
        ...monitor,
        state: 'unknown',
        detail: 'Could not load the UptimeRobot status',
      })),
    };
  }
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

async function serveFile(pathname, response) {
  let requested;
  try {
    requested = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  const filename = resolve(publicRoot, `.${requested}`);
  if (!filename.startsWith(publicRoot + sep)) {
    response.writeHead(400).end('Bad request');
    return;
  }
  try {
    let body = await readFile(filename);
    if (extname(filename) === '.html') {
      const html = body.toString('utf8').replace(
        '</head>',
        `  <meta name="status-api-path" content="${config.dashboardApiPath}" />\n  </head>`,
      );
      body = Buffer.from(html);
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(filename)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': ['.html', '.css', '.js'].includes(extname(filename))
        ? 'no-cache'
        : 'public, max-age=3600',
    }).end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}

createServer(async (requestMessage, response) => {
  const [pathname, query = ''] = (requestMessage.url ?? '/').split('?');
  if (pathname === config.dashboardApiPath && requestMessage.method === 'GET') {
    const snapshot = await getSnapshot(new URLSearchParams(query).has('refresh'));
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    }).end(JSON.stringify(snapshot));
    return;
  }
  if (requestMessage.method !== 'GET' && requestMessage.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  await serveFile(pathname, response);
}).listen(config.port, config.host, () => {
  console.log(`Geet status page listening on ${config.host}:${config.port}`);
});
