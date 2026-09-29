// Commun aux lecteurs de page (messenger.js, whatsapp.js) : surveille la page,
// et confie au relais (background.js) chaque nouvelle liste de discussions.
// `read` rend { state, chats, total }, ou null tant que la page charge.

function startRelay(source, read) {
  let last = '';
  let timer = null;

  function send(force = false) {
    const current = read();
    if (!current) return;
    const serialized = JSON.stringify(current);
    if (!force && serialized === last) return;
    last = serialized;
    try {
      chrome.runtime.sendMessage({ type: 'snapshot', source, snapshot: current });
    } catch {
      // Extension rechargee ou retiree : ce script est orphelin, il s'arrete.
      clearInterval(heartbeat);
      observer.disconnect();
    }
  }

  // Des qu'un message arrive ou qu'une discussion est lue, avec un petit delai
  // pour laisser la page finir de redessiner la liste.
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(send, 1500);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  // Battement de coeur : meme sans changement, le tableau sait que l'onglet vit.
  const heartbeat = setInterval(() => send(true), 20_000);
  send(true);
}
