import { useEffect, useState } from 'react';
import { writeJson } from '@/components/mindmap/writeJson';
import type { MapNode } from '@/lib/mindmap/tree';

const QUIET_MS = 1500;
const RETRY_MS = 30_000;

export type TaskSync = 'ok' | 'unlinked' | 'failed';

export function useTaskSync(id: string, saved: boolean, root: MapNode): TaskSync {
  const [state, setState] = useState<TaskSync>('ok');

  useEffect(() => {
    if (!saved) return;
    let stale = false;
    const timer = setTimeout(
      async () => {
        const { status, body } = await writeJson(`/api/cartes/${id}/taches`, 'POST');
        if (stale) return;
        const unlinked = Boolean((body as { notConnected?: boolean } | null)?.notConnected);
        setState(status === 200 ? 'ok' : unlinked ? 'unlinked' : 'failed');
      },
      state === 'ok' ? QUIET_MS : RETRY_MS,
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [id, saved, root, state]);

  return state;
}
