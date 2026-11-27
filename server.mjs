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

const config = {
  host: required('STATUS_HOST'),
  port: positiveInteger('STATUS_PORT'),
  requestTimeoutMs: positiveInteger('STATUS_REQUEST_TIMEOUT_MS'),
  resultCacheMs: positiveInteger('STATUS_RESULT_CACHE_MS'),
  clientRefreshMs: positiveInteger('STATUS_CLIENT_REFRESH_MS'),
  routeConcurrency: positiveInteger('STATUS_ROUTE_CONCURRENCY'),
  apiHealthPath: required('STATUS_API_HEALTH_PATH'),
  apiHomePath: required('STATUS_API_HOME_PATH'),
  serviceWorkerPath: required('STATUS_WEB_SERVICE_WORKER_PATH'),
  dashboardApiPath: required('STATUS_DASHBOARD_API_PATH'),
  serviceWorkerCacheMarker: required('STATUS_SERVICE_WORKER_CACHE_MARKER'),
  primaryEnvironment: required('STATUS_PRIMARY_ENVIRONMENT'),
  environments: jsonEnvironment('STATUS_ENVIRONMENTS_JSON'),
  routes: jsonEnvironment('STATUS_WEB_ROUTE_PATHS_JSON'),
};

if (!Array.isArray(config.environments) || config.environments.length === 0) {
  throw new Error('STATUS_ENVIRONMENTS_JSON must be a non-empty array');
}
config.environments = config.environments.map((environment) => {
  for (const field of ['id', 'label', 'badge', 'webUrl', 'apiUrl']) {
    if (typeof environment[field] !== 'string' || !environment[field].trim()) {
      throw new Error(`Each status environment requires ${field}`);
    }
  }
  return {
    ...environment,
    webUrl: httpUrl(environment.webUrl, `${environment.id}.webUrl`),
    apiUrl: httpUrl(environment.apiUrl, `${environment.id}.apiUrl`),
  };
});
if (!config.environments.some((environment) => environment.id === config.primaryEnvironment)) {
  throw new Error('STATUS_PRIMARY_ENVIRONMENT must match an environment id');
}
for (const name of ['apiHealthPath', 'apiHomePath', 'serviceWorkerPath']) {
  if (!config[name].startsWith('/') || config[name].startsWith('//')) {
    throw new Error(`${name} must be an absolute path on its configured service`);
  }
}
if (!/^\/[A-Za-z0-9/_-]+$/.test(config.dashboardApiPath)) {
  throw new Error('STATUS_DASHBOARD_API_PATH must be a local absolute path');
}
if (!Array.isArray(config.routes) || config.routes.length === 0 || config.routes.some((path) =>
  typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')
)) {
  throw new Error('STATUS_WEB_ROUTE_PATHS_JSON must be a non-empty array of local paths');
}

let snapshotCache;

async function request(url) {
  return fetch(url, {
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
}

async function mapLimit(items, limit, run) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  }));
  return results;
}

async function checkEnvironment(target) {
  const pages = await mapLimit(config.routes, config.routeConcurrency, async (route) => {
    try {
      const response = await request(new URL(route, target.webUrl));
      void response.body?.cancel().catch(() => undefined);
      return {
        path: route,
        state: response.ok ? 'operational' : 'down',
        detail: `HTTP ${response.status}`,
      };
    } catch {
      return { path: route, state: 'down', detail: 'No response' };
    }
  });

  const [healthResult, homeResult, workerResult] = await Promise.allSettled([
    request(new URL(config.apiHealthPath, target.apiUrl)),
    request(new URL(config.apiHomePath, target.apiUrl)),
    request(new URL(config.serviceWorkerPath, target.webUrl)),
  ]);

  let api = 'down';
  let database = 'unknown';
  let cache = 'unknown';
  let playback = 'unknown';
  let version = null;
  if (healthResult.status === 'fulfilled') {
    try {
      const body = await healthResult.value.json();
      api = healthResult.value.ok && body.ok === true ? 'operational' : 'down';
      database = body.db === 'up' ? 'operational' : body.db === 'down' ? 'down' : 'unknown';
      cache = body.checks?.cache === 'up' ? 'operational' : body.checks?.cache === 'down' ? 'down' : 'unknown';
      playback = body.checks?.playback === 'up' ? 'operational' : body.checks?.playback === 'down' ? 'down' : 'unknown';
      version = typeof body.version === 'string' ? body.version : null;
    } catch {
      api = 'down';
    }
  }

  let home = 'down';
  if (homeResult.status === 'fulfilled' && homeResult.value.ok) {
    try {
      const body = await homeResult.value.json();
      home = Array.isArray(body.newTracks) && Array.isArray(body.popular) && Array.isArray(body.artists)
        ? 'operational'
        : 'down';
    } catch {
      home = 'down';
    }
  }

  let webCache = 'down';
  if (workerResult.status === 'fulfilled' && workerResult.value.ok) {
    try {
      const script = await workerResult.value.text();
      const cacheControl = workerResult.value.headers.get('cache-control') ?? '';
      webCache = script.includes(config.serviceWorkerCacheMarker) && /no-cache|must-revalidate/.test(cacheControl)
        ? 'operational'
        : 'down';
    } catch {
      webCache = 'down';
    }
  }

  return {
    id: target.id,
    label: target.label,
    badge: target.badge,
    webUrl: target.webUrl,
    apiUrl: target.apiUrl,
    apiHealthPath: config.apiHealthPath,
    apiHomePath: config.apiHomePath,
    serviceWorkerPath: config.serviceWorkerPath,
    pages,
    api,
    home,
    database,
    cache,
    playback,
    webCache,
    version,
  };
}

async function getSnapshot(force = false) {
  if (!force && snapshotCache?.expiresAt > Date.now()) return snapshotCache.promise;
  const promise = Promise.all(config.environments.map(checkEnvironment)).then((checks) => ({
    checkedAt: new Date().toISOString(),
    primaryWebUrl: config.environments.find((environment) => environment.id === config.primaryEnvironment).webUrl,
    clientRefreshMs: config.clientRefreshMs,
    dashboardApiPath: config.dashboardApiPath,
    environments: checks,
  }));
  snapshotCache = { expiresAt: Date.now() + config.resultCacheMs, promise };
  try {
    return await promise;
  } catch {
    snapshotCache = undefined;
    return { checkedAt: new Date().toISOString(), primaryWebUrl: '', clientRefreshMs: config.clientRefreshMs, environments: [] };
  }
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
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
      const configTag = `<meta name="status-api-path" content="${config.dashboardApiPath}">`;
      body = Buffer.from(body.toString('utf8').replace('</head>', `${configTag}</head>`));
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(filename)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': extname(filename) === '.html' ? 'no-cache' : 'public, max-age=3600',
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
  console.log(`Geet Status is listening on ${config.host}:${config.port}`);
});
