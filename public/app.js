const environments = document.querySelector('#environments');
const overall = document.querySelector('#overall');
const refreshButton = document.querySelector('#refresh');
const refreshIcon = refreshButton.querySelector('svg');
const statusEndpoint = document.querySelector('meta[name="status-api-path"]').content;
let busy = false;
let refreshTimer;

const stateLabel = (state) => ({
  operational: 'Operational',
  down: 'Disruption',
  unknown: 'Not reported',
})[state] ?? 'Not reported';

const safeText = (value) => String(value ?? '');

function serviceRow(icon, name, detail, state, extra = '') {
  const row = document.createElement('div');
  row.className = 'service';
  row.innerHTML = `<span class="service-icon ${state}">${icon}</span><span class="service-copy"><strong></strong><small></small></span><span class="service-state ${state}"></span>`;
  row.querySelector('.service-copy strong').textContent = name;
  row.querySelector('.service-copy small').textContent = detail;
  const stateElement = row.querySelector('.service-state');
  stateElement.append(document.createTextNode(stateLabel(state)));
  if (extra) {
    const version = document.createElement('span');
    version.className = 'version';
    version.textContent = extra;
    stateElement.append(' ', version);
  }
  return row;
}

function renderEnvironment(environment) {
  const pageState = environment.pages.every((page) => page.state === 'operational') ? 'operational' : 'down';
  const states = [pageState, environment.api, environment.home, environment.database, environment.cache, environment.playback, environment.webCache];
  const overallState = states.includes('down') ? 'down' : states.includes('unknown') ? 'unknown' : 'operational';
  const card = document.createElement('article');
  card.className = 'environment-card';

  const heading = document.createElement('div');
  heading.className = 'environment-heading';
  heading.innerHTML = '<div><p class="environment-kicker"></p><h2></h2></div><a class="open-link" target="_blank" rel="noreferrer">Open site ↗</a>';
  heading.querySelector('.environment-kicker').textContent = safeText(environment.badge);
  heading.querySelector('h2').textContent = safeText(environment.label);
  heading.querySelector('a').href = environment.webUrl;
  card.append(heading);

  const banner = document.createElement('div');
  banner.className = `health-banner ${overallState}`;
  banner.textContent = overallState === 'operational' ? 'All checks passing' : overallState === 'down' ? 'Some checks failed' : 'Some checks unavailable';
  card.append(banner);

  const list = document.createElement('div');
  list.className = 'service-list';
  list.append(
    serviceRow('◎', 'Web app routes', `${environment.webUrl} · ${environment.pages.filter((page) => page.state === 'operational').length}/${environment.pages.length} responding`, pageState),
    serviceRow('⇄', 'API', environment.apiUrl, environment.api, environment.version ? `v${safeText(environment.version)}` : ''),
    serviceRow('♫', 'Home and catalogue data', `GET ${environment.apiHomePath}`, environment.home),
    serviceRow('▦', 'Database', 'Live API database ping', environment.database),
    serviceRow('◫', 'API read cache', 'Reported by the API health endpoint', environment.cache),
    serviceRow('♫', 'Playback storage', 'Preview availability and guest URL signing', environment.playback),
    serviceRow('◩', 'Offline service worker', 'Worker script and cache response headers', environment.webCache),
  );
  card.append(list);

  const details = document.createElement('details');
  details.className = 'routes';
  const summary = document.createElement('summary');
  summary.append(document.createTextNode('Frontend routes'));
  const count = document.createElement('span');
  count.textContent = `${environment.pages.filter((page) => page.state === 'operational').length}/${environment.pages.length} responding`;
  summary.append(count);
  details.append(summary);
  const routeList = document.createElement('div');
  routeList.className = 'route-list';
  for (const page of environment.pages) {
    const row = document.createElement('div');
    row.className = 'route';
    row.innerHTML = '<span class="route-dot"></span><code></code><span class="route-detail"></span>';
    row.querySelector('.route-dot').classList.toggle('down', page.state !== 'operational');
    row.querySelector('code').textContent = page.path;
    row.querySelector('.route-detail').textContent = page.detail;
    routeList.append(row);
  }
  details.append(routeList);
  card.append(details);
  return { card, overallState };
}

function updateOverall(snapshot) {
  const states = snapshot.environments.flatMap((environment) => [
    environment.api,
    environment.home,
    environment.database,
    environment.cache,
    environment.playback,
    environment.webCache,
    ...environment.pages.map((page) => page.state),
  ]);
  const state = states.includes('down') ? 'down' : states.includes('unknown') || states.length === 0 ? 'unknown' : 'operational';
  overall.className = `overall ${state}`;
  document.querySelector('#overall-title').textContent = state === 'operational'
    ? 'All checked systems operational'
    : state === 'down'
      ? 'Some checks need attention'
      : 'Some checks could not be verified';
  const environmentNames = snapshot.environments.map((environment) => environment.label).join(' and ');
  document.querySelector('#overall-description').textContent = state === 'operational'
    ? `${environmentNames} checks are responding.`
    : state === 'down'
      ? 'One or more live checks returned an error.'
      : 'Some deployed services do not yet report detailed cache or playback health.';
  document.querySelector('#checked-at').textContent = `Updated ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(snapshot.checkedAt))}`;
}

async function loadStatus(force = false) {
  if (busy) return;
  busy = true;
  refreshButton.disabled = true;
  refreshIcon.classList.add('spinning');
  try {
    const response = await fetch(`${statusEndpoint}${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Status service returned an error');
    const snapshot = await response.json();
    environments.replaceChildren();
    if (!snapshot.environments.length) throw new Error('No environment checks returned');
    document.querySelector('#brand-link').href = snapshot.primaryWebUrl;
    document.querySelector('#footer-link').href = snapshot.primaryWebUrl;
    for (const environment of snapshot.environments) {
      environments.append(renderEnvironment(environment).card);
    }
    updateOverall(snapshot);
    window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadStatus();
    }, snapshot.clientRefreshMs);
  } catch {
    environments.innerHTML = '<div class="error">Could not load live checks. Make sure the status server is running and try again.</div>';
    overall.className = 'overall unknown';
    document.querySelector('#overall-title').textContent = 'Checks unavailable';
    document.querySelector('#overall-description').textContent = 'The status service could not reach its check endpoint.';
  } finally {
    busy = false;
    refreshButton.disabled = false;
    refreshIcon.classList.remove('spinning');
  }
}

refreshButton.addEventListener('click', () => loadStatus(true));
void loadStatus();
