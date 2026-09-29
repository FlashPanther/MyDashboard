import { NextResponse, type NextRequest } from 'next/server';
import { authSettings, SESSION_COOKIE, verifySession } from '@/lib/auth/session';
import { SOURCES } from '@/lib/providers/relay';

/** Toujours ouvertes : la connexion elle-meme, et la sonde de sante de Coolify. */
const PUBLIC = new Set(['/login', '/api/login', '/api/health']);
/** Les rapports de l'extension portent leur propre jeton, verifie par la route. */
const RELAY = new Set(SOURCES.map((source) => `/api/${source}`));

export function middleware(request: NextRequest) {
  const { password } = authSettings();
  // Sans mot de passe, le tableau est en local : rien a proteger.
  if (!password) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (PUBLIC.has(pathname)) return NextResponse.next();
  if (request.method === 'POST' && RELAY.has(pathname)) return NextResponse.next();
  if (verifySession(request.cookies.get(SESSION_COOKIE)?.value, password)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Connexion requise' }, { status: 401 });
  }
  const login = request.nextUrl.clone();
  login.pathname = '/login';
  login.search = new URLSearchParams({ next: pathname + search }).toString();
  return NextResponse.redirect(login);
}

export const config = {
  // Lit DASHBOARD_PASSWORD au lancement du serveur, pas au build.
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
