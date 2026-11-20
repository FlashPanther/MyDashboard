import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FORMAT_VERSION, parseDocument, type MapNode } from './tree.ts';

const MAPS_DIR = path.join(process.cwd(), '.data', 'cartes');
const TRASH = 'corbeille';
const ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export type StoredMap = { id: string; revision: number; updatedAt: string; root: MapNode };
export type MapSummary = { id: string; title: string; revision: number; updatedAt: string };
export type SaveResult = { saved: boolean; map: StoredMap } | null;
type Options = { now?: Date; dir?: string };

const queues = new Map<string, Promise<unknown>>();

function inTurn<T>(key: string, work: () => Promise<T>): Promise<T> {
  const turn = (queues.get(key) ?? Promise.resolve()).then(work);
  const tail = turn.catch(() => undefined);
  queues.set(key, tail);
  void tail.then(() => queues.get(key) === tail && queues.delete(key));
  return turn;
}

function fileOf(dir: string, id: string): string | null {
  return ID.test(id) ? path.join(dir, `${id}.json`) : null;
}

async function persist(dir: string, { id, revision, updatedAt, root }: StoredMap): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${id}.json`);
  const draft = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(draft, JSON.stringify({ version: FORMAT_VERSION, revision, updatedAt, root }, null, 2), { mode: 0o600 });
  await fs.rename(draft, file);
}

export async function readMap(id: string, { dir = MAPS_DIR }: Options = {}): Promise<StoredMap | null> {
  const file = fileOf(dir, id);
  if (!file) return null;
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Number.isInteger(data.revision) || data.revision < 1 || typeof data.updatedAt !== 'string') return null;
    return { id, revision: data.revision, updatedAt: data.updatedAt, root: parseDocument(data) };
  } catch {
    return null;
  }
}

export async function listMaps({ dir = MAPS_DIR }: Options = {}): Promise<MapSummary[]> {
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const ids = names.filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length));
  const maps = await Promise.all(ids.map((id) => readMap(id, { dir })));
  return maps
    .filter((map) => map !== null)
    .map(({ id, root, revision, updatedAt }) => ({ id, title: root.text, revision, updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createMap(root: MapNode, { now = new Date(), dir = MAPS_DIR }: Options = {}): Promise<StoredMap> {
  const map = { id: randomUUID(), revision: 1, updatedAt: now.toISOString(), root };
  await persist(dir, map);
  return map;
}

export function saveMap(
  id: string,
  root: MapNode,
  revision: number,
  { now = new Date(), dir = MAPS_DIR }: Options = {},
): Promise<SaveResult> {
  return inTurn(id, async () => {
    const current = await readMap(id, { dir });
    if (!current) return null;
    if (current.revision !== revision) return { saved: false, map: current };
    const map = { ...current, root, revision: revision + 1, updatedAt: now.toISOString() };
    await persist(dir, map);
    return { saved: true, map };
  });
}

export function trashMap(id: string, { dir = MAPS_DIR }: Options = {}): Promise<boolean> {
  return inTurn(id, async () => {
    const file = fileOf(dir, id);
    if (!file) return false;
    await fs.mkdir(path.join(dir, TRASH), { recursive: true });
    return fs.rename(file, path.join(dir, TRASH, `${id}.json`)).then(
      () => true,
      () => false,
    );
  });
}
