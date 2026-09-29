import { NextResponse } from 'next/server';
import { handle, type ApiError } from '@/lib/api';
import { feedSnapshot, receiveReport, type Source } from '@/lib/providers/relay';

const MAX_BODY = 256 * 1024;

/** GET : ce que l'extension a pousse en dernier. */
export function relayGet(source: Source) {
  return handle(async () => feedSnapshot(source));
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
    return NextResponse.json<ApiError>({ error: 'Réservé à l’extension du tableau' }, { status: 403 });
  }
  // Une liste de discussions pese quelques ko : au-dela, ce n'est pas l'extension.
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) {
    return NextResponse.json<ApiError>({ error: 'Rapport trop volumineux' }, { status: 413 });
  }
  const body = await request.json().catch(() => undefined);
  if (body === undefined) return NextResponse.json<ApiError>({ error: 'JSON illisible' }, { status: 400 });
  return handle(async () => {
    receiveReport(source, body);
    return { ok: true };
  });
}
