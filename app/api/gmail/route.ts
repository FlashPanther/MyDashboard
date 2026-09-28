import { handle } from '@/lib/api';
import { googleFetch } from '@/lib/google/oauth';
import { config } from '@/dashboard.config';

export const dynamic = 'force-dynamic';

/** 10 pages de 500 : au-delà, le chiffre exact n'apprend plus rien. */
const MAX_PAGES = 10;

export type MailItem = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string | null;
  important: boolean;
  unread: boolean;
  url: string;
};

type GmailMessage = {
  id: string;
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
};

/** "Marc Dupont <marc@exemple.be>" -> "Marc Dupont" */
function senderName(raw: string): string {
  const match = raw.match(/^\s*"?([^"<]*?)"?\s*<.*>\s*$/);
  const name = match?.[1]?.trim();
  if (name) return name;
  return raw.replace(/[<>]/g, '').split('@')[0];
}

/**
 * Tous les identifiants d'une recherche : 500 par page, le compte est exact
 * sans rien telecharger d'autre. Au-dela de MAX_PAGES, on s'arrete et on
 * affiche « + ».
 */
async function listIds(query: string) {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const listParams = new URLSearchParams({ q: query, maxResults: '500' });
    if (pageToken) listParams.set('pageToken', pageToken);
    const list = await googleFetch<{ messages?: { id: string }[]; nextPageToken?: string }>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams}`,
    );
    ids.push(...(list.messages ?? []).map((message) => message.id));
    pageToken = list.nextPageToken;
    if (!pageToken) break;
  }
  return { ids, truncated: Boolean(pageToken) };
}

/** En-tetes d'un message ; `view` est la vue Gmail ouverte au clic (#inbox, #starred). */
async function readMessage(id: string, view: string): Promise<MailItem> {
  const params = new URLSearchParams({ format: 'metadata' });
  params.append('metadataHeaders', 'From');
  params.append('metadataHeaders', 'Subject');
  const message = await googleFetch<GmailMessage>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?${params}`,
  );
  const header = (name: string) =>
    message.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? '';
  return {
    id,
    from: senderName(header('from')),
    subject: header('subject') || '(sans objet)',
    snippet: (message.snippet ?? '')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&'),
    date: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null,
    important: Boolean(message.labelIds?.includes('IMPORTANT')),
    unread: Boolean(message.labelIds?.includes('UNREAD')),
    url: `https://mail.google.com/mail/u/0/#${view}/${id}`,
  };
}

export async function GET() {
  return handle(async () => {
    const [unread, starred] = await Promise.all([
      listIds(config.gmail.query),
      listIds(config.gmail.starred.query),
    ]);

    const [messages, starredMessages] = await Promise.all([
      Promise.all(unread.ids.slice(0, config.gmail.maxResults).map((id) => readMessage(id, 'inbox'))),
      Promise.all(
        starred.ids.slice(0, config.gmail.starred.maxResults).map((id) => readMessage(id, 'starred')),
      ),
    ]);

    return {
      unread: unread.ids.length,
      /** Vrai au-delà de MAX_PAGES pages : on affiche « 5000+ ». */
      truncated: unread.truncated,
      messages,
      /** Les mails suivis (étoilés), lus ou non. */
      starred: { count: starred.ids.length, truncated: starred.truncated, messages: starredMessages },
      fetchedAt: new Date().toISOString(),
    };
  });
}
