const monitorList = document.querySelector('#monitors');
const overall = document.querySelector('#overall');
const refreshButton = document.querySelector('#refresh');
const statusEndpoint = document.querySelector('meta[name="status-api-path"]').content;
let busy = false;
let refreshTimer;

const labels = {
  operational: 'Operational',
  down: 'Disruption',
  paused: 'Paused',
  checking: 'Starting',
  unknown: 'Unknown',
};

function renderMonitor(monitor) {
  const card = document.createElement('article');
  card.className = `monitor-card ${monitor.state}`;
  const marker = document.createElement('span');
  marker.className = 'monitor-marker';
  marker.setAttribute('aria-hidden', 'true');
  const info = document.createElement('div');
  info.className = 'monitor-info';
  const name = document.createElement('strong');
  name.textContent = monitor.label;
  const url = document.createElement('a');
  url.href = monitor.url;
  url.target = '_blank';
  url.rel = 'noreferrer';
  url.textContent = new URL(monitor.url).host;
  info.append(name, url);
  const status = document.createElement('span');
  status.className = 'monitor-state';
  status.textContent = labels[monitor.state] ?? labels.unknown;
  card.append(marker, info, status);
  if (monitor.state === 'unknown' && monitor.detail) {
    const detail = document.createElement('small');
    detail.className = 'monitor-detail';
    detail.textContent = monitor.detail;
    card.append(detail);
  }
  return card;
}

function updateOverall(snapshot) {
  const states = snapshot.monitors.map((monitor) => monitor.state);
  const state = states.includes('down') ? 'down'
    : states.includes('unknown') ? 'unknown'
      : states.includes('paused') ? 'paused'
        : states.includes('checking') ? 'checking' : 'operational';
  overall.className = `overall ${state}`;
  document.querySelector('#overall-title').textContent = state === 'operational'
    ? 'All monitored systems operational'
    : state === 'down' ? 'A monitored system has a disruption'
      : state === 'paused' ? 'A monitor is paused'
        : state === 'checking' ? 'Monitors are starting'
          : 'Some checks could not be verified';
  document.querySelector('#overall-description').textContent = `${snapshot.monitors.filter((monitor) => monitor.state === 'operational').length} of ${snapshot.monitors.length} monitors operational`;
  document.querySelector('#checked-at').textContent = `Updated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(snapshot.checkedAt))}`;
}

async function loadStatus(force = false) {
  if (busy) return;
  busy = true;
  refreshButton.disabled = true;
  refreshButton.classList.add('loading');
  try {
    const response = await fetch(`${statusEndpoint}${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Status request failed');
    const snapshot = await response.json();
    if (!Array.isArray(snapshot.monitors) || snapshot.monitors.length !== 3) throw new Error('Invalid monitor list');
    monitorList.replaceChildren(...snapshot.monitors.map(renderMonitor));
    monitorList.setAttribute('aria-busy', 'false');
    updateOverall(snapshot);
    window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadStatus();
    }, snapshot.clientRefreshMs);
  } catch {
    monitorList.replaceChildren();
    monitorList.setAttribute('aria-busy', 'false');
    overall.className = 'overall unknown';
    document.querySelector('#overall-title').textContent = 'Checks unavailable';
    document.querySelector('#overall-description').textContent = 'The status service could not load monitor data.';
    document.querySelector('#checked-at').textContent = 'Not updated';
  } finally {
    busy = false;
    refreshButton.disabled = false;
    refreshButton.classList.remove('loading');
  }
}

refreshButton.addEventListener('click', () => void loadStatus(true));
void loadStatus();
