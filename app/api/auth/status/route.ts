import { NextResponse } from 'next/server';
import { readTokens } from '@/lib/google/tokens';

export async function GET() {
  const tokens = await readTokens();
  return NextResponse.json({
    configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    connected: Boolean(tokens?.refresh_token),
  });
}
