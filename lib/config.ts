import 'server-only';

export interface MonitorTarget {
  id: string;
  label: string;
  url: string;
  host: string;
}

export interface StatusConfig {
  requestTimeoutMs: number;
  resultCacheMs: number;
  clientRefreshMs: number;
  monitorListLimit: number;
  apiUrl: string;
  apiKey: string;
  monitors: MonitorTarget[];
}

const DEFAULT_MONITORS = JSON.stringify([
  { id: 'production-web', label: 'Geet Web', url: 'https://listengeet.com' },
  { id: 'shared-api', label: 'Geet API', url: 'https://api.listengeet.com' },
  { id: 'development-web', label: 'Geet Development', url: 'https://dev.listengeet.com' },
]);

function env(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveInteger(name: string, fallback: string): number {
  const value = Number.parseInt(env(name, fallback), 10);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function httpUrl(value: string, label: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${label} must use HTTP or HTTPS`);
  }
  return parsed.toString().replace(/\/$/, '');
}

export function hostOf(value: string): string {
  return new URL(value).hostname.toLowerCase();
}

function loadMonitors(): MonitorTarget[] {
  let raw: unknown;
  try {
    raw = JSON.parse(env('UPTIMEROBOT_MONITORS_JSON', DEFAULT_MONITORS));
  } catch (error) {
    throw new Error(`UPTIMEROBOT_MONITORS_JSON must contain valid JSON: ${(error as Error).message}`);
  }
  if (!Array.isArray(raw) || raw.length !== 3) {
    throw new Error('UPTIMEROBOT_MONITORS_JSON must contain exactly three monitors');
  }
  const monitors = raw.map((monitor: Record<string, unknown>) => {
    for (const field of ['id', 'label', 'url']) {
      if (typeof monitor?.[field] !== 'string' || !(monitor[field] as string).trim()) {
        throw new Error(`Each UptimeRobot monitor requires ${field}`);
      }
    }
    const id = monitor.id as string;
    const url = httpUrl(monitor.url as string, `${id}.url`);
    return { id, label: monitor.label as string, url, host: hostOf(url) };
  });
  if (new Set(monitors.map((m) => m.id)).size !== monitors.length) {
    throw new Error('UptimeRobot monitor ids must be unique');
  }
  if (new Set(monitors.map((m) => m.host)).size !== monitors.length) {
    throw new Error('UptimeRobot monitor hosts must be unique');
  }
  return monitors;
}

let cached: StatusConfig | undefined;

/** Validated lazily so `next build` does not need runtime env vars. */
export function getConfig(): StatusConfig {
  cached ??= {
    requestTimeoutMs: positiveInteger('STATUS_REQUEST_TIMEOUT_MS', '5000'),
    resultCacheMs: positiveInteger('STATUS_RESULT_CACHE_MS', '30000'),
    clientRefreshMs: positiveInteger('STATUS_CLIENT_REFRESH_MS', '60000'),
    monitorListLimit: positiveInteger('UPTIMEROBOT_MONITOR_LIST_LIMIT', '200'),
    apiUrl: httpUrl(env('UPTIMEROBOT_API_URL', 'https://api.uptimerobot.com/v3/monitors'), 'UPTIMEROBOT_API_URL'),
    apiKey: process.env.UPTIMEROBOT_API_KEY?.trim() ?? '',
    monitors: loadMonitors(),
  };
  return cached;
}
