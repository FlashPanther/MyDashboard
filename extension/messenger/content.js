// Lit la liste « Discussions » de messenger.com et la confie au relais
// (background.js). Ne touche a rien dans la page : aucun clic, aucune lecture
// de conversation, donc rien n'est marque comme lu.
//
// Reperes, releves sur messenger.com en septembre 2026 :
// - la liste est un [role="grid"] ; chaque discussion y est un lien /t/<id>/
//   ou /e2ee/t/<id>/ (discussions chiffrees) ;
// - dans un lien, les blocs [dir="auto"] donnent, dans l'ordre : le nom,
//   l'apercu, « · », l'anciennete (« 3 min », « 2 h », « 4 j ») ;
// - une discussion non lue porte un texte cache « Message non lu : » ;
// - le lien « Discussions · 2 non lus » de la barre laterale donne le total,
//   discussions pas encore chargees comprises.
// Si Messenger change cela, c'est ici qu'il faut regarder.

const UNREAD = /Message non lu|Unread message/;
const ROW_HREF = /^\/(e2ee\/)?t\/\d+\/?$/;
const TOTAL_LINK = 'a[aria-label^="Discussions ·"], a[aria-label^="Chats ·"]';

function readChat(link) {
  const href = link.getAttribute('href');
  const blocks = [...link.querySelectorAll('[dir="auto"]')]
    .map((el) => el.textContent.trim())
    .filter((text) => text && text !== '·');
  const name = blocks.shift() ?? '';
  // L'anciennete est courte ; un apercu qui le serait aussi resterait un apercu.
  const when = blocks.length > 1 && blocks.at(-1).length <= 12 ? blocks.pop() : '';
  return {
    id: href,
    name,
    preview: blocks.join(' '),
    when,
    url: new URL(href, location.origin).toString(),
  };
}

function snapshot() {
  if (document.querySelector('input[name="pass"]')) return { state: 'login', chats: [] };

  const grid = document.querySelector('[role="grid"]');
  // Page encore en chargement : mieux vaut se taire que dire « tout est lu ».
  if (!grid) return null;

  const chats = [...grid.querySelectorAll('a[href*="/t/"]')]
    .filter((link) => ROW_HREF.test(link.getAttribute('href')) && UNREAD.test(link.textContent))
    .map(readChat)
    .filter((chat) => chat.name);

  const label = document.querySelector(TOTAL_LINK)?.getAttribute('aria-label') ?? '';
  const total = Number(label.match(/(\d+)/)?.[1] ?? 0);
  return { state: 'ready', chats, total: Math.max(total, chats.length) };
}

let last = '';
let timer = null;

function send(force = false) {
  const current = snapshot();
  if (!current) return;
  const serialized = JSON.stringify(current);
  if (!force && serialized === last) return;
  last = serialized;
  try {
    chrome.runtime.sendMessage({ type: 'snapshot', snapshot: current });
  } catch {
    // Extension rechargee ou retiree : ce script est orphelin, il s'arrete.
    clearInterval(heartbeat);
    observer.disconnect();
  }
}

// Des qu'un message arrive ou qu'une discussion est lue, avec un petit delai
// pour laisser Messenger finir de redessiner la liste.
const observer = new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(send, 1500);
});
observer.observe(document.body, { childList: true, subtree: true, characterData: true });

// Battement de coeur : meme sans changement, le tableau sait que l'onglet vit.
const heartbeat = setInterval(() => send(true), 20_000);
send(true);
