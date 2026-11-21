import { FORMAT_VERSION, parseDocument, sameMap, type MapNode } from './tree.ts';

export type Copy = { revision: number; root: MapNode };
export type Draft = { base: number; root: MapNode };
export type Trouble = 'offline' | 'gone' | 'refused';

export type SyncState = {
  base: Copy;
  sending: MapNode | null;
  theirs: Copy | null;
  trouble: Trouble | null;
  retries: number;
  doubt: boolean;
};

export type SyncEvent =
  | { type: 'sent'; root: MapNode }
  | { type: 'accepted'; revision: number }
  | { type: 'conflict'; theirs: Copy }
  | { type: 'failed'; trouble: Trouble }
  | { type: 'settled' };

export type SyncStatus = 'saved' | 'saving' | 'conflict' | Trouble;
export type Opened = { root: MapNode; sync: SyncState };

const QUIET_MS = 600;
const RETRY_MS = 5000;
const RETRY_MAX_MS = 60_000;

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

export function readCopy(value: unknown): Copy | null {
  try {
    const { revision } = value as { revision?: unknown };
    return Number.isInteger(revision) ? { revision: revision as number, root: parseDocument(value) } : null;
  } catch {
    return null;
  }
}

export function opening(server: Copy, draft: Draft | null): Opened {
  const clean: SyncState = { base: server, sending: null, theirs: null, trouble: null, retries: 0, doubt: false };
  if (!draft || sameMap(draft.root, server.root)) return { root: server.root, sync: clean };
  if (draft.base === server.revision) return { root: draft.root, sync: clean };
  return { root: draft.root, sync: { ...clean, base: { revision: draft.base, root: server.root }, theirs: server } };
}

export function isClean(sync: SyncState, root: MapNode): boolean {
  return !sync.sending && !sync.theirs && !sync.doubt && root === sync.base.root;
}

export function toSend(sync: SyncState, root: MapNode): MapNode | null {
  const stopped = sync.sending || sync.theirs || sync.trouble === 'gone' || sync.trouble === 'refused';
  return stopped || isClean(sync, root) ? null : root;
}

export function sendDelay(sync: SyncState): number {
  return sync.trouble === 'offline' ? Math.min(RETRY_MS * 2 ** (sync.retries - 1), RETRY_MAX_MS) : QUIET_MS;
}

export function statusOf(sync: SyncState, root: MapNode): SyncStatus {
  if (sync.theirs) return 'conflict';
  if (sync.trouble) return sync.trouble;
  return isClean(sync, root) ? 'saved' : 'saving';
}

export function eventOf(status: number, body: unknown): SyncEvent {
  const { revision, current } = (body ?? {}) as { revision?: unknown; current?: unknown };
  if (status >= 200 && status < 300 && Number.isInteger(revision)) return { type: 'accepted', revision: revision as number };
  const theirs = status === 409 ? readCopy(current) : null;
  if (theirs) return { type: 'conflict', theirs };
  if (status === 404) return { type: 'failed', trouble: 'gone' };
  return { type: 'failed', trouble: status >= 400 && status < 500 ? 'refused' : 'offline' };
}

export function syncStep(sync: SyncState, event: SyncEvent): SyncState {
  switch (event.type) {
    case 'sent':
      return { ...sync, sending: event.root };
    case 'accepted': {
      const base = { revision: event.revision, root: sync.sending ?? sync.base.root };
      return { ...sync, base, sending: null, trouble: null, retries: 0, doubt: false };
    }
    case 'conflict': {
      const settled = { ...sync, sending: null, trouble: null, retries: 0, doubt: false };
      const mine = sync.sending && sameMap(sync.sending, event.theirs.root);
      return mine ? { ...settled, base: { revision: event.theirs.revision, root: sync.sending! } } : { ...settled, theirs: event.theirs };
    }
    case 'failed':
      return { ...sync, sending: null, trouble: event.trouble, retries: sync.retries + 1, doubt: sync.doubt || event.trouble === 'offline' };
    case 'settled':
      return sync.theirs ? { ...sync, base: sync.theirs, theirs: null } : sync;
  }
}
