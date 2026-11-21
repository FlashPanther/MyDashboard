import { NextResponse } from 'next/server';
import { config } from '@/dashboard.config';
import { handle, requireJson } from '@/lib/api';
import { googleFetch } from '@/lib/google/oauth';
import { annotate } from '@/lib/mindmap/store';
import { syncTasks } from '@/lib/mindmap/taskSync';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const missing = () => NextResponse.json({ error: 'Carte introuvable' }, { status: 404 });

export async function POST(request: Request, { params }: Context) {
  return (
    requireJson(request) ??
    handle(async () => (await syncTasks((await params).id, config.mindmap.taskList, googleFetch)) ?? missing())
  );
}

export async function PUT(request: Request, { params }: Context) {
  return (
    requireJson(request) ??
    handle(async () => {
      const { enabled } = (await request.json().catch(() => ({}))) as { enabled?: unknown };
      if (typeof enabled !== 'boolean') return NextResponse.json({ error: 'Choix attendu' }, { status: 400 });
      const { id } = await params;
      if (!(await annotate(id, () => ({ sendTasks: enabled })))) return missing();
      return (await syncTasks(id, config.mindmap.taskList, googleFetch)) ?? missing();
    })
  );
}
