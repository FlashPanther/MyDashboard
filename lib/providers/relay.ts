/**
 * Ni Messenger ni WhatsApp n'ont d'API pour les comptes personnels, et un
 * Chrome pilote se fait reperer. Une petite extension (extension/tableau) lit
 * donc la liste des discussions dans les onglets messenger.com et
 * web.whatsapp.com du Chrome de tous les jours, et la pousse ici. Rien n'est
 * stocke sur disque.
 */

export type Source = 'messenger' | 'whatsapp';

/** Ce que l'extension voit de son cote. */
export type ExtensionState =
  | 'ready'
  /** Onglet ouvert, mais sur la page de connexion (ou le QR code de WhatsApp). */
  | 'login'
  /** Aucun onglet ouvert. */
  | 'noTab'
  /** Onglet mis en veille par Chrome (economiseur de memoire). */
  | 'sleeping';

export type FeedStatus =
  | ExtensionState
  /** L'extension ne s'est jamais manifestee depuis le demarrage du serveur. */
  | 'waiting'
  /** Plus de nouvelles : Chrome ferme, ou extension desactivee. */
  | 'stale';

export type FeedChat = {
  id: string;
  name: string;
  /** Auteur du dernier message, dans un groupe. */
  author: string | null;
  preview: string;
  /** Tel qu'affiche par la page (« 3 min », « hier », « 14:32 ») : pas de date exacte. */
  when: string;
  /** Nombre de messages non lus, quand la page le donne. */
  unread: number | null;
  muted: boolean;
  url: string;
};

export type FeedSnapshot = {
  status: FeedStatus;
  /** Total annonce par la page, discussions pas encore chargees comprises. */
  conversations: number;
  chats: FeedChat[];
  receivedAt: string | null;
};

type Report = { state: ExtensionState; chats: FeedChat[]; total: number; at: number };

/** Liens qu'une discussion peut porter : rien d'autre que la messagerie elle-meme. */
const HOSTS: Record<Source, string[]> = {
  messenger: ['www.messenger.com', 'www.facebook.com'],
  whatsapp: ['web.whatsapp.com'],
};

/** L'extension envoie toutes les 20 s ; Chrome ralentit un onglet cache a une fois par minute. */
export const STALE_MS = 3 * 60_000;
const STATES: ExtensionState[] = ['ready', 'login', 'noTab', 'sleeping'];

/** Survit au rechargement a chaud de `next dev`. */
const globalState = globalThis as typeof globalThis & {
  __relay?: Partial<Record<Source, Report>>;
};
const store = (globalState.__relay ??= {});

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/**
 * N'importe qui peut viser cette route : on ne garde que du texte, et des liens
 * vers la messagerie concernee (pas de javascript:, pas de site tiers).
 */
function sanitizeChat(source: Source, raw: unknown): FeedChat | null {
  if (!raw || typeof raw !== 'object') return null;
  const chat = raw as Record<string, unknown>;
  let url: URL;
  try {
    url = new URL(text(chat.url, 500));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !HOSTS[source].includes(url.hostname)) return null;
  const name = text(chat.name, 200);
  if (!name) return null;
  const unread = Number.isInteger(chat.unread) ? Math.min(Math.max(chat.unread as number, 0), 9999) : null;
  return {
    id: text(chat.id, 200) || url.pathname,
    name,
    author: text(chat.author, 200) || null,
    preview: text(chat.preview, 500),
    when: text(chat.when, 40),
    unread,
    muted: chat.muted === true,
    url: url.toString(),
  };
}

export function receiveReport(source: Source, body: unknown, now = Date.now()) {
  const raw = (body ?? {}) as Record<string, unknown>;
  const state = STATES.find((candidate) => candidate === raw.state);
  if (!state) throw new Error('État inconnu');
  const chats = Array.isArray(raw.chats)
    ? raw.chats
        .slice(0, 200)
        .map((chat) => sanitizeChat(source, chat))
        .filter((chat): chat is FeedChat => chat !== null)
    : [];
  const total = Number.isInteger(raw.total) ? Math.min(Math.max(raw.total as number, 0), 9999) : 0;
  store[source] = { state, chats, total: Math.max(total, chats.length), at: now };
}

export function feedSnapshot(source: Source, now = Date.now()): FeedSnapshot {
  const last = store[source];
  const status: FeedStatus = !last ? 'waiting' : now - last.at > STALE_MS ? 'stale' : last.state;
  return {
    status,
    conversations: last?.total ?? 0,
    /** La derniere liste reste affichee, estompee, quand elle n'est plus a jour. */
    chats: last?.chats ?? [],
    receivedAt: last ? new Date(last.at).toISOString() : null,
  };
}

/** Pour les tests. */
export function resetFeeds() {
  for (const source of Object.keys(store) as Source[]) delete store[source];
}
