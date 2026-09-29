const url = document.getElementById('url');
const token = document.getElementById('token');
const status = document.getElementById('status');

loadSettings().then((settings) => {
  url.value = settings.dashboard;
  token.value = settings.token;
});

document.getElementById('save').addEventListener('click', async () => {
  let origin;
  try {
    origin = new URL(url.value.trim()).origin;
  } catch {
    status.textContent = 'Adresse invalide.';
    return;
  }
  // L'extension ne peut joindre que les sites autorises : on demande l'acces a
  // cette adresse-la, et a rien d'autre.
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    status.textContent = 'Accès refusé : rien n’est enregistré.';
    return;
  }
  await chrome.storage.sync.set({ dashboard: origin, token: token.value.trim() });
  status.textContent = 'Enregistré.';
});
