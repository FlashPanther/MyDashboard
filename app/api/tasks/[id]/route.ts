import { NextResponse } from 'next/server';
import { handle, requireJson } from '@/lib/api';
import { googleFetch } from '@/lib/google/oauth';
import { parseTaskChange, taskChangeRequest } from '@/lib/google/taskWrites';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const refused = requireJson(request);
  if (refused) return refused;
  const change = parseTaskChange(await request.json().catch(() => null));
  if (!change) return NextResponse.json({ error: 'Changement invalide' }, { status: 400 });

  const { id } = await params;
  return handle(async () => {
    const { url, init } = taskChangeRequest(id, change);
    await googleFetch(url, init);
    return { ok: true };
  });
}
