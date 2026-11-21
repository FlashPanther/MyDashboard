import { NextResponse } from 'next/server';
import { config } from '@/dashboard.config';
import { handle, requireJson } from '@/lib/api';
import { googleFetch } from '@/lib/google/oauth';
import { syncTasks } from '@/lib/mindmap/taskSync';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return (
    requireJson(request) ??
    handle(async () => {
      const result = await syncTasks((await params).id, config.mindmap.taskList, googleFetch);
      return result ?? NextResponse.json({ error: 'Carte introuvable' }, { status: 404 });
    })
  );
}
