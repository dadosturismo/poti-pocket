import { apiRequest } from './api.js';
import { APP_CONFIG } from './config.js';
import { escapeHtml, formatDateTime } from './format.js';
import { clearDashboardSnapshots, loadSnapshot, recordAccess, saveSnapshot } from './store.js';
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
  forceRefreshButton: document.querySelector('#forceRefreshButton'),
  connectionBadge: document.querySelector('#connectionBadge'),
  offlineBanner: document.querySelector('#offlineBanner'),
  syncLabel: document.querySelector('#syncLabel'),
  loadAllButton: document.querySelector('#loadAllButton'),
  installButton: document.querySelector('#installButton'),
  welcomeInstallButton: document.querySelector('#welcomeInstallButton')
};

const state = { payload: null, snapshot: null, activeId: 'visao-geral', opened: false, refreshing: false, filters: {} };
let installPrompt = null;
let inactivityTimer = null;

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

function dataScope(payload = state.payload) {
  return payload?.dataScope === 'all' ? 'all' : 'priority';
}

function snapshotKey(scope) {
  return scope === 'all' ? APP_CONFIG.ALL_DATA_KEY : APP_CONFIG.DATA_KEY;
}

function updateLoadAllButton() {
  const hasMoreIndicators = Boolean(state.payload?.hasMoreIndicators);
  elements.loadAllButton.hidden = !hasMoreIndicators;
  elements.loadAllButton.disabled = state.refreshing;
}

function applySnapshot(snapshot, message = '') {
  state.snapshot = snapshot;
  state.payload = snapshot.payload;
  const isPartial = state.payload.hasMoreIndicators;
  elements.syncLabel.textContent = `${isPartial ? 'Indicadores principais' : 'Todos os indicadores'} sincronizados em ${formatDateTime(snapshot.savedAt)}`;
  renderRoute();
  updateLoadAllButton();
  updateNetworkStatus();
  const partialMessage = isPartial ? 'Exibindo os indicadores principais. Abra o menu para carregar todos.' : '';
  setStatus([message, partialMessage].filter(Boolean).join(' '));
}

async function refreshData({ silent = false, scope = 'priority', force = false } = {}) {
  if (state.refreshing) return;
  const requestedScope = scope === 'all' ? 'all' : 'priority';
  const requestedSnapshotKey = snapshotKey(requestedScope);
  state.refreshing = true;
  elements.refreshButton.disabled = true;
  updateLoadAllButton();
  if (!silent) showLoading();
  try {
    const action = force ? 'data-all-force' : requestedScope === 'all' ? 'data-all' : 'data';
    const payload = await apiRequest(action);
    const snapshot = await saveSnapshot(payload, requestedSnapshotKey);
    applySnapshot(snapshot, payload.unavailable?.length ? `${payload.unavailable.length} indicador(es) configurado(s) não foram encontrados na planilha.` : '');
  } catch (error) {
    const currentSnapshot = state.snapshot?.payload?.dataScope === requestedScope ? state.snapshot : null;
    const snapshot = currentSnapshot || await loadSnapshot(requestedSnapshotKey);
    if (snapshot?.payload) {
      applySnapshot(snapshot, `Não foi possível atualizar agora. Exibindo a cópia salva em ${formatDateTime(snapshot.savedAt)}.`);
    } else if (state.payload && requestedScope === 'all') {
      renderRoute({ scroll: false });
      setStatus('Não foi possível carregar todos os indicadores. Os indicadores principais continuam disponíveis.', true);
    } else {
      elements.view.setAttribute('aria-busy', 'false');
      elements.view.innerHTML = '<section class="panel"><h1>Dados indisponíveis</h1><p>Não há uma cópia offline neste dispositivo. A primeira atualização pode levar até um minuto.</p><button class="button button--secondary" type="button" data-retry-data>Tentar novamente</button></section>';
      setStatus(error.message, true);
      elements.syncLabel.textContent = 'Dados ainda não sincronizados';
    }
  } finally {
    state.refreshing = false;
    elements.refreshButton.disabled = false;
    updateLoadAllButton();
    updateNetworkStatus();
  }
}

function loadAllIndicators() {
  if (!state.payload?.hasMoreIndicators || state.refreshing) return;
  refreshData({ scope: 'all' });
}

async function forceRefresh() {
  if (state.refreshing) return;
  elements.forceRefreshButton.disabled = true;
  try {
    await clearDashboardSnapshots();
    state.payload = null;
    state.snapshot = null;
    state.activeId = 'visao-geral';
    state.filters = {};
    elements.syncLabel.textContent = 'Cópias salvas removidas. Atualizando todos os indicadores…';
    updateLoadAllButton();
    await refreshData({ scope: 'all', force: true });
  } finally {
    elements.forceRefreshButton.disabled = false;
  }
}

function resetInactivityTimer() {
  if (!state.opened) return;
  window.clearTimeout(inactivityTimer);
  inactivityTimer = window.setTimeout(returnToWelcome, APP_CONFIG.INACTIVITY_TIMEOUT_MS);
}

function returnToWelcome() {
  if (!state.opened) return;
  window.clearTimeout(inactivityTimer);
  inactivityTimer = null;
  state.opened = false;
  state.activeId = 'visao-geral';
  state.filters = {};
  state.payload = null;
  state.snapshot = null;
  elements.dashboard.hidden = true;
  elements.welcome.hidden = false;
  elements.accessButton.disabled = false;
  elements.accessStatus.textContent = 'Sessão encerrada por inatividade.';
  elements.syncLabel.textContent = 'Dados ainda não sincronizados';
  updateLoadAllButton();
  document.title = 'Dashboard Pocket do Turismo de Curitiba';
  closeMenu();
  window.scrollTo({ top: 0, behavior: 'auto' });
  elements.accessButton.focus({ preventScroll: true });
}

async function handleAccessClick() {
  if (state.opened || elements.accessButton.disabled) return;
  elements.accessButton.disabled = true;
  try {
    await recordAccess();
  } catch {
    // O painel permanece acessível mesmo se o armazenamento local estiver bloqueado.
  }
  openDashboard();
}

async function openDashboard() {
  if (state.opened) return;
  state.opened = true;
  elements.accessButton.disabled = true;
  elements.accessStatus.textContent = navigator.onLine ? 'Abrindo o painel…' : 'Abrindo os últimos dados salvos…';
  elements.dashboard.hidden = false;
  elements.welcome.hidden = true;
  showLoading();

  const cached = await loadSnapshot(APP_CONFIG.DATA_KEY);
  if (cached?.payload) {
    state.snapshot = cached;
    state.payload = cached.payload;
    applySnapshot(cached);
  }

  await refreshData({ silent: Boolean(cached?.payload) });
  document.querySelector('#conteudo').focus();
  resetInactivityTimer();
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

elements.accessButton.addEventListener('click', handleAccessClick);
elements.menuButton.addEventListener('click', () => elements.sidebar.classList.contains('is-open') ? closeMenu() : openMenu());
elements.backdrop.addEventListener('click', closeMenu);
elements.refreshButton.addEventListener('click', () => refreshData({ scope: dataScope() }));
elements.forceRefreshButton.addEventListener('click', forceRefresh);
elements.loadAllButton.addEventListener('click', loadAllIndicators);
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
  if (event.target.closest('[data-retry-data]')) {
    refreshData();
    return;
  }
  const card = event.target.closest('.overview-card');
  if (!card || state.activeId !== 'visao-geral') return;
  const indicatorId = decodeURIComponent(card.hash.replace(/^#/, ''));
  state.filters[indicatorId] = { ...(state.filters['visao-geral'] || {}) };
});
window.addEventListener('hashchange', () => renderRoute({ focus: true }));
window.addEventListener('online', () => { updateNetworkStatus(); if (state.opened) refreshData({ silent: true, scope: dataScope() }); });
window.addEventListener('offline', updateNetworkStatus);
window.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'].forEach(eventName => {
  window.addEventListener(eventName, resetInactivityTimer, { passive: eventName !== 'keydown' });
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) resetInactivityTimer();
});

const standaloneMedia = window.matchMedia('(display-mode: standalone)');

function isInstalled() {
  return standaloneMedia.matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function updateInstallButtons() {
  const canInstall = !isInstalled() && (Boolean(installPrompt) || isIosDevice());
  elements.installButton.hidden = !canInstall;
  elements.welcomeInstallButton.hidden = !canInstall;
}

async function requestInstall() {
  if (isInstalled()) {
    updateInstallButtons();
    return;
  }
  if (!installPrompt) {
    const message = 'No iPhone ou iPad, toque em Compartilhar e depois em “Adicionar à Tela de Início”.';
    if (elements.welcome.hidden) setStatus(message);
    else elements.accessStatus.textContent = message;
    return;
  }

  const prompt = installPrompt;
  installPrompt = null;
  updateInstallButtons();
  await prompt.prompt();
  const choice = await prompt.userChoice;
  if (choice.outcome === 'dismissed') {
    const message = 'Instalação cancelada. Você pode tentar novamente pelo menu do navegador.';
    if (elements.welcome.hidden) setStatus(message);
    else elements.accessStatus.textContent = message;
  }
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  updateInstallButtons();
});
elements.installButton.addEventListener('click', requestInstall);
elements.welcomeInstallButton.addEventListener('click', requestInstall);
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  updateInstallButtons();
  elements.accessStatus.textContent = 'Aplicativo instalado com sucesso.';
});
standaloneMedia.addEventListener?.('change', updateInstallButtons);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
updateNetworkStatus();
updateLoadAllButton();
updateInstallButtons();
