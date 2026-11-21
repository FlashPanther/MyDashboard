import { NextResponse } from 'next/server';
import { handle, requireJson } from '@/lib/api';
import { annotate } from '@/lib/mindmap/store';
import { syncMapTasks } from '@/lib/mindmap/background';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const missing = () => NextResponse.json({ error: 'Carte introuvable' }, { status: 404 });

export async function POST(request: Request, { params }: Context) {
  return (
    requireJson(request) ??
    handle(async () => (await syncMapTasks((await params).id)) ?? missing())
  );
}

export async function PUT(request: Request, { params }: Context) {
  return (
    requireJson(request) ??
    handle(async () => {
      const { enabled } = (await request.json().catch(() => ({}))) as { enabled?: unknown };
      const { id } = await params;
      if (typeof enabled !== 'boolean') return NextResponse.json({ error: 'Choix attendu' }, { status: 400 });
      if (!(await annotate(id, () => ({ sendTasks: enabled })))) return missing();
      return (await syncMapTasks(id)) ?? missing();
    })
  );
}
