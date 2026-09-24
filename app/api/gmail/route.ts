import { handle } from '@/lib/api';
import { googleFetch } from '@/lib/google/oauth';
import { config } from '@/dashboard.config';

export const dynamic = 'force-dynamic';

export type MailItem = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string | null;
  important: boolean;
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

export async function GET() {
  return handle(async () => {
    const listParams = new URLSearchParams({ q: config.gmail.query, maxResults: '25' });
    const list = await googleFetch<{ messages?: { id: string }[]; nextPageToken?: string }>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams}`,
    );

    const ids = list.messages ?? [];
    const preview = ids.slice(0, config.gmail.maxResults);

    const messages = await Promise.all(
      preview.map(async ({ id }) => {
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
          url: `https://mail.google.com/mail/u/0/#inbox/${id}`,
        } satisfies MailItem;
      }),
    );

    return {
      unread: ids.length,
      /** Vrai si la boîte dépasse la page demandée : on affiche « 25+ ». */
      truncated: Boolean(list.nextPageToken),
      messages,
      fetchedAt: new Date().toISOString(),
    };
  });
}
