// Lit la liste des discussions de web.whatsapp.com (relay.js se charge de
// l'envoi). Ne touche a rien dans la page : aucun clic, aucune discussion
// ouverte, donc rien n'est marque comme lu.
//
// Reperes, releves sur web.whatsapp.com en septembre 2026 :
// - la liste est le [role="grid"] de #pane-side ; une discussion y est un
//   [role="row"] ;
// - dans une ligne : [data-testid="cell-frame-title"] porte le nom (span[title]),
//   [data-testid="cell-frame-primary-detail"] l'heure (« 14:32 », « hier »),
//   [data-testid="last-msg-status"] l'apercu complet (attribut title) et, dans
//   un groupe, l'auteur suivi d'un span « : » ;
// - dans un onglet en arriere-plan, innerText est vide : lire textContent ;
// - [data-testid="icon-unread-count"] porte le nombre de non-lus
//   (aria-label « 3 messages non lus ») ;
// - une discussion en sourdine porte l'icone « Discussion en silencieux » : elle
//   reste hors du tableau, comme sur le telephone ;
// - le titre de l'onglet, « (4) WhatsApp », donne le total des discussions non
//   lues, y compris celles que la liste n'a pas encore chargees.
// Si WhatsApp change cela, c'est ici qu'il faut regarder.

const HOME = 'https://web.whatsapp.com/';
const MUTED = '[aria-label="Discussion en silencieux"], [aria-label="Muted chat"], [data-testid^="mute"]';
// Marques de direction (LRE, PDF…) qu'WhatsApp glisse autour des textes.
const BIDI = /[\u200e\u200f\u202a-\u202e]/g;

function clean(value) {
  return (value ?? '').replace(BIDI, '').trim();
}

// null pour une ligne sans non-lus, ou en sourdine.
function readRow(row, index) {
  // textContent, jamais innerText : dans un onglet en arriere-plan, WhatsApp ne
  // dessine pas la liste et innerText y est vide.
  const cell = (id) => row.querySelector(`[data-testid="${id}"]`);
  const text = (el) => clean(el?.textContent);
  const titleCell = cell('cell-frame-title');
  const name = clean(titleCell?.querySelector('span[title]')?.getAttribute('title')) || text(titleCell);

  // Apercu complet dans le title ; dans un groupe, l'auteur est le bloc qui
  // precede le « : » (prefixe de « ~ » quand il n'est pas dans les contacts).
  const status = cell('last-msg-status');
  const colon = status && [...status.children].find((child) => text(child) === ':');
  const author = colon ? text(colon.previousElementSibling).replace(/^~\s*/, '') : '';

  const badge = cell('icon-unread-count');
  if (!badge || row.querySelector(MUTED)) return null;
  const when = text(cell('cell-frame-primary-detail'));
  return {
    // Pas d'identifiant dans la page ; le nom et l'heure suffisent a une cle d'affichage.
    id: `${index}:${name}:${when}`,
    name,
    author: author || null,
    preview: clean(status?.getAttribute('title')) || text(status),
    when,
    // Une discussion marquee « non lue » a la main a une pastille sans chiffre.
    unread: Number(text(badge)) || Number(badge?.getAttribute('aria-label')?.match(/\d+/)?.[0]) || 0,
    // WhatsApp Web n'a pas d'adresse par discussion : on ouvre l'accueil.
    url: HOME,
  };
}

function snapshot() {
  const side = document.querySelector('#pane-side');
  if (!side) {
    // Pas de liste : soit la page charge encore, soit elle affiche le QR code.
    return document.querySelector('canvas') ? { state: 'login', chats: [] } : null;
  }

  const grid = side.querySelector('[role="grid"]');
  if (!grid) return null;

  const chats = [...grid.querySelectorAll('[role="row"]')].map(readRow).filter(Boolean);
  const total = Number(document.title.match(/^\((\d+)\)/)?.[1] ?? 0);
  return { state: 'ready', chats, total };
}

startRelay('whatsapp', snapshot);
