/**
 * Messenger n'a pas d'API pour les comptes personnels, et un Chrome pilote se
 * fait reperer par Facebook. Une petite extension (extension/messenger) lit
 * donc la liste des discussions dans l'onglet messenger.com du Chrome de tous
 * les jours, et la pousse ici. Rien n'est stocke sur disque.
 */

/** Ce que l'extension voit de son cote. */
export type ExtensionState =
  | 'ready'
  /** Onglet ouvert, mais sur la page de connexion. */
  | 'login'
  /** Aucun onglet messenger.com ouvert. */
  | 'noTab'
  /** Onglet mis en veille par Chrome (economiseur de memoire). */
  | 'sleeping';

export type MessengerStatus =
  | ExtensionState
  /** L'extension ne s'est jamais manifestee depuis le demarrage du serveur. */
  | 'waiting'
  /** Plus de nouvelles : Chrome ferme, ou extension desactivee. */
  | 'stale';

export type MessengerChat = {
  id: string;
  name: string;
  preview: string;
  /** Tel qu'affiche par Messenger (« 3 min », « lun. ») : pas de date exacte dans la page. */
  when: string;
  url: string;
};

type Report = {
  state: ExtensionState;
  chats: MessengerChat[];
  /** Total annonce par Messenger, discussions pas encore chargees dans la page comprises. */
  total: number;
  at: number;
};

const globalState = globalThis as typeof globalThis & { __messenger?: { last: Report | null } };
const store = (globalState.__messenger ??= { last: null });

/** L'extension envoie toutes les 20 s ; Chrome ralentit un onglet cache a une fois par minute. */
const STALE_MS = 3 * 60_000;
const STATES: ExtensionState[] = ['ready', 'login', 'noTab', 'sleeping'];
const MESSENGER_HOSTS = ['www.messenger.com', 'www.facebook.com'];

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/** N'importe quelle page ouverte sur ce poste peut viser localhost : on ne garde que du texte et des liens Messenger. */
function sanitizeChat(raw: unknown): MessengerChat | null {
  if (!raw || typeof raw !== 'object') return null;
  const chat = raw as Record<string, unknown>;
  let url: URL;
  try {
    url = new URL(text(chat.url, 500));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !MESSENGER_HOSTS.includes(url.hostname)) return null;
  const name = text(chat.name, 200);
  if (!name) return null;
  return {
    id: text(chat.id, 100) || url.pathname,
    name,
    preview: text(chat.preview, 500),
    when: text(chat.when, 40),
    url: url.toString(),
  };
}

export function receiveReport(body: unknown) {
  const raw = (body ?? {}) as Record<string, unknown>;
  const state = STATES.find((candidate) => candidate === raw.state);
  if (!state) throw new Error('État inconnu');
  const chats = Array.isArray(raw.chats)
    ? raw.chats
        .slice(0, 200)
        .map(sanitizeChat)
        .filter((chat): chat is MessengerChat => chat !== null)
    : [];
  const total = Number.isInteger(raw.total) ? Math.min(Math.max(raw.total as number, 0), 999) : 0;
  store.last = { state, chats, total: Math.max(total, chats.length), at: Date.now() };
}

export function messengerSnapshot() {
  const last = store.last;
  const status: MessengerStatus = !last
    ? 'waiting'
    : Date.now() - last.at > STALE_MS
      ? 'stale'
      : last.state;
  return {
    status,
    /** La derniere liste reste affichee, grisee, quand elle n'est plus a jour. */
    conversations: last?.total ?? 0,
    chats: last?.chats ?? [],
    receivedAt: last ? new Date(last.at).toISOString() : null,
  };
}
