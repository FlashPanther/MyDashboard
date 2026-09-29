import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookieOptions } from '@/lib/auth/session';
import { buildAuthUrl, STATE_COOKIE, STATE_COOKIE_PATH } from '@/lib/google/oauth';

export async function GET(request: Request) {
  try {
    // Sans ce jeton, une page tierce pourrait faire aboutir au retour de Google
    // l'autorisation d'un autre compte, qui remplacerait le tien.
    const state = randomBytes(24).toString('base64url');
    const response = NextResponse.redirect(buildAuthUrl(state));
    response.cookies.set(STATE_COOKIE, state, cookieOptions(request, STATE_COOKIE_PATH, 10 * 60));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return new NextResponse(message, { status: 500 });
  }
}
