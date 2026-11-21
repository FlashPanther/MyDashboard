import { allPages } from '../google/allPages.ts';
import { newTaskListRequest, newTaskRequest, taskListsRequest, tasksInListRequest, taskUpdateRequest } from '../google/taskWrites.ts';
import { GoogleHttpError } from '../google/errors.ts';
import { lostTasks, markerIn, settleLinks, tasksToCreate, tasksToUpdate, type Link, type NewTask, type TaskUpdate } from './links.ts';
import { annotate, readMap, type Options, type StoredMap } from './store.ts';

export type Google = <T>(url: string, init?: RequestInit) => Promise<T>;
export type SyncResult = { enabled: boolean; waiting: number; lost: number };
type GoogleTask = { id: string; notes?: string; status?: string; updated?: string };

const MAX_PER_PASS = 50;
const running = new Map<string, Promise<SyncResult | null>>();
const again = new Set<string>();
let sending: Promise<unknown> = Promise.resolve();

async function listNamed(title: string, google: Google): Promise<string> {
  const lists = await allPages<{ id: string; title: string }>((pageToken) => {
    const { url, init } = taskListsRequest(pageToken);
    return google(url, init);
  });
  const found = lists.find((list) => list.title === title);
  if (found) return found.id;
  const { url, init } = newTaskListRequest(title);
  return (await google<{ id: string }>(url, init)).id;
}

function tasksIn(listId: string, google: Google): Promise<GoogleTask[]> {
  return allPages<GoogleTask>((pageToken) => {
    const { url, init } = tasksInListRequest(listId, pageToken);
    return google(url, init);
  });
}

/** La liste et ce qu'elle contient déjà. Une liste retenue mais disparue chez Google est recherchée par son titre. */
async function destination(known: string | undefined, listTitle: string, google: Google) {
  const read = async (listId: string) => ({ listId, existing: await tasksIn(listId, google) });
  if (!known) return read(await listNamed(listTitle, google));
  return read(known).catch(async () => read(await listNamed(listTitle, google)));
}

function linkTo(task: NewTask, listId: string, found: GoogleTask): Link {
  return { taskId: found.id, listId, title: task.title, done: found.status ? found.status === 'completed' : task.done, ...(found.updated ? { updated: found.updated } : {}) };
}

async function send(map: StoredMap, batch: NewTask[], listTitle: string, google: Google, options: Options): Promise<void> {
  const { listId, existing } = await destination(Object.values(map.links)[0]?.listId, listTitle, google);
  // Une création dont la réponse s'est perdue, ou dont le lien n'a pas pu être écrit, se reconnaît à sa référence : on la relie au lieu de la recréer.
  const known = new Map(existing.flatMap((task) => (markerIn(task.notes) ? [[markerIn(task.notes)!, task] as const] : [])));
  for (const task of batch) {
    const { url, init } = newTaskRequest(task.title, listId, task);
    const link = linkTo(task, listId, known.get(task.marker) ?? (await google<GoogleTask>(url, init)));
    await annotate(map.id, (latest) => ({ links: { ...latest.links, [task.nodeId]: link } }), options);
  }
}

/** Chaque tâche est traitée seule : une tâche supprimée chez Google n'empêche pas de mettre les autres à jour. */
async function update(mapId: string, updates: TaskUpdate[], google: Google, options: Options): Promise<void> {
  let failure: unknown;
  for (const { nodeId, taskId, listId, ...changed } of updates) {
    let change: Partial<Link>;
    try {
      const { url, init } = taskUpdateRequest(listId, taskId, changed);
      const { updated } = await google<GoogleTask>(url, init);
      change = { ...changed, ...(updated ? { updated } : {}) };
    } catch (error) {
      if (!(error instanceof GoogleHttpError) || error.status !== 404) {
        failure ??= error;
        continue;
      }
      change = { lost: true };
    }
    await annotate(mapId, ({ links }) => ({ links: { ...links, [nodeId]: { ...links[nodeId], ...change } } }), options);
  }
  if (failure) throw failure;
}

async function sync(id: string, listTitle: string, google: Google, options: Options): Promise<SyncResult | null> {
  const map = await readMap(id, options);
  if (!map) return null;
  const create = tasksToCreate(id, map.root, map.links);
  const batch = map.sendTasks ? create.slice(0, MAX_PER_PASS) : [];
  const changed = map.sendTasks ? tasksToUpdate(map.root, map.links) : [];
  const updates = changed.slice(0, MAX_PER_PASS);
  try {
    if (batch.length > 0 || updates.length > 0) {
      // Un envoi à la fois pour tout le serveur : deux cartes portant les mêmes nœuds (réimport) ne créent pas la même tâche en parallèle.
      const turn = sending.then(async () => {
        if (batch.length > 0) await send(map, batch, listTitle, google, options);
        await update(id, updates, google, options);
      });
      sending = turn.catch(() => undefined);
      await turn;
    }
  } finally {
    await annotate(id, (latest) => ({ links: settleLinks(latest.root, latest.links) }), options);
  }
  const latest = await readMap(id, options);
  return {
    enabled: map.sendTasks,
    waiting: create.length - batch.length + changed.length - updates.length,
    lost: latest ? lostTasks(latest.root, latest.links) : 0,
  };
}

/** Une passe à la fois par carte ; une demande arrivée pendant une passe en déclenche une autre à la suite. */
export function syncTasks(id: string, listTitle: string, google: Google, options: Options = {}): Promise<SyncResult | null> {
  const current = running.get(id);
  if (current) {
    again.add(id);
    return current;
  }
  const run = (async () => {
    let result: SyncResult | null;
    do {
      again.delete(id);
      result = await sync(id, listTitle, google, options);
    } while (again.has(id));
    return result;
  })().finally(() => {
    running.delete(id);
    again.delete(id);
  });
  running.set(id, run);
  return run;
}
