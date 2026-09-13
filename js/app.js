import { apiRequest } from './api.js';
import { escapeHtml, formatDateTime } from './format.js';
import { loadSnapshot, saveSnapshot } from './store.js';
import { renderIndicator, renderNavigation, renderOverview } from './ui.js';

const elements = {
  welcome: document.querySelector('#welcome'),
  dashboard: document.querySelector('#dashboard'),
  accessButton: document.querySelector('#accessButton'),
  accessStatus: document.querySelector('#accessStatus'),
  appStatus: document.querySelector('#appStatus'),
  view: document.querySelector('#view'),
  nav: document.querySelector('#indicatorNav'),
  sidebar: document.querySelector('#sidebar'),
  backdrop: document.querySelector('#sidebarBackdrop'),
  menuButton: document.querySelector('#menuButton'),
  refreshButton: document.querySelector('#refreshButton'),
  connectionBadge: document.querySelector('#connectionBadge'),
  offlineBanner: document.querySelector('#offlineBanner'),
  syncLabel: document.querySelector('#syncLabel'),
  installButton: document.querySelector('#installButton')
};

const state = { payload: null, snapshot: null, activeId: 'visao-geral', opened: false, refreshing: false, filters: {} };
let installPrompt = null;

function setStatus(message = '', error = false) {
  elements.appStatus.innerHTML = message ? `<p class="status-message${error ? ' status-message--error' : ''}">${escapeHtml(message)}</p>` : '';
}

function showLoading() {
  elements.view.setAttribute('aria-busy', 'true');
  elements.view.innerHTML = '<div class="loading-grid" aria-label="Carregando indicadores"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  elements.connectionBadge.textContent = online ? '● Online' : '● Offline';
  elements.connectionBadge.className = `connection-badge ${online ? 'online' : 'offline'}`;
  if (!online) {
    elements.offlineBanner.hidden = false;
    elements.offlineBanner.textContent = state.snapshot?.savedAt
      ? `Você está offline. Exibindo dados salvos em ${formatDateTime(state.snapshot.savedAt)}.`
      : 'Você está offline. Ainda não há dados salvos neste dispositivo.';
  } else {
    elements.offlineBanner.hidden = true;
    elements.offlineBanner.textContent = '';
  }
}

function currentRoute() {
  const id = decodeURIComponent(location.hash.replace(/^#/, '')) || 'visao-geral';
  return id === 'visao-geral' || state.payload?.indicators.some(indicator => indicator.id === id) ? id : 'visao-geral';
}

function renderRoute({ focus = false, scroll = true } = {}) {
  if (!state.payload) return;
  state.activeId = currentRoute();
  const filter = state.filters[state.activeId] || {};
  elements.nav.innerHTML = renderNavigation(state.payload.indicators, state.activeId);
  elements.view.innerHTML = state.activeId === 'visao-geral'
    ? renderOverview(state.payload, filter)
    : renderIndicator(state.payload.indicators.find(indicator => indicator.id === state.activeId), state.payload.currentPeriod, filter);
  elements.view.setAttribute('aria-busy', 'false');
  document.title = state.activeId === 'visao-geral'
    ? 'Visão geral | Dashboard Pocket do Turismo'
    : `${state.payload.indicators.find(indicator => indicator.id === state.activeId)?.shortTitle || 'Indicador'} | Dashboard Pocket do Turismo`;
  closeMenu();
  if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
  if (focus) document.querySelector('#conteudo').focus({ preventScroll: true });
}

function applySnapshot(snapshot, message = '') {
  state.snapshot = snapshot;
  state.payload = snapshot.payload;
  elements.syncLabel.textContent = `Sincronizado em ${formatDateTime(snapshot.savedAt)}`;
  renderRoute();
  updateNetworkStatus();
  setStatus(message);
}

async function refreshData({ silent = false } = {}) {
  if (state.refreshing) return;
  state.refreshing = true;
  elements.refreshButton.disabled = true;
  if (!silent) showLoading();
  try {
    const payload = await apiRequest('data');
    const snapshot = await saveSnapshot(payload);
    applySnapshot(snapshot, payload.unavailable?.length ? `${payload.unavailable.length} indicador(es) configurado(s) não foram encontrados na planilha.` : '');
  } catch (error) {
    const snapshot = state.snapshot || await loadSnapshot();
    if (snapshot?.payload) {
      applySnapshot(snapshot, `Não foi possível atualizar agora. Exibindo a cópia salva em ${formatDateTime(snapshot.savedAt)}.`);
    } else {
      elements.view.setAttribute('aria-busy', 'false');
      elements.view.innerHTML = '<section class="panel"><h1>Dados indisponíveis</h1><p>Não há uma cópia offline neste dispositivo.</p></section>';
      setStatus(error.message, true);
      elements.syncLabel.textContent = 'Dados ainda não sincronizados';
    }
  } finally {
    state.refreshing = false;
    elements.refreshButton.disabled = false;
    updateNetworkStatus();
  }
}

async function openDashboard() {
  if (state.opened) return;
  state.opened = true;
  elements.accessButton.disabled = true;
  elements.accessStatus.textContent = navigator.onLine ? 'Abrindo o painel e registrando o acesso…' : 'Abrindo os últimos dados salvos…';
  elements.dashboard.hidden = false;
  elements.welcome.hidden = true;
  showLoading();

  const cached = await loadSnapshot();
  if (cached?.payload) {
    state.snapshot = cached;
    state.payload = cached.payload;
    applySnapshot(cached);
  }

  const logAttempt = navigator.onLine ? apiRequest('log') : Promise.reject(new Error('Acesso não registrado porque o dispositivo está offline.'));
  const results = await Promise.allSettled([logAttempt, refreshData({ silent: Boolean(cached?.payload) })]);
  if (results[0].status === 'rejected' && state.payload) {
    const suffix = cached?.payload ? ' O painel continua disponível com os dados salvos.' : '';
    setStatus(`Não foi possível registrar a data/hora do acesso.${suffix}`);
  }
  document.querySelector('#conteudo').focus();
}

function openMenu() {
  elements.sidebar.classList.add('is-open');
  elements.backdrop.hidden = false;
  elements.menuButton.setAttribute('aria-expanded', 'true');
  elements.sidebar.querySelector('a')?.focus();
}

function closeMenu() {
  elements.sidebar.classList.remove('is-open');
  elements.backdrop.hidden = true;
  elements.menuButton.setAttribute('aria-expanded', 'false');
}

elements.accessButton.addEventListener('click', openDashboard);
elements.menuButton.addEventListener('click', () => elements.sidebar.classList.contains('is-open') ? closeMenu() : openMenu());
elements.backdrop.addEventListener('click', closeMenu);
elements.refreshButton.addEventListener('click', () => refreshData());
elements.nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
elements.view.addEventListener('change', event => {
  const select = event.target.closest('[data-period-filter]');
  if (!select) return;
  const key = select.dataset.periodFilter;
  state.filters[state.activeId] = { ...(state.filters[state.activeId] || {}), [key]: select.value };
  renderRoute({ scroll: false });
  document.querySelector(`[data-period-filter="${key}"]`)?.focus();
});
elements.view.addEventListener('click', event => {
  const card = event.target.closest('.overview-card');
  if (!card || state.activeId !== 'visao-geral') return;
  const indicatorId = decodeURIComponent(card.hash.replace(/^#/, ''));
  state.filters[indicatorId] = { ...(state.filters['visao-geral'] || {}) };
});
window.addEventListener('hashchange', () => renderRoute({ focus: true }));
window.addEventListener('online', () => { updateNetworkStatus(); if (state.opened) refreshData({ silent: true }); });
window.addEventListener('offline', updateNetworkStatus);
window.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  elements.installButton.hidden = false;
});
elements.installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  elements.installButton.hidden = true;
});
window.addEventListener('appinstalled', () => { elements.installButton.hidden = true; installPrompt = null; });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
updateNetworkStatus();
