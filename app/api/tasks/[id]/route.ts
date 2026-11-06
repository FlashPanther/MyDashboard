import { NextResponse } from 'next/server';
import { handle } from '@/lib/api';
import { googleFetch } from '@/lib/google/oauth';
import { parseTaskChange, taskChangeRequest } from '@/lib/google/taskWrites';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'JSON attendu' }, { status: 415 });
  }
  const change = parseTaskChange(await request.json().catch(() => null));
  if (!change) return NextResponse.json({ error: 'Changement invalide' }, { status: 400 });

  const { id } = await params;
  return handle(async () => {
    const { url, init } = taskChangeRequest(id, change);
    await googleFetch(url, init);
    return { ok: true };
  });
}
