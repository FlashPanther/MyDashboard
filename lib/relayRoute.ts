import { NextResponse } from 'next/server';
import { handle } from '@/lib/api';
import { feedSnapshot, receiveReport, type FeedChat, type Source } from '@/lib/providers/relay';

const MAX_BODY = 256 * 1024;

/** GET : ce que l'extension a pousse en dernier. `keep` filtre les discussions affichees. */
export function relayGet(source: Source, keep: (chat: FeedChat) => boolean = () => true) {
  return handle(async () => {
    const snapshot = feedSnapshot(source);
    const chats = snapshot.chats.filter(keep);
    const hidden = snapshot.chats.length - chats.length;
    return { ...snapshot, chats, conversations: Math.max(snapshot.conversations - hidden, chats.length) };
  });
}

/**
 * POST : rapport de l'extension. Une page web ne peut pas envoyer de JSON ici :
 * le type application/json declenche une verification CORS a laquelle on ne
 * repond pas. Seule une extension, qui a la permission sur ce site, passe.
 */
export async function relayPost(source: Source, request: Request) {
  const origin = request.headers.get('origin') ?? '';
  const type = request.headers.get('content-type')?.split(';')[0].trim();
  if (type !== 'application/json' || !origin.startsWith('chrome-extension://')) {
    return NextResponse.json({ error: 'Réservé à l’extension du tableau' }, { status: 403 });
  }
  // Une liste de discussions pese quelques ko : au-dela, ce n'est pas l'extension.
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) {
    return NextResponse.json({ error: 'Rapport trop volumineux' }, { status: 413 });
  }
  const body = await request.json().catch(() => undefined);
  if (body === undefined) return NextResponse.json({ error: 'JSON illisible' }, { status: 400 });
  return handle(async () => {
    receiveReport(source, body);
    return { ok: true };
  });
}
