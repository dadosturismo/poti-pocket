/** Único ponto de configuração do front-end. */
export const APP_CONFIG = Object.freeze({
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbxngKCRuvw6z63CuNcQ9TRTKo4QZNdz54P0OpNXISLJuCDHMqzru3AiIynQMbi80g6QZQ/exec',
  // A primeira execução do Apps Script pode levar mais tempo que uma resposta em cache.
  API_TIMEOUT_MS: 60000,
  INACTIVITY_TIMEOUT_MS: 60 * 1000,
  DATABASE_NAME: 'turismo-curitiba-pocket-v1',
  DATA_KEY: 'dashboard-priority-data',
  ALL_DATA_KEY: 'dashboard-all-data'
});
