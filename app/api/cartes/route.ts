import { NextResponse } from 'next/server';
import { handle, requireJson } from '@/lib/api';
import { readMapBody } from '@/lib/mindmap/request';
import { createMap, listMaps } from '@/lib/mindmap/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => ({ maps: await listMaps() }));
}

export async function POST(request: Request) {
  return (
    requireJson(request) ??
    handle(async () => {
      const body = await readMapBody(request);
      if ('error' in body) return NextResponse.json({ error: body.error }, { status: body.status });
      const created = await createMap(body.root);
      if (!created) return NextResponse.json({ error: 'Trop de cartes : supprimes-en avant d’en créer une autre' }, { status: 507 });
      return { id: created.id, revision: created.revision, updatedAt: created.updatedAt };
    })
  );
}
