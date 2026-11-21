import { useEffect, useState } from 'react';
import { writeJson } from '@/components/mindmap/writeJson';
import type { MapNode } from '@/lib/mindmap/tree';

const QUIET_MS = 1500;

export type TaskSync = 'ok' | 'unlinked' | 'failed';

export function useTaskSync(id: string, saved: boolean, hasTasks: boolean, root: MapNode): TaskSync {
  const [state, setState] = useState<TaskSync>('ok');

  useEffect(() => {
    if (!saved || !hasTasks) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const { status, body } = await writeJson(`/api/cartes/${id}/taches`, 'POST');
      if (stale) return;
      const unlinked = Boolean((body as { notConnected?: boolean } | null)?.notConnected);
      setState(status === 200 ? 'ok' : unlinked ? 'unlinked' : 'failed');
    }, QUIET_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [id, saved, hasTasks, root]);

  return hasTasks ? state : 'ok';
}
