import { NextResponse } from 'next/server';
import { clearFailures, isBlocked, recordFailure } from '@/lib/auth/limiter';
import {
  authSettings,
  clientIp,
  cookieOptions,
  createSession,
  safeEqual,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { password } = authSettings();
  if (!password) return NextResponse.json({ ok: true });

  const ip = clientIp(request.headers);
  if (isBlocked(ip)) {
    return NextResponse.json(
      { error: 'Trop d’essais. Réessaie dans un quart d’heure.' },
      { status: 429 },
    );
  }

  // Un mot de passe tient en quelques octets.
  if (Number(request.headers.get('content-length') ?? 0) > 4096) {
    return NextResponse.json({ error: 'Requête trop volumineuse.' }, { status: 413 });
  }
  const body = await request.json().catch(() => ({}));
  const attempt = typeof body.password === 'string' ? body.password : '';
  if (!safeEqual(attempt, password)) {
    recordFailure(ip);
    return NextResponse.json({ error: 'Mot de passe incorrect.' }, { status: 401 });
  }

  clearFailures(ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSession(password), cookieOptions(request, '/', SESSION_MAX_AGE));
  return response;
}
