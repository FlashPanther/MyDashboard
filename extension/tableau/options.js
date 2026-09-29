const url = document.getElementById('url');
const token = document.getElementById('token');
const status = document.getElementById('status');

loadSettings().then((settings) => {
  url.value = settings.dashboard;
  token.value = settings.token;
});

document.getElementById('save').addEventListener('click', async () => {
  let address;
  try {
    address = new URL(url.value.trim());
  } catch {
    status.textContent = 'Adresse invalide.';
    return;
  }
  const origin = address.origin;
  // Le jeton part avec chaque envoi : jamais en clair sur le reseau.
  if (address.protocol !== 'https:' && origin !== DEFAULT_DASHBOARD) {
    status.textContent = `Adresse en https:// obligatoire (sauf ${DEFAULT_DASHBOARD}).`;
    return;
  }
  // L'extension ne peut joindre que les sites autorises : on demande l'acces a
  // cette adresse-la, et a rien d'autre.
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    status.textContent = 'Accès refusé : rien n’est enregistré.';
    return;
  }
  await chrome.storage.local.set({ dashboard: origin, token: token.value.trim() });
  status.textContent = 'Enregistré.';
});
