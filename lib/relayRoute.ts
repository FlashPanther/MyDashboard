import { NextResponse } from 'next/server';
import { handle } from '@/lib/api';
import { feedSnapshot, receiveReport, type FeedChat, type Source } from '@/lib/providers/relay';

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
  const json = request.headers.get('content-type')?.startsWith('application/json');
  if (!json || !origin.startsWith('chrome-extension://')) {
    return NextResponse.json({ error: 'Réservé à l’extension du tableau' }, { status: 403 });
  }
  return handle(async () => {
    receiveReport(source, await request.json());
    return { ok: true };
  });
}
