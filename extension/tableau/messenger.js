// Lit la liste « Discussions » de messenger.com (relay.js se charge de
// l'envoi). Ne touche a rien dans la page : aucun clic, aucune lecture
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
    .map(readChat);

  const label = document.querySelector(TOTAL_LINK)?.getAttribute('aria-label') ?? '';
  const total = Number(label.match(/(\d+)/)?.[1] ?? 0);
  return { state: 'ready', chats, total };
}

startRelay('messenger', snapshot);
