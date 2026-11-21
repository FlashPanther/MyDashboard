import { NextResponse } from 'next/server';
import { connectionOf } from '@/lib/google/connection';
import { getAccessToken } from '@/lib/google/oauth';
import { readTokens } from '@/lib/google/tokens';

export const dynamic = 'force-dynamic';

export async function GET() {
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const linked = Boolean((await readTokens())?.refresh_token);
  const connection = await connectionOf(configured && linked, getAccessToken);
  return NextResponse.json({ configured, connected: connection === 'connected', expired: connection === 'expired' });
}
