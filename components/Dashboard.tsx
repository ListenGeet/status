'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MonitorResult, MonitorState, StatusSnapshot } from '@/lib/types';

const STATUS_ENDPOINT = '/api/status';

const labels: Record<MonitorState, string> = {
  operational: 'Operational',
  down: 'Disruption',
  paused: 'Paused',
  checking: 'Starting',
  unknown: 'Unknown',
};

function overallState(monitors: MonitorResult[]): MonitorState {
  const states = monitors.map((m) => m.state);
  if (states.includes('down')) return 'down';
  if (states.includes('unknown')) return 'unknown';
  if (states.includes('paused')) return 'paused';
  if (states.includes('checking')) return 'checking';
  return 'operational';
}

const overallTitles: Record<MonitorState, string> = {
  operational: 'All monitored systems operational',
  down: 'A monitored system has a disruption',
  paused: 'A monitor is paused',
  checking: 'Monitors are starting',
  unknown: 'Some checks could not be verified',
};

function hostname(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function MonitorCard({ monitor }: { monitor: MonitorResult }) {
  return (
    <article className={`monitor-card ${monitor.state}`}>
      <span className="monitor-marker" aria-hidden="true" />
      <div className="monitor-info">
        <strong>{monitor.label}</strong>
        <a href={monitor.url} target="_blank" rel="noopener noreferrer">
          {hostname(monitor.url)}
        </a>
      </div>
      <span className="monitor-state">{labels[monitor.state] ?? labels.unknown}</span>
      {monitor.state === 'unknown' && monitor.detail ? (
        <small className="monitor-detail">{monitor.detail}</small>
      ) : null}
    </article>
  );
}

export default function Dashboard({ initial }: { initial: StatusSnapshot | null }) {
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(initial);
  const [failed, setFailed] = useState(initial === null);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);

  const load = useCallback(async (force = false) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const response = await fetch(`${STATUS_ENDPOINT}${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Status request failed');
      const next = (await response.json()) as StatusSnapshot;
      if (!Array.isArray(next.monitors) || next.monitors.length !== 3) throw new Error('Invalid monitor list');
      setSnapshot(next);
      setFailed(false);
    } catch {
      setSnapshot(null);
      setFailed(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  // Fetch on mount only if the server render had no data.
  useEffect(() => {
    if (initial === null) void load();
  }, [initial, load]);

  const refreshMs = snapshot?.clientRefreshMs;
  useEffect(() => {
    if (!refreshMs) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, refreshMs);
    return () => window.clearInterval(timer);
  }, [refreshMs, load]);

  const state: MonitorState = snapshot ? overallState(snapshot.monitors) : 'unknown';
  const title = snapshot ? overallTitles[state] : failed ? 'Checks unavailable' : 'Checking Geet…';
  const description = snapshot
    ? `${snapshot.monitors.filter((m) => m.state === 'operational').length} of ${snapshot.monitors.length} monitors operational`
    : failed
      ? 'The status service could not load monitor data.'
      : 'Loading monitor status.';
  const checkedAt = snapshot
    ? `Updated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(snapshot.checkedAt))}`
    : failed
      ? 'Not updated'
      : 'First check';

  return (
    <main className="shell">
      <header className="masthead">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand" src="/brand/geet-wordmark-white.png" width={1168} height={381} alt="Geet" />
        <span className="masthead-label">
          <span className="masthead-dot" aria-hidden="true" /> SERVICE STATUS
        </span>
      </header>

      <section className="intro">
        <div className="intro-copy">
          <p className="eyebrow">
            <span className="eyebrow-line" aria-hidden="true" /> GEET · SERVICE HEALTH
          </p>
          <h1>
            Everything
            <br />
            in tune.
          </h1>
          <p className="lede">A live look at the services that keep the music moving.</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-disc">
            <span className="sound-bar bar-one" />
            <span className="sound-bar bar-two" />
            <span className="sound-bar bar-three" />
            <span className="sound-bar bar-four" />
            <span className="sound-bar bar-five" />
          </div>
          <span className="art-caption">GOOD VIBRATIONS ONLY</span>
        </div>
        <button
          className={`refresh-button${loading ? ' loading' : ''}`}
          type="button"
          disabled={loading}
          onClick={() => void load(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 7v5h-5M4.9 9a7.5 7.5 0 0 1 12.8-2.1L20 12M4 17v-5h5m10.1 3a7.5 7.5 0 0 1-12.8 2.1L4 12" />
          </svg>
          <span>Refresh checks</span>
        </button>
      </section>

      <section className={`overall ${state}`} aria-live="polite">
        <span className="overall-icon" aria-hidden="true" />
        <div className="overall-copy">
          <span className="overall-kicker">CURRENT STATUS</span>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <div className="checked-block">
          <span className="checked-label">LAST CHECK</span>
          <span className="checked-at" suppressHydrationWarning>
            {checkedAt}
          </span>
        </div>
      </section>

      <section className="services-section" aria-label="Monitored services">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE GEET NETWORK</p>
            <h2>Service overview</h2>
          </div>
          <span className="service-count">{snapshot?.monitors.length ?? 3} services monitored</span>
        </div>
        <div className="monitors" aria-busy={!snapshot && !failed}>
          {snapshot
            ? snapshot.monitors.map((m) => <MonitorCard key={m.id} monitor={m} />)
            : failed
              ? null
              : [0, 1, 2].map((i) => (
                  <div className="monitor-skeleton" aria-hidden="true" key={i}>
                    <span />
                    <i />
                    <i />
                  </div>
                ))}
        </div>
      </section>

      <footer className="footer">
        <span>Made for music, made to be together.</span>
        <span>Monitoring powered by UptimeRobot</span>
      </footer>
    </main>
  );
}
