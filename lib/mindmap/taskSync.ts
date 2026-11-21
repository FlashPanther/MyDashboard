import { allPages } from '../google/allPages.ts';
import { newTaskListRequest, newTaskRequest, taskListsRequest, tasksInListRequest, taskUpdateRequest } from '../google/taskWrites.ts';
import { GoogleHttpError } from '../google/errors.ts';
import {
  lostTasks,
  markerIn,
  reconcile,
  settleLinks,
  settleReconciled,
  tasksToCreate,
  type Fields,
  type Link,
  type NewTask,
  type TaskUpdate,
} from './links.ts';
import { annotate, readMap, type Options, type StoredMap } from './store.ts';

export type Google = <T>(url: string, init?: RequestInit) => Promise<T>;
/** Ce que Google a changé et que l'éditeur doit reprendre dans la carte. */
export type Pull = { id: string } & Fields;
export type SyncResult = { enabled: boolean; waiting: number; lost: number; pulls: Pull[] };
type GoogleTask = { id: string; title?: string; notes?: string; status?: string; updated?: string };

const MAX_PER_PASS = 50;
const READ_EVERY_MS = 20_000;
const readAt = new Map<string, number>();
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

/** La base du lien est l'état de la carte, même pour une tâche reconnue : ce que Google a de différent sera lu comme un changement venu de Google, jamais écrasé. */
function linkTo(task: NewTask, listId: string, found: GoogleTask): Link {
  return { taskId: found.id, listId, title: task.title, done: task.done, ...(found.updated ? { updated: found.updated } : {}) };
}

async function send(map: StoredMap, batch: NewTask[], listId: string, existing: GoogleTask[], google: Google, options: Options): Promise<void> {
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

/** Crée ce qui manque, lit Google de temps en temps, puis pousse ce que la carte a changé et rend ce que Google a changé. */
async function exchange(map: StoredMap, batch: NewTask[], listTitle: string, google: Google, options: Options) {
  const now = options.now?.getTime() ?? Date.now();
  const followed = Object.values(map.links).some((link) => !link.detached);
  const remote = new Map<string, Fields>();
  if (batch.length > 0 || (followed && now - (readAt.get(map.id) ?? 0) >= READ_EVERY_MS)) {
    const { listId, existing } = await destination(Object.values(map.links)[0]?.listId, listTitle, google);
    readAt.set(map.id, now);
    for (const task of existing) remote.set(task.id, { title: task.title ?? '', done: task.status === 'completed' });
    await send(map, batch, listId, existing, google, options);
  }
  const current = (await readMap(map.id, options)) ?? map;
  const plan = reconcile(current.root, settleLinks(current.root, current.links), remote);
  await annotate(map.id, ({ links }) => ({ links: settleReconciled(links, plan, remote) }), options);
  const pushes: TaskUpdate[] = plan
    .filter(({ push }) => Object.keys(push).length > 0)
    .map(({ nodeId, taskId, listId, push }) => ({ nodeId, taskId, listId, ...push }));
  await update(map.id, pushes.slice(0, MAX_PER_PASS), google, options);
  return {
    waiting: Math.max(0, pushes.length - MAX_PER_PASS),
    pulls: plan.filter(({ pull }) => Object.keys(pull).length > 0).map(({ nodeId, pull }) => ({ id: nodeId, ...pull })),
  };
}

async function sync(id: string, listTitle: string, google: Google, options: Options): Promise<SyncResult | null> {
  const map = await readMap(id, options);
  if (!map) return null;
  const create = tasksToCreate(id, map.root, map.links);
  const batch = map.sendTasks ? create.slice(0, MAX_PER_PASS) : [];
  let exchanged: Awaited<ReturnType<typeof exchange>> = { waiting: 0, pulls: [] };
  try {
    if (map.sendTasks) {
      // Un envoi à la fois pour tout le serveur : deux cartes portant les mêmes nœuds (réimport) ne créent pas la même tâche en parallèle.
      const turn = sending.then(() => exchange(map, batch, listTitle, google, options));
      sending = turn.catch(() => undefined);
      exchanged = await turn;
    }
  } finally {
    await annotate(id, (latest) => ({ links: settleLinks(latest.root, latest.links) }), options);
  }
  const latest = await readMap(id, options);
  return {
    enabled: map.sendTasks,
    waiting: create.length - batch.length + exchanged.waiting,
    lost: latest ? lostTasks(latest.root, latest.links) : 0,
    pulls: exchanged.pulls,
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
