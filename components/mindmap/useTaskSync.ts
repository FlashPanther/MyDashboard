import { useCallback, useEffect, useRef, useState } from 'react';
import { writeJson } from '@/components/mindmap/writeJson';
import type { MapNode } from '@/lib/mindmap/tree';

const QUIET_MS = 1500;
const RETRY_MS = 30_000;
const RETRY_MAX_MS = 300_000;

export type TaskSync = { state: 'ok' | 'unlinked' | 'failed'; enabled: boolean; waiting: number; lost: number };

export function useTaskSync(id: string, saved: boolean, root: MapNode) {
  const [sync, setSync] = useState<TaskSync>({ state: 'ok', enabled: false, waiting: 0, lost: 0 });
  const [round, setRound] = useState(0);
  const failures = useRef(0);

  const apply = useCallback(({ status, body }: { status: number; body: unknown }) => {
    const answer = (body ?? {}) as { enabled?: boolean; waiting?: number; lost?: number; notConnected?: boolean };
    if (status === 200) {
      failures.current = 0;
      const next = { state: 'ok' as const, enabled: answer.enabled === true, waiting: answer.waiting ?? 0, lost: answer.lost ?? 0 };
      setSync(next);
      if (next.enabled && next.waiting > 0) setRound((count) => count + 1);
    } else {
      failures.current += 1;
      setSync((current) => ({ ...current, state: answer.notConnected ? 'unlinked' : 'failed' }));
      setRound((count) => count + 1);
    }
  }, []);

  useEffect(() => {
    if (!saved) return;
    let stale = false;
    const delay = failures.current ? Math.min(RETRY_MS * 2 ** (failures.current - 1), RETRY_MAX_MS) : QUIET_MS;
    const timer = setTimeout(async () => {
      const answer = await writeJson(`/api/cartes/${id}/taches`, 'POST');
      if (!stale) apply(answer);
    }, delay);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [id, saved, root, round, apply]);

  const toggle = useCallback(
    async (enabled: boolean) => {
      setSync((current) => ({ ...current, enabled }));
      apply(await writeJson(`/api/cartes/${id}/taches`, 'PUT', { enabled }));
    },
    [id, apply],
  );

  return { sync, toggle };
}
