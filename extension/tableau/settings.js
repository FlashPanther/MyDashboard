// Reglages partages par background.js et options.js : ou envoyer, avec quel jeton.
// Stockage local, pas « sync » : le jeton ne voyage pas avec le compte Chrome.
const DEFAULT_DASHBOARD = 'http://localhost:3737';

async function loadSettings() {
  const { dashboard, token } = await chrome.storage.local.get(['dashboard', 'token']);
  return { dashboard: dashboard || DEFAULT_DASHBOARD, token: token || '' };
}
