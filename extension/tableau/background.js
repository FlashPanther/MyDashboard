// Relais entre les onglets de messagerie et le tableau. Les scripts de page ne
// peuvent pas joindre le tableau eux-memes (politique de securite des sites) ;
// l'extension, elle, en a la permission.

const DASHBOARD = 'http://localhost:3737';

// Onglet a surveiller, par source (la route du tableau porte le meme nom).
const SITES = {
  messenger: 'https://www.messenger.com/*',
  whatsapp: 'https://web.whatsapp.com/*',
};

async function report(source, body) {
  try {
    await fetch(`${DASHBOARD}/api/${source}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Tableau eteint : rien a faire, le prochain envoi reessaiera.
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'snapshot' && message.source in SITES) {
    void report(message.source, message.snapshot);
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
