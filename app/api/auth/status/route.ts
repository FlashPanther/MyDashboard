import { NextResponse } from 'next/server';
import { connectionOf } from '@/lib/google/connection';
import { readTokens } from '@/lib/google/tokens';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    ...connectionOf(await readTokens()),
  });
}
