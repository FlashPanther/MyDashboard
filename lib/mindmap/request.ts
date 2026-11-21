import type { Adoption } from './links.ts';
import { parseDocument, type MapNode } from './tree.ts';

export const MAX_BODY = 2_000_000;

export type MapBody = { root: MapNode; revision: number | null; sendTasks: boolean; forget: string[]; adopt: Adoption[] };
export type Refusal = { status: 400 | 413; error: string };

const TOO_BIG: Refusal = { status: 413, error: 'Carte trop volumineuse' };
const INVALID: Refusal = { status: 400, error: 'Carte invalide' };

async function readLimited(request: Request): Promise<string | null> {
  if (Number(request.headers.get('content-length')) > MAX_BODY) return null;
  if (!request.body) return '';
  const decoder = new TextDecoder();
  const reader = request.body.getReader();
  let text = '';
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

function soundIds(value: unknown, seen = new Set<string>()): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const { id, children } = value as { id?: unknown; children?: unknown };
  if (typeof id !== 'string' || id === '' || seen.has(id) || !Array.isArray(children)) return false;
  seen.add(id);
  return children.every((child) => soundIds(child, seen));
}

function isAdoption(value: unknown): value is Adoption {
  const { nodeId, taskId, listId, title } = (value ?? {}) as Record<string, unknown>;
  return [nodeId, taskId, listId, title].every((field) => typeof field === 'string' && field !== '');
}

export async function readMapBody(request: Request): Promise<MapBody | Refusal> {
  const text = await readLimited(request);
  if (text === null) return TOO_BIG;
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== 'object' || data === null || !('root' in data) || !soundIds(data.root)) return INVALID;
    const revision = 'revision' in data && Number.isInteger(data.revision) ? (data.revision as number) : null;
    const forget = 'forget' in data && Array.isArray(data.forget) ? data.forget.filter((id): id is string => typeof id === 'string') : [];
    const adopt = 'adopt' in data && Array.isArray(data.adopt) ? data.adopt.filter(isAdoption) : [];
    return { root: parseDocument(data), revision, sendTasks: 'sendTasks' in data && data.sendTasks === true, forget, adopt };
  } catch {
    return INVALID;
  }
}
