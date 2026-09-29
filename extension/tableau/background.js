// Relais entre les onglets de messagerie et le tableau. Les scripts de page ne
// peuvent pas joindre le tableau eux-memes (politique de securite des sites) ;
// l'extension, elle, en a la permission. Adresse et jeton : page d'options.

importScripts('settings.js');

// Onglet a surveiller, par source (la route du tableau porte le meme nom).
const SITES = {
  messenger: 'https://www.messenger.com/*',
  whatsapp: 'https://web.whatsapp.com/*',
};

// Identifiant de cette installation, tire une fois : le tableau distingue ainsi
// les Chrome (plusieurs PC) qui lui rapportent.
async function instanceId() {
  const { instance } = await chrome.storage.local.get('instance');
  if (instance) return instance;
  const created = crypto.randomUUID();
  await chrome.storage.local.set({ instance: created });
  return created;
}

// `tab` : l'onglet dont vient le rapport, ou null pour tout ce Chrome (alarme).
async function report(source, snapshot, tab = null) {
  const { dashboard, token } = await loadSettings();
  const body = { ...snapshot, instance: await instanceId(), tab };
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    await fetch(`${dashboard}/api/${source}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    // Tableau eteint : rien a faire, le prochain envoi reessaiera.
  }
}

// Plusieurs onglets ou plusieurs PC : c'est le tableau qui fait le tri (voir
// feedSnapshot dans lib/providers/relay.ts).
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'snapshot' && message.source in SITES) {
    void report(message.source, message.snapshot, sender.tab?.id ?? null);
  }
});

// Toutes les minutes : les onglets existent-ils encore ? Sans eux, plus personne
// n'envoie rien, et le tableau doit pouvoir dire pourquoi.
chrome.alarms.create('check-tabs', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'check-tabs') return;
  for (const [source, url] of Object.entries(SITES)) {
    const tabs = await chrome.tabs.query({ url });
    if (tabs.length === 0) await report(source, { state: 'noTab', chats: [] });
    else if (tabs.every((tab) => tab.discarded)) await report(source, { state: 'sleeping', chats: [] });
  }
});
