import { parseRoot, type MapNode } from './tree.ts';

export const MAX_BODY = 2_000_000;

export type MapBody = { root: MapNode; revision: number | null };

export function parseMapBody(text: string): MapBody | null {
  if (text.length > MAX_BODY) return null;
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== 'object' || data === null || !('root' in data)) return null;
    const revision = 'revision' in data && Number.isInteger(data.revision) ? (data.revision as number) : null;
    return { root: parseRoot(data.root), revision };
  } catch {
    return null;
  }
}
