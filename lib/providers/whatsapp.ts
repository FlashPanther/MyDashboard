import path from 'node:path';
import QRCode from 'qrcode';
import whatsapp from 'whatsapp-web.js';
import type { Client as WhatsAppClient } from 'whatsapp-web.js';
import { config } from '@/dashboard.config';
import { chromePath } from '@/lib/chrome';

const { Client, LocalAuth } = whatsapp;

/** Session WhatsApp Web : a supprimer pour delier le compte. */
const SESSION_DIR = path.join(process.cwd(), '.data', 'whatsapp');

export type WhatsAppStatus = 'starting' | 'qr' | 'ready' | 'error';

export type WhatsAppChat = {
  id: string;
  name: string;
  isGroup: boolean;
  isMuted: boolean;
  /** 0 quand la conversation a seulement ete marquee « non lue » a la main. */
  unread: number;
  /** Auteur du dernier message dans un groupe. */
  author: string | null;
  preview: string;
  date: string | null;
  /** Conversation privee : ouverte directement. Groupe : WhatsApp Web seul. */
  url: string;
};

type State = {
  client: WhatsAppClient | null;
  status: WhatsAppStatus;
  qr: string | null;
  error: string | null;
  cache: { at: number; chats: WhatsAppChat[] } | null;
};

/**
 * Un seul Chrome pour tout le serveur. L'etat vit sur globalThis pour survivre
 * au rechargement a chaud de `next dev`, qui sinon ouvrirait un Chrome par
 * modification de fichier.
 */
const globalState = globalThis as typeof globalThis & { __whatsapp?: State };
const state: State = (globalState.__whatsapp ??= {
  client: null,
  status: 'starting',
  qr: null,
  error: null,
  cache: null,
});

/** Filet de securite : l'evenement unread_count vide le cache des qu'un compteur bouge. */
const CACHE_MS = 20_000;

function reset(status: WhatsAppStatus, error: string | null = null) {
  const client = state.client;
  state.client = null;
  state.status = status;
  state.error = error;
  state.qr = null;
  state.cache = null;
  void client?.destroy().catch(() => undefined);
}

/** Demarre le client au premier appel ; les suivants ne font rien. */
function ensureStarted() {
  if (state.client) return;

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
    deviceName: 'Tableau du jour',
    puppeteer: { headless: true, executablePath: chromePath() },
  });
  state.client = client;
  state.status = 'starting';
  state.error = null;

  client.on('qr', async (qr: string) => {
    state.status = 'qr';
    state.qr = await QRCode.toDataURL(qr, { margin: 1, width: 240 });
  });

  client.on('ready', async () => {
    state.status = 'ready';
    state.qr = null;
    // Un WhatsApp Web « en ligne » coupe les notifications du telephone.
    await client.sendPresenceUnavailable().catch(() => undefined);
  });

  // Une conversation lue ailleurs (telephone, WhatsApp Web) : la liste est perimee.
  client.on('unread_count', () => {
    state.cache = null;
  });

  client.on('auth_failure', (message: string) => reset('error', `Connexion refusée : ${message}`));

  // Deconnexion depuis le telephone : LocalAuth efface la session, et le
  // prochain appel redemarre sur un nouveau QR code.
  client.on('disconnected', () => reset('starting'));

  client.initialize().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    reset('error', `WhatsApp n'a pas démarré : ${message}`);
  });
}

/**
 * Lit les conversations non lues directement dans WhatsApp Web.
 *
 * client.getChats() charge toutes les conversations avec les membres de chaque
 * groupe, et va chercher le dernier message dans la base du navigateur : sur un
 * appareil fraichement relie, ce message n'y est pas encore et tout l'appel
 * echoue. Ici on ne touche qu'aux conversations non lues, et seulement a ce qui
 * est deja en memoire.
 */
function readUnread(now: number): WhatsAppChat[] {
  // Execute dans la page : pas de fermeture sur les variables du module.
  type Model = Record<string, any>;
  const w = window as unknown as { require: (name: string) => Model };

  const MEDIA: Record<string, string> = {
    image: 'Photo',
    video: 'Vidéo',
    ptt: 'Message vocal',
    audio: 'Audio',
    document: 'Document',
    sticker: 'Autocollant',
    location: 'Position',
    vcard: 'Contact',
    poll_creation: 'Sondage',
    revoked: 'Message supprimé',
  };

  const { toPn } = w.require('WAWebLidMigrationUtils');
  const chats: Model[] = w.require('WAWebCollections').Chat.getModelsArray();
  return chats
    .filter((chat) => chat.unreadCount !== 0 && !chat.archive)
    .map((chat) => {
      const msgs: Model[] = chat.msgs?.getModelsArray?.() ?? [];
      // Les notices de groupe (arrivees, changements de nom…) ne disent rien : on remonte.
      const last = [...msgs].reverse().find((msg) => msg.type === 'chat' || msg.type in MEDIA);
      // Pour une photo, body contient la vignette en base64 : on prend la legende.
      const preview = !last
        ? ''
        : last.type === 'chat'
          ? (last.body ?? '')
          : [MEDIA[last.type], last.caption].filter(Boolean).join(' · ');
      const isGroup = Boolean(chat.groupMetadata);
      const author = !isGroup || !last
        ? null
        : last.id?.fromMe
          ? 'Toi'
          : (last.senderObj?.name ?? last.senderObj?.pushname ?? last.notifyName ?? null);
      // WhatsApp Web n'ouvre une conversation par URL qu'a partir d'un numero :
      // les contacts caches derriere un identifiant « lid » sont ramenes au leur,
      // et les groupes, qui n'en ont pas, retombent sur la page d'accueil.
      const phone = isGroup ? null : chat.id.server === 'lid' ? toPn(chat.id) : chat.id;
      const url = /^\d{6,15}$/.test(phone?.user ?? '')
        ? `https://web.whatsapp.com/send?phone=${phone.user}`
        : 'https://web.whatsapp.com/';
      // expiration en secondes : 0 = pas en sourdine, -1 = pour toujours.
      const expiration = chat.mute?.expiration ?? 0;
      return {
        id: chat.id._serialized as string,
        name: (chat.formattedTitle ?? chat.name ?? '') as string,
        isGroup,
        isMuted: expiration === -1 || expiration * 1000 > now,
        unread: Math.max(chat.unreadCount, 0),
        author,
        preview,
        date: chat.t ? new Date(chat.t * 1000).toISOString() : null,
        url,
      };
    });
}

async function unreadChats(client: WhatsAppClient): Promise<WhatsAppChat[]> {
  if (state.cache && Date.now() - state.cache.at < CACHE_MS) return state.cache.chats;

  const page = client.pupPage;
  if (!page) throw new Error("WhatsApp Web n'est pas chargé.");
  const unread = (await page.evaluate(readUnread, Date.now()))
    .filter((chat) => config.whatsapp.includeMuted || !chat.isMuted)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  state.cache = { at: Date.now(), chats: unread };
  return unread;
}

export async function whatsappSnapshot() {
  ensureStarted();

  if (state.status !== 'ready' || !state.client) {
    return { status: state.status, qr: state.qr, error: state.error };
  }

  const chats = await unreadChats(state.client);
  return {
    status: state.status,
    /** Conversations avec des non lus, marquees « non lues » comprises. */
    conversations: chats.length,
    messages: chats.reduce((sum, chat) => sum + chat.unread, 0),
    chats,
    fetchedAt: new Date().toISOString(),
  };
}
