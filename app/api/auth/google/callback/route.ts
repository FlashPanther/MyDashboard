import { NextResponse, type NextRequest } from 'next/server';
import { exchangeCode } from '@/lib/google/oauth';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const denied = request.nextUrl.searchParams.get('error');
  const home = new URL('/', request.nextUrl.origin);

  if (denied) {
    home.searchParams.set('auth', 'refuse');
    return NextResponse.redirect(home);
  }
  if (!code) {
    home.searchParams.set('auth', 'incomplet');
    return NextResponse.redirect(home);
  }

  try {
    await exchangeCode(code);
    home.searchParams.set('auth', 'ok');
  } catch (error) {
    home.searchParams.set('auth', 'echec');
    home.searchParams.set('detail', error instanceof Error ? error.message : 'Erreur inconnue');
  }
  return NextResponse.redirect(home);
}
