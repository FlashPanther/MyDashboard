/**
 * Ni Messenger ni WhatsApp n'ont d'API pour les comptes personnels, et un
 * Chrome pilote se fait reperer. Une petite extension (extension/tableau) lit
 * donc la liste des discussions dans les onglets messenger.com et
 * web.whatsapp.com du Chrome de tous les jours, et la pousse ici. Rien n'est
 * stocke sur disque.
 */

/** Une route /api/<source> par messagerie. */
export const SOURCES = ['messenger', 'whatsapp'] as const;
export type Source = (typeof SOURCES)[number];

/**
 * Ce que l'extension voit de son cote, du plus au moins utile (c'est l'ordre
 * de priorite quand plusieurs Chrome rapportent) : liste lue, onglet sur la
 * page de connexion (ou le QR code de WhatsApp), onglet mis en veille par
 * Chrome (economiseur de memoire), aucun onglet ouvert.
 */
const STATES = ['ready', 'login', 'sleeping', 'noTab'] as const;
type ExtensionState = (typeof STATES)[number];

type FeedStatus =
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

/**
 * Par messagerie, le dernier rapport de chaque emetteur : une installation de
 * l'extension (un Chrome, sur un PC), puis l'onglet d'ou vient le rapport, ou
 * « * » pour le controle d'onglets de l'alarme, qui vaut pour tout ce Chrome.
 * Sur globalThis pour survivre au rechargement a chaud de `next dev`.
 */
type Reports = Map<string, Map<number | '*', Report>>;
const globalState = globalThis as typeof globalThis & { __relay?: Partial<Record<Source, Reports>> };
const store = (globalState.__relay ??= {});

function reportsOf(source: Source): Reports {
  return (store[source] ??= new Map());
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/** Un compteur venu de la page : entier, borne, ou null s'il manque. */
function count(value: unknown): number | null {
  return Number.isInteger(value) ? Math.min(Math.max(value as number, 0), 9999) : null;
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
  return {
    id: text(chat.id, 200) || url.pathname,
    name,
    author: text(chat.author, 200) || null,
    preview: text(chat.preview, 500),
    when: text(chat.when, 40),
    unread: count(chat.unread),
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

  // Une extension anterieure a l'identifiant compte comme un seul Chrome.
  const instance = text(raw.instance, 64) || 'extension';
  const tab = Number.isSafeInteger(raw.tab) ? (raw.tab as number) : null;
  // Jamais moins que la liste recue : le total de la page peut etre en retard.
  const report = { state, chats, total: Math.max(count(raw.total) ?? 0, chats.length), at: now };

  const reports = reportsOf(source);
  // Le controle d'onglets (alarme) repart de zero pour ce Chrome : un onglet
  // ferme ne laisse pas sa liste derriere lui.
  const tabs = tab === null ? new Map() : (reports.get(instance) ?? new Map());
  reports.set(instance, tabs.set(tab ?? '*', report));
  // On oublie les Chrome qui se sont tus.
  for (const [chrome, byTab] of reports) {
    if ([...byTab.values()].every((old) => now - old.at > STALE_MS)) reports.delete(chrome);
  }
}

/**
 * Plusieurs Chrome peuvent rapporter pour une meme messagerie : on montre le
 * meilleur rapport encore frais (une liste avant une explication, le plus
 * recent a egalite). Sans rapport frais, le dernier recu, marque « stale ».
 */
export function feedSnapshot(source: Source, now = Date.now()): FeedSnapshot {
  const all = [...(store[source]?.values() ?? [])].flatMap((byTab) => [...byTab.values()]);
  const rank = (report: Report) => STATES.indexOf(report.state);
  const [best] = all
    .filter((report) => now - report.at <= STALE_MS)
    .sort((a, b) => rank(a) - rank(b) || b.at - a.at);
  const latest = all.reduce<Report | undefined>((last, report) => (last && last.at >= report.at ? last : report), undefined);
  const shown = best ?? latest;
  const status: FeedStatus = best ? best.state : shown ? 'stale' : 'waiting';
  return {
    status,
    conversations: shown?.total ?? 0,
    /** La derniere liste reste affichee, estompee, quand elle n'est plus a jour. */
    chats: shown?.chats ?? [],
    receivedAt: shown ? new Date(shown.at).toISOString() : null,
  };
}

/** Pour les tests. */
export function resetFeeds() {
  for (const source of Object.keys(store) as Source[]) store[source]?.clear();
}
