// Relais entre l'onglet messenger.com et le tableau local. Le script de page ne
// peut pas joindre localhost lui-meme (politique de securite de Messenger) ;
// l'extension, elle, en a la permission.

const DASHBOARD = 'http://localhost:3737/api/messenger';

async function report(body) {
  try {
    await fetch(DASHBOARD, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Tableau eteint : rien a faire, le prochain envoi reessaiera.
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'snapshot') void report(message.snapshot);
});

// Toutes les minutes : l'onglet existe-t-il encore ? Sans lui, plus personne
// n'envoie rien, et le tableau doit pouvoir dire pourquoi.
chrome.alarms.create('check-tab', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'check-tab') return;
  const tabs = await chrome.tabs.query({ url: 'https://www.messenger.com/*' });
  if (tabs.length === 0) return report({ state: 'noTab', chats: [] });
  if (tabs.every((tab) => tab.discarded)) return report({ state: 'sleeping', chats: [] });
});
