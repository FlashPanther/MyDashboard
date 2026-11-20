import { NextResponse } from 'next/server';
import { handle, requireJson } from '@/lib/api';
import { parseMapBody } from '@/lib/mindmap/request';
import { createMap, listMaps } from '@/lib/mindmap/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => ({ maps: await listMaps() }));
}

export async function POST(request: Request) {
  const refused = requireJson(request);
  if (refused) return refused;
  const body = parseMapBody(await request.text());
  if (!body) return NextResponse.json({ error: 'Carte invalide' }, { status: 400 });
  return handle(async () => {
    const { id, revision, updatedAt } = await createMap(body.root);
    return { id, revision, updatedAt };
  });
}
