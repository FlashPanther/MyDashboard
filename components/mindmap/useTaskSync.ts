import { useCallback, useEffect, useRef, useState } from 'react';
import { writeJson } from '@/components/mindmap/writeJson';
import type { MapNode, RemoteChange } from '@/lib/mindmap/tree';

const QUIET_MS = 1500;
const RETRY_MS = 30_000;
const RETRY_MAX_MS = 300_000;
const POLL_MS = 60_000;

export type TaskSync = { state: 'ok' | 'unlinked' | 'failed'; enabled: boolean; waiting: number; lost: number; linked: string[] };

export function useTaskSync(id: string, saved: boolean, root: MapNode, pull: (changes: RemoteChange[]) => void) {
  const [sync, setSync] = useState<TaskSync>({ state: 'ok', enabled: false, waiting: 0, lost: 0, linked: [] });
  const [round, setRound] = useState(0);
  const failures = useRef(0);

  const apply = useCallback(({ status, body }: { status: number; body: unknown }, withPulls = true) => {
    const answer = (body ?? {}) as {
      enabled?: boolean;
      waiting?: number;
      lost?: number;
      linked?: string[];
      pulls?: RemoteChange[];
      notConnected?: boolean;
    };
    if (status === 200) {
      failures.current = 0;
      const next = {
        state: 'ok' as const,
        enabled: answer.enabled === true,
        waiting: answer.waiting ?? 0,
        lost: answer.lost ?? 0,
        linked: answer.linked ?? [],
      };
      setSync(next);
      if (withPulls && answer.pulls?.length) pull(answer.pulls);
      if (next.enabled && next.waiting > 0) setRound((count) => count + 1);
    } else {
      failures.current += 1;
      setSync((current) => ({ ...current, state: answer.notConnected ? 'unlinked' : 'failed' }));
      setRound((count) => count + 1);
    }
  }, [pull]);

  // Une tâche cochée dans Google pendant que la carte est ouverte doit finir par s'y voir.
  useEffect(() => {
    if (!sync.enabled) return;
    const timer = setInterval(() => document.visibilityState === 'visible' && setRound((count) => count + 1), POLL_MS);
    return () => clearInterval(timer);
  }, [sync.enabled]);

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
      // La carte a pu changer pendant la requête : ce qui vient de Google reviendra au passage suivant, sur la carte à jour.
      apply(await writeJson(`/api/cartes/${id}/taches`, 'PUT', { enabled }), false);
    },
    [id, apply],
  );

  /** Demande au serveur de supprimer aussi chez Google la tâche de ce nœud, une fois le nœud retiré. */
  const forget = useCallback(async (nodeId: string) => (await writeJson(`/api/cartes/${id}/taches`, 'PUT', { forget: nodeId })).status === 200, [id]);

  return { sync, toggle, forget };
}
