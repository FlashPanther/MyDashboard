import { NextResponse } from 'next/server';
import { buildAuthUrl } from '@/lib/google/oauth';

export async function GET() {
  try {
    return NextResponse.redirect(buildAuthUrl());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return new NextResponse(message, { status: 500 });
  }
}
