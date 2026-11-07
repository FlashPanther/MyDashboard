import { NextResponse } from 'next/server';
import { ApiDisabledError, NotConnectedError, ScopeMissingError } from '@/lib/google/oauth';

export type ApiError = {
  error: string;
  notConnected?: boolean;
  scopeMissing?: boolean;
  apiDisabled?: boolean;
  service?: string | null;
  activationUrl?: string | null;
};

/** JSON exige : une page web ne peut pas en envoyer sans une verification CORS a laquelle on ne repond pas. */
export function requireJson(request: Request) {
  if (request.headers.get('content-type')?.startsWith('application/json')) return null;
  return NextResponse.json({ error: 'JSON attendu' }, { status: 415 });
}

/** Enveloppe une route : toute erreur devient une reponse JSON lisible par le widget. */
export async function handle<T>(fn: () => Promise<T>) {
  try {
    return NextResponse.json(await fn());
  } catch (error) {
    if (error instanceof NotConnectedError) {
      return NextResponse.json<ApiError>({ error: error.message, notConnected: true }, { status: 401 });
    }
    if (error instanceof ScopeMissingError) {
      return NextResponse.json<ApiError>({ error: error.message, scopeMissing: true }, { status: 403 });
    }
    if (error instanceof ApiDisabledError) {
      return NextResponse.json<ApiError>(
        {
          error: error.message,
          apiDisabled: true,
          service: error.service,
          activationUrl: error.activationUrl,
        },
        { status: 403 },
      );
    }
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return NextResponse.json<ApiError>({ error: message }, { status: 502 });
  }
}
