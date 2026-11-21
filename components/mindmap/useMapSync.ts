import { useCallback, useEffect, useReducer, useRef } from 'react';
import { draftKey, serializeDraft, statusOf, syncStep, toSend, type Copy, type SyncState } from '@/lib/mindmap/sync';
import type { MapNode } from '@/lib/mindmap/tree';
import { writeStored } from '@/lib/storage';

const QUIET_MS = 600;
const RETRY_MS = 5000;

function put(id: string, revision: number, root: MapNode, keepalive = false): Promise<Response> {
  return fetch(`/api/cartes/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ revision, root }),
    keepalive,
  });
}

export function useMapSync(id: string, opened: SyncState, root: MapNode) {
  const [sync, dispatch] = useReducer(syncStep, opened);
  const latest = useRef(sync);
  useEffect(() => {
    latest.current = sync;
  }, [sync]);

  useEffect(() => {
    writeStored(draftKey(id), root === sync.saved ? null : serializeDraft(sync.revision, root));
  }, [id, root, sync.saved, sync.revision]);

  useEffect(() => {
    const next = toSend(sync, root);
    if (!next) return;
    const timer = setTimeout(
      async () => {
        dispatch({ type: 'sent', root: next });
        try {
          const response = await put(id, sync.revision, next);
          const body = await response.json();
          if (response.ok) dispatch({ type: 'accepted', revision: body.revision });
          else if (response.status === 409) dispatch({ type: 'refused', theirs: body.current as Copy });
          else dispatch({ type: 'failed', gone: response.status === 404 });
        } catch {
          dispatch({ type: 'failed', gone: false });
        }
      },
      sync.trouble === 'offline' ? RETRY_MS : QUIET_MS,
    );
    return () => clearTimeout(timer);
  }, [id, sync, root]);

  const flush = useCallback(
    (final: MapNode) => {
      const { saved, revision } = latest.current;
      if (final === saved) return;
      writeStored(draftKey(id), serializeDraft(revision, final));
      if (toSend(latest.current, final)) void put(id, revision, final, true).catch(() => undefined);
    },
    [id],
  );

  return { status: statusOf(sync, root), theirs: sync.theirs, resolve: dispatch, flush };
}
