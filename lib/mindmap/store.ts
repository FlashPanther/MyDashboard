import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseLinks, type Links } from './links.ts';
import { FORMAT_VERSION, parseDocument, type MapNode } from './tree.ts';

const MAPS_DIR = path.join(process.cwd(), '.data', 'cartes');
const TRASH = 'corbeille';
const ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const MAX_MAPS = 200;

export type StoredMap = { id: string; revision: number; updatedAt: string; root: MapNode; links: Links };
export type MapSummary = { id: string; title: string; revision: number; updatedAt: string };
export type SaveResult = { saved: boolean; map: StoredMap } | null;
export type Options = { now?: Date; dir?: string };

export class UnreadableMapError extends Error {
  constructor() {
    super('Carte illisible sur le serveur');
  }
}

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

async function onDisk<T>(work: () => Promise<T>, whenAbsent: T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return whenAbsent;
    // Le message d'origine contient des chemins du serveur : il reste dans le journal.
    console.error('Stockage des cartes :', error);
    throw new Error('Stockage des cartes indisponible');
  }
}

async function mapIds(dir: string): Promise<string[]> {
  const names = await onDisk(() => fs.readdir(dir), []);
  return names.filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length)).filter((id) => ID.test(id));
}

async function persist(dir: string, { id, revision, updatedAt, root, links }: StoredMap): Promise<void> {
  const file = path.join(dir, `${id}.json`);
  const draft = `${file}.${randomUUID()}.tmp`;
  await onDisk(async () => {
    await fs.mkdir(dir, { recursive: true });
    const handle = await fs.open(draft, 'w', 0o600);
    try {
      await handle.writeFile(JSON.stringify({ version: FORMAT_VERSION, revision, updatedAt, root, links }, null, 2));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(draft, file).catch(async (error) => {
      await fs.rm(draft, { force: true });
      throw error;
    });
  }, undefined);
}

export async function readMap(id: string, { dir = MAPS_DIR }: Options = {}): Promise<StoredMap | null> {
  const file = fileOf(dir, id);
  const text = file && (await onDisk(() => fs.readFile(file, 'utf8'), null));
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    if (!Number.isInteger(data.revision) || data.revision < 1 || typeof data.updatedAt !== 'string') throw new Error();
    return { id, revision: data.revision, updatedAt: data.updatedAt, root: parseDocument(data), links: parseLinks(data.links) };
  } catch {
    throw new UnreadableMapError();
  }
}

export async function listMaps({ dir = MAPS_DIR }: Options = {}): Promise<MapSummary[]> {
  const maps: MapSummary[] = [];
  for (const id of await mapIds(dir)) {
    const map = await readMap(id, { dir }).catch((error) => {
      if (error instanceof UnreadableMapError) return null;
      throw error;
    });
    if (map) maps.push({ id, title: map.root.text, revision: map.revision, updatedAt: map.updatedAt });
  }
  return maps.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createMap(root: MapNode, { now = new Date(), dir = MAPS_DIR }: Options = {}): Promise<StoredMap | null> {
  return inTurn(dir, async () => {
    if ((await mapIds(dir)).length >= MAX_MAPS) return null;
    const map = { id: randomUUID(), revision: 1, updatedAt: now.toISOString(), root, links: {} };
    await persist(dir, map);
    return map;
  });
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

/** Les liens vers Google Tasks appartiennent au serveur : ils changent sans toucher à la révision de la carte. */
export function relink(
  id: string,
  change: (map: StoredMap) => Links,
  { dir = MAPS_DIR }: Options = {},
): Promise<StoredMap | null> {
  return inTurn(id, async () => {
    const current = await readMap(id, { dir });
    if (!current) return null;
    const map = { ...current, links: change(current) };
    await persist(dir, map);
    return map;
  });
}

export function trashMap(id: string, { now = new Date(), dir = MAPS_DIR }: Options = {}): Promise<boolean> {
  return inTurn(id, async () => {
    const file = fileOf(dir, id);
    if (!file) return false;
    const trash = path.join(dir, TRASH);
    return onDisk(async () => {
      await fs.mkdir(trash, { recursive: true });
      await fs.rename(file, path.join(trash, `${id}.${now.getTime()}.json`));
      return true;
    }, false);
  });
}
