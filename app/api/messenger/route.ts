import { NextResponse } from 'next/server';
import { handle } from '@/lib/api';
import { messengerSnapshot, receiveReport } from '@/lib/providers/messenger';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => messengerSnapshot());
}

/**
 * Rapport de l'extension. Une page web ne peut pas envoyer de JSON ici : le
 * type application/json declenche une verification CORS a laquelle on ne
 * repond pas. Seule une extension, qui a la permission sur localhost, passe.
 */
export async function POST(request: Request) {
  const origin = request.headers.get('origin') ?? '';
  const json = request.headers.get('content-type')?.startsWith('application/json');
  if (!json || !origin.startsWith('chrome-extension://')) {
    return NextResponse.json({ error: 'Réservé à l’extension Messenger' }, { status: 403 });
  }
  return handle(async () => {
    receiveReport(await request.json());
    return { ok: true };
  });
}
