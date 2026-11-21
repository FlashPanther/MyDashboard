import { useCallback, useEffect, useReducer, useRef } from 'react';
import { writeJson } from '@/components/mindmap/writeJson';
import { draftKey, eventOf, sendDelay, serializeDraft, statusOf, syncStep, toSend, type SyncState } from '@/lib/mindmap/sync';
import type { MapNode } from '@/lib/mindmap/tree';
import { writeStored } from '@/lib/storage';

const DRAFT_MS = 250;

function keepDraft(id: string, sync: SyncState, root: MapNode) {
  writeStored(draftKey(id), root === sync.base.root ? null : serializeDraft(sync.base.revision, root));
}

export function useMapSync(id: string, opened: SyncState, root: MapNode, adopt: (root: MapNode) => void) {
  const [sync, dispatch] = useReducer(syncStep, opened);
  const latest = useRef({ sync, root });
  useEffect(() => {
    latest.current = { sync, root };
  }, [sync, root]);

  const transmit = useCallback(
    async (next: MapNode, revision: number, keepalive = false) => {
      dispatch({ type: 'sent', root: next });
      const { status, body } = await writeJson(`/api/cartes/${id}`, 'PUT', { revision, root: next }, keepalive);
      const event = eventOf(status, body);
      dispatch(event);
      if (event.type === 'accepted' && latest.current.root === next) writeStored(draftKey(id), null);
    },
    [id],
  );

  useEffect(() => {
    const timer = setTimeout(() => keepDraft(id, sync, root), DRAFT_MS);
    return () => clearTimeout(timer);
  }, [id, root, sync]);

  useEffect(() => {
    const next = toSend(sync, root);
    if (!next) return;
    const timer = setTimeout(() => void transmit(next, sync.base.revision), sendDelay(sync));
    return () => clearTimeout(timer);
  }, [sync, root, transmit]);

  const flush = useCallback(
    (final: MapNode) => {
      const current = latest.current.sync;
      latest.current = { sync: current, root: final };
      keepDraft(id, current, final);
      // Au-delà de 64 Kio, le navigateur refuse un envoi qui survit à la page : le brouillon prend le relais.
      if (toSend(current, final)) void transmit(final, current.base.revision, true);
    },
    [id, transmit],
  );

  function settle(takeTheirs: boolean) {
    if (!sync.theirs) return;
    dispatch({ type: 'settled' });
    if (takeTheirs) adopt(sync.theirs.root);
  }

  return { status: statusOf(sync, root), settle, flush };
}
