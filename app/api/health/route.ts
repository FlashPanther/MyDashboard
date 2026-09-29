import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Sonde de sante pour Coolify : repond sans connexion, et sans rien reveler. */
export function GET() {
  return NextResponse.json({ ok: true });
}
