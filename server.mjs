import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(root, 'public');
const port = Number.parseInt(process.env.PORT ?? '3020', 10);
const host = process.env.HOST ?? '127.0.0.1';
const maxAge = 20_000;

const routes = [
  { path: '/', dynamic: false },
  { path: '/artist/status-check', dynamic: true },
  { path: '/assistant', dynamic: false },
  { path: '/chat', dynamic: false },
  { path: '/chat/status-check', dynamic: true },
  { path: '/copyright', dynamic: false },
  { path: '/friends', dynamic: false },
  { path: '/jam', dynamic: false },
  { path: '/jam/status-check', dynamic: true },
  { path: '/j/status-check', dynamic: true },
  { path: '/library', dynamic: false },
  { path: '/onboarding', dynamic: false },
  { path: '/playlist/status-check', dynamic: true },
  { path: '/privacy', dynamic: false },
  { path: '/profile', dynamic: false },
  { path: '/search', dynamic: false },
  { path: '/sign-in', dynamic: false },
  { path: '/sign-up', dynamic: false },
  { path: '/t/00000000-0000-4000-8000-000000000000', dynamic: true },
  { path: '/terms', dynamic: false },
  { path: '/u/status-check', dynamic: true },
  { path: '/upload', dynamic: false },
];

const environments = [
  { id: 'production', label: 'Production', web: 'https://listengeet.com', api: 'https://api.listengeet.com' },
  { id: 'development', label: 'Development', web: 'https://dev.listengeet.com', api: 'https://dev-api.listengeet.com' },
];

let snapshotCache;

async function request(url) {
  return fetch(url, { cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(3500) });
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
  const pages = await mapLimit(routes, 8, async (route) => {
    try {
      const response = await request(new URL(route.path, target.web));
      const expectedMissingRecord = route.dynamic && response.status === 404;
      void response.body?.cancel().catch(() => undefined);
      const operational = response.status < 500 && (response.ok || expectedMissingRecord);
      return {
        path: route.path,
        state: operational ? 'operational' : 'down',
        detail: expectedMissingRecord ? 'Page responded; sample record is not present' : `HTTP ${response.status}`,
      };
    } catch {
      return { path: route.path, state: 'down', detail: 'No response' };
    }
  });

  const [healthResult, homeResult, workerResult] = await Promise.allSettled([
    request(`${target.api}/api/health`),
    request(`${target.api}/api/home`),
    request(`${target.web}/sw.js`),
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
    const script = await workerResult.value.text();
    const cacheControl = workerResult.value.headers.get('cache-control') ?? '';
    webCache = script.includes('geet-pages-v2') && /no-cache|must-revalidate/.test(cacheControl)
      ? 'operational'
      : 'down';
  }

  return {
    id: target.id,
    label: target.label,
    webUrl: target.web,
    apiUrl: target.api,
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
  const promise = Promise.all(environments.map(checkEnvironment)).then((checks) => ({
    checkedAt: new Date().toISOString(),
    environments: checks,
  }));
  snapshotCache = { expiresAt: Date.now() + maxAge, promise };
  try {
    return await promise;
  } catch {
    snapshotCache = undefined;
    return { checkedAt: new Date().toISOString(), environments: [] };
  }
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function serveFile(pathname, response) {
  const requested = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const filename = resolve(publicRoot, `.${requested}`);
  if (!filename.startsWith(publicRoot + sep)) {
    response.writeHead(400).end('Bad request');
    return;
  }
  try {
    const body = await readFile(filename);
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
  const url = new URL(requestMessage.url ?? '/', `http://${requestMessage.headers.host ?? host}`);
  if (url.pathname === '/api/status' && requestMessage.method === 'GET') {
    const snapshot = await getSnapshot(url.searchParams.has('refresh'));
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
  await serveFile(url.pathname, response);
}).listen(port, host, () => {
  console.log(`Geet Status is running at http://${host}:${port}`);
});
