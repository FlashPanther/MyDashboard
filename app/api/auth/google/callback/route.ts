import { NextResponse, type NextRequest } from 'next/server';
import { safeEqual } from '@/lib/auth/session';
import { exchangeCode, STATE_COOKIE } from '@/lib/google/oauth';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const denied = request.nextUrl.searchParams.get('error');
  // Adresse relative : derriere le proxy de Coolify, l'origine vue par le
  // serveur n'est pas celle du navigateur.
  const home = new URLSearchParams();

  if (denied) {
    home.set('auth', 'refuse');
    return back(home);
  }
  if (!code) {
    home.set('auth', 'incomplet');
    return back(home);
  }
  // Le retour doit repondre a une demande partie d'ici, dans ce navigateur.
  const expected = request.cookies.get(STATE_COOKIE)?.value;
  const state = request.nextUrl.searchParams.get('state') ?? '';
  if (!expected || !safeEqual(state, expected)) {
    home.set('auth', 'echec');
    home.set('detail', 'Demande de liaison inconnue : relance « Relier Google » depuis le tableau.');
    return back(home);
  }

  try {
    await exchangeCode(code);
    home.set('auth', 'ok');
  } catch (error) {
    home.set('auth', 'echec');
    home.set('detail', error instanceof Error ? error.message : 'Erreur inconnue');
  }
  return back(home);
}

function back(params: URLSearchParams) {
  const response = new NextResponse(null, { status: 307, headers: { location: `/?${params}` } });
  response.cookies.delete({ name: STATE_COOKIE, path: '/api/auth/google' });
  return response;
}
