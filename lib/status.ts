import 'server-only';
import { getConfig, hostOf, type MonitorTarget } from './config';
import type { MonitorResult, MonitorState, StatusSnapshot } from './types';

let snapshotCache: { expiresAt: number; promise: Promise<StatusSnapshot> } | undefined;

function monitorState(status: string): MonitorState {
  if (status === 'UP') return 'operational';
  if (status === 'DOWN' || status === 'LOOKS_DOWN') return 'down';
  if (status === 'PAUSED') return 'paused';
  if (status === 'STARTED') return 'checking';
  return 'unknown';
}

function apiErrorMessage(status: number): string {
  if (status === 401 || status === 403) return 'UptimeRobot rejected the API key';
  if (status === 429) return 'UptimeRobot rate limit reached';
  return `UptimeRobot request failed (HTTP ${status})`;
}

async function checkMonitor(target: MonitorTarget): Promise<MonitorResult> {
  const config = getConfig();
  if (!config.apiKey) {
    return { ...target, state: 'unknown', detail: 'Add a read-only UptimeRobot API key in .env' };
  }

  const url = new URL(config.apiUrl);
  url.searchParams.set('url', target.host);
  url.searchParams.set('limit', String(config.monitorListLimit));

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
    if (!response.ok) {
      return { ...target, state: 'unknown', detail: apiErrorMessage(response.status) };
    }
    const body = await response.json();
    if (!Array.isArray(body?.data)) {
      return { ...target, state: 'unknown', detail: 'Unexpected UptimeRobot response' };
    }

    const matches = body.data.filter((monitor: { url?: unknown }) => {
      if (typeof monitor.url !== 'string') return false;
      try {
        return hostOf(monitor.url) === target.host;
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

export async function getSnapshot(force = false): Promise<StatusSnapshot> {
  const config = getConfig();
  if (!force && snapshotCache && snapshotCache.expiresAt > Date.now()) return snapshotCache.promise;
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
        state: 'unknown' as const,
        detail: 'Could not load the UptimeRobot status',
      })),
    };
  }
}
