import { after, NextResponse } from 'next/server';
import { syncSoon } from '@/lib/mindmap/background';
import { handle, requireJson } from '@/lib/api';
import { readMapBody } from '@/lib/mindmap/request';
import { readMap, saveMap, trashMap } from '@/lib/mindmap/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const missing = () => NextResponse.json({ error: 'Carte introuvable' }, { status: 404 });

export async function GET(_request: Request, { params }: Context) {
  return handle(async () => (await readMap((await params).id)) ?? missing());
}

export async function PUT(request: Request, { params }: Context) {
  return (
    requireJson(request) ??
    handle(async () => {
      const body = await readMapBody(request);
      if ('error' in body) return NextResponse.json({ error: body.error }, { status: body.status });
      if (body.revision === null) return NextResponse.json({ error: 'Révision attendue' }, { status: 400 });
      const result = await saveMap((await params).id, body.root, body.revision, { forget: body.forget, adopt: body.adopt });
      if (!result) return missing();
      if (!result.saved) {
        return NextResponse.json({ error: 'Carte modifiée ailleurs', current: result.map }, { status: 409 });
      }
      after(() => syncSoon(result.map.id));
      return { revision: result.map.revision, updatedAt: result.map.updatedAt };
    })
  );
}

export async function DELETE(request: Request, { params }: Context) {
  return requireJson(request) ?? handle(async () => ((await trashMap((await params).id)) ? { ok: true } : missing()));
}
