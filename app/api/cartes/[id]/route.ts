import { NextResponse } from 'next/server';
import { handle, requireJson } from '@/lib/api';
import { parseMapBody } from '@/lib/mindmap/request';
import { readMap, saveMap, trashMap } from '@/lib/mindmap/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const missing = () => NextResponse.json({ error: 'Carte introuvable' }, { status: 404 });

export async function GET(_request: Request, { params }: Context) {
  const map = await readMap((await params).id);
  return map ? NextResponse.json(map) : missing();
}

export async function PUT(request: Request, { params }: Context) {
  const refused = requireJson(request);
  if (refused) return refused;
  const body = parseMapBody(await request.text());
  if (!body || body.revision === null) return NextResponse.json({ error: 'Carte invalide' }, { status: 400 });
  const result = await saveMap((await params).id, body.root, body.revision);
  if ('missing' in result) return missing();
  if ('conflict' in result) {
    return NextResponse.json({ error: 'Carte modifiée ailleurs', current: result.conflict }, { status: 409 });
  }
  const { revision, updatedAt } = result.saved;
  return NextResponse.json({ revision, updatedAt });
}

export async function DELETE(request: Request, { params }: Context) {
  const refused = requireJson(request);
  if (refused) return refused;
  return (await trashMap((await params).id)) ? handle(async () => ({ ok: true })) : missing();
}
