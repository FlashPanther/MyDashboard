import { FORMAT_VERSION, parseDocument, sameMap, type MapNode } from './tree.ts';

export type Copy = { revision: number; root: MapNode };
export type Draft = { base: number; root: MapNode };

export type SyncState = {
  revision: number;
  saved: MapNode;
  sending: MapNode | null;
  theirs: Copy | null;
  trouble: 'none' | 'offline' | 'gone';
};

export type SyncEvent =
  | { type: 'sent'; root: MapNode }
  | { type: 'accepted'; revision: number }
  | { type: 'refused'; theirs: Copy }
  | { type: 'failed'; gone: boolean }
  | { type: 'keepMine' }
  | { type: 'takeTheirs' };

export type SyncStatus = 'saved' | 'saving' | 'offline' | 'conflict' | 'gone';

export function draftKey(id: string): string {
  return `carte.brouillon.${id}`;
}

export function serializeDraft(base: number, root: MapNode): string {
  return JSON.stringify({ version: FORMAT_VERSION, base, root });
}

export function parseDraft(text: string | null): Draft | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    return Number.isInteger(data.base) ? { base: data.base, root: parseDocument(data) } : null;
  } catch {
    return null;
  }
}

export function opening(server: Copy, draft: Draft | null): { root: MapNode; sync: SyncState } {
  const clean: SyncState = { revision: server.revision, saved: server.root, sending: null, theirs: null, trouble: 'none' };
  if (!draft || sameMap(draft.root, server.root)) return { root: server.root, sync: clean };
  if (draft.base === server.revision) return { root: draft.root, sync: clean };
  return { root: draft.root, sync: { ...clean, theirs: server } };
}

export function toSend(sync: SyncState, root: MapNode): MapNode | null {
  if (sync.sending || sync.theirs || sync.trouble === 'gone' || root === sync.saved) return null;
  return root;
}

export function statusOf(sync: SyncState, root: MapNode): SyncStatus {
  if (sync.theirs) return 'conflict';
  if (sync.trouble !== 'none') return sync.trouble;
  return sync.sending || root !== sync.saved ? 'saving' : 'saved';
}

export function syncStep(sync: SyncState, event: SyncEvent): SyncState {
  switch (event.type) {
    case 'sent':
      return { ...sync, sending: event.root };
    case 'accepted':
      return { ...sync, revision: event.revision, saved: sync.sending ?? sync.saved, sending: null, trouble: 'none' };
    case 'refused':
      return { ...sync, sending: null, theirs: event.theirs, trouble: 'none' };
    case 'failed':
      return { ...sync, sending: null, trouble: event.gone ? 'gone' : 'offline' };
    case 'keepMine':
      return sync.theirs ? { ...sync, revision: sync.theirs.revision, theirs: null } : sync;
    case 'takeTheirs':
      return sync.theirs ? { ...sync, revision: sync.theirs.revision, saved: sync.theirs.root, theirs: null } : sync;
  }
}
