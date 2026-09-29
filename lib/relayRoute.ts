import { NextResponse } from 'next/server';
import { handle, type ApiError } from '@/lib/api';
import { extensionRefusal } from '@/lib/auth/session';
import { feedSnapshot, receiveReport, type Source } from '@/lib/providers/relay';

const MAX_BODY = 256 * 1024;

/** GET : ce que l'extension a pousse en dernier. */
export function relayGet(source: Source) {
  return handle(async () => feedSnapshot(source));
}

/** POST : rapport de l'extension. Qui peut l'envoyer : voir extensionRefusal. */
export async function relayPost(source: Source, request: Request) {
  const refusal = extensionRefusal(
    {
      authorization: request.headers.get('authorization'),
      origin: request.headers.get('origin'),
      contentType: request.headers.get('content-type'),
    },
    { token: process.env.EXTENSION_TOKEN, password: process.env.DASHBOARD_PASSWORD },
  );
  if (refusal) return NextResponse.json<ApiError>({ error: refusal }, { status: 403 });
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
