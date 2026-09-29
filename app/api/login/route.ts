import { NextResponse } from 'next/server';
import { clearFailures, isBlocked, recordFailure } from '@/lib/auth/limiter';
import { clientIp, createSession, safeEqual, SESSION_COOKIE, SESSION_DAYS } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const password = process.env.DASHBOARD_PASSWORD;
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
  response.cookies.set(SESSION_COOKIE, createSession(password), {
    httpOnly: true,
    // Lax : le retour de Google (redirection de premier niveau) garde la session.
    sameSite: 'lax',
    secure: request.headers.get('x-forwarded-proto') === 'https' || request.url.startsWith('https:'),
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
  return response;
}
