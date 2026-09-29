import { NextResponse, type NextRequest } from 'next/server';
import { safeEqual } from '@/lib/auth/session';
import { exchangeCode, STATE_COOKIE, STATE_COOKIE_PATH } from '@/lib/google/oauth';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');

  if (params.get('error')) return back('refuse');
  if (!code) return back('incomplet');

  // Le retour doit repondre a une demande partie d'ici, dans ce navigateur.
  const expected = request.cookies.get(STATE_COOKIE)?.value;
  if (!expected || !safeEqual(params.get('state') ?? '', expected)) {
    return back('echec', 'Demande de liaison inconnue : relance « Relier Google » depuis le tableau.');
  }

  try {
    await exchangeCode(code);
    return back('ok');
  } catch (error) {
    return back('echec', error instanceof Error ? error.message : 'Erreur inconnue');
  }
}

/**
 * Retour au tableau avec le resultat, par une adresse relative : derriere le
 * proxy de Coolify, l'origine vue par le serveur n'est pas celle du navigateur.
 */
function back(auth: string, detail?: string) {
  const params = new URLSearchParams({ auth });
  if (detail) params.set('detail', detail);
  const response = new NextResponse(null, { status: 307, headers: { location: `/?${params}` } });
  response.cookies.delete({ name: STATE_COOKIE, path: STATE_COOKIE_PATH });
  return response;
}
