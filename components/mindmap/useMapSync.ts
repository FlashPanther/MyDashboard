import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { writeJson } from '@/components/mindmap/writeJson';
import {
  draftKey,
  eventOf,
  isClean,
  sendDelay,
  serializeDraft,
  statusOf,
  syncStep,
  toSend,
  type SyncState,
} from '@/lib/mindmap/sync';
import type { MapNode } from '@/lib/mindmap/tree';
import { readStored, writeStored } from '@/lib/storage';

const DRAFT_MS = 250;

export function useMapSync(id: string, opened: SyncState, root: MapNode, adopt: (root: MapNode) => void) {
  const [sync, dispatch] = useReducer(syncStep, opened);
  const [kept, setKept] = useState(true);
  const latest = useRef({ sync, root });
  const inFlight = useRef(false);
  const written = useRef<string | null>(null);
  /** Nœuds retirés avec le choix de supprimer aussi leur tâche Google : l'intention part avec l'enregistrement. */
  const forgotten = useRef(new Set<string>());
  useEffect(() => {
    latest.current = { sync, root };
  }, [sync, root]);

  const keepDraft = useCallback(
    (state: SyncState, current: MapNode) => {
      const key = draftKey(id);
      if (isClean(state, current)) {
        // Un autre onglet a pu y écrire le sien : on n'efface que le brouillon qu'on a soi-même posé.
        if (written.current !== null && readStored(key) === written.current) writeStored(key, null);
        written.current = null;
        return;
      }
      const text = serializeDraft(state.base.revision, current);
      writeStored(key, text);
      written.current = text;
      setKept(readStored(key) === text);
    },
    [id],
  );

  const transmit = useCallback(
    async (next: MapNode, revision: number, keepalive = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      dispatch({ type: 'sent', root: next });
      const forget = [...forgotten.current];
      const { status, body } = await writeJson(`/api/cartes/${id}`, 'PUT', { revision, root: next, forget }, keepalive);
      inFlight.current = false;
      const event = eventOf(status, body);
      if (event.type === 'accepted') forget.forEach((nodeId) => forgotten.current.delete(nodeId));
      dispatch(event);
      keepDraft(syncStep({ ...latest.current.sync, sending: next }, event), latest.current.root);
    },
    [id, keepDraft],
  );

  useEffect(() => {
    const timer = setTimeout(() => keepDraft(sync, root), DRAFT_MS);
    return () => clearTimeout(timer);
  }, [root, sync, keepDraft]);

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
      keepDraft(current, final);
      // Au-delà de 64 Kio, le navigateur refuse un envoi qui survit à la page : le brouillon prend le relais.
      if (toSend(current, final)) void transmit(final, current.base.revision, true);
    },
    [keepDraft, transmit],
  );

  // Un nœud remis dans la carte (annulation) n'est plus à supprimer chez Google, même s'il est retiré plus tard par Suppr.
  useEffect(() => {
    if (forgotten.current.size === 0) return;
    const present = new Set<string>();
    const visit = (node: MapNode) => {
      present.add(node.id);
      node.children.forEach(visit);
    };
    visit(root);
    for (const nodeId of forgotten.current) if (present.has(nodeId)) forgotten.current.delete(nodeId);
  }, [root]);

  function settle(takeTheirs: boolean) {
    if (!sync.theirs) return;
    dispatch({ type: 'settled' });
    if (takeTheirs) forgotten.current.clear();
    if (takeTheirs) adopt(sync.theirs.root);
  }

  const forgetOnSave = useCallback((ids: readonly string[]) => ids.forEach((nodeId) => forgotten.current.add(nodeId)), []);

  return { status: statusOf(sync, root), kept, settle, flush, forgetOnSave };
}
