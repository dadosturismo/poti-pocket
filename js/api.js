import { APP_CONFIG } from './config.js';

function configuredUrl() {
  const url = String(APP_CONFIG.WEB_APP_URL || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(url)) {
    throw new Error('Configure WEB_APP_URL em js/config.js com a URL /exec do Web App.');
  }
  return url;
}

export function apiRequest(action) {
  return new Promise((resolve, reject) => {
    if (!navigator.onLine) {
      reject(new Error('Sem conexão com a internet.'));
      return;
    }

    const callback = `pocketTurismo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => finish(new Error('O servidor demorou para responder.')), APP_CONFIG.API_TIMEOUT_MS);

    function finish(error, payload) {
      window.clearTimeout(timeout);
      delete window[callback];
      script.remove();
      if (error) reject(error);
      else resolve(payload);
    }

    window[callback] = payload => {
      if (!payload || payload.ok !== true) {
        finish(new Error(payload?.error?.message || 'A API retornou uma resposta inválida.'));
        return;
      }
      finish(null, payload);
    };

    try {
      const url = new URL(configuredUrl());
      url.searchParams.set('action', action);
      url.searchParams.set('callback', callback);
      url.searchParams.set('_', String(Date.now()));
      script.src = url.toString();
      script.async = true;
      script.onerror = () => finish(new Error('Não foi possível alcançar o Google Apps Script.'));
      document.head.append(script);
    } catch (error) {
      finish(error);
    }
  });
}

