import { allPages } from '../google/allPages.ts';
import { newTaskListRequest, newTaskRequest, taskListsRequest, tasksInListRequest, taskUpdateRequest } from '../google/taskWrites.ts';
import { GoogleHttpError } from '../google/errors.ts';
import {
  lostTasks,
  markerIn,
  reconcile,
  absorb,
  settleLinks,
  settleReconciled,
  taskTitle,
  tasksToCreate,
  type Fields,
  type Link,
  type NewTask,
  type TaskUpdate,
} from './links.ts';
import { annotate, readMap, type Options, type StoredMap } from './store.ts';
import type { RemoteChange } from './tree.ts';

export type Google = <T>(url: string, init?: RequestInit) => Promise<T>;
/** Ce que Google a changé et que l'éditeur doit reprendre dans la carte. */
export type Pull = RemoteChange;
export type SyncResult = { enabled: boolean; waiting: number; lost: number; pulls: Pull[] };
type GoogleTask = { id: string; title?: string; notes?: string; status?: string; updated?: string; deleted?: boolean };

const MAX_PER_PASS = 50;
const READ_EVERY_MS = 20_000;
/** Marge prise sur la dernière date vue : une modification enregistrée chez Google pendant la lecture n'est pas manquée. */
const CURSOR_MARGIN_MS = 5_000;
const readAt = new Map<string, number>();
/** Par carte, la plus récente modification vue chez Google : la lecture suivante ne demande que ce qui a changé depuis. */
const cursors = new Map<string, string>();
type Exchanged = { waiting: number; pulls: Pull[] };
/** `read: false` : ne lire Google que s'il faut créer ; pour les passes sans éditeur, qui n'ont personne à qui rendre ce qui a changé. */
export type SyncOptions = Options & { read?: boolean };
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

function tasksIn(listId: string, google: Google, updatedMin?: string): Promise<GoogleTask[]> {
  return allPages<GoogleTask>((pageToken) => {
    const { url, init } = tasksInListRequest(listId, pageToken, updatedMin);
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

function since(cursor: string | undefined): string | undefined {
  return cursor && new Date(Date.parse(cursor) - CURSOR_MARGIN_MS).toISOString();
}

/** Ce que Google dit d'une tâche, lu comme la carte l'écrit ; un titre vide n'est pas repris. */
function fieldsOf(task: GoogleTask): Fields {
  const title = taskTitle(task.title ?? '');
  return { ...(title ? { title } : {}), done: task.status === 'completed' };
}

/** Crée ce qui manque, lit Google de temps en temps, puis pousse ce que la carte a changé et rend ce que Google a changé. */
async function exchange(map: StoredMap, batch: NewTask[], listTitle: string, google: Google, options: SyncOptions): Promise<Exchanged> {
  const now = options.now?.getTime() ?? Date.now();
  const followed = Object.keys(map.links).length > 0;
  const remote = new Map<string, Fields>();
  const gone = new Set<string>();
  const due = followed && options.read !== false && now - (readAt.get(map.id) ?? 0) >= READ_EVERY_MS;
  if (batch.length > 0 || due) {
    // Créer demande toute la liste, pour reconnaître les tâches déjà créées ; sinon, seul ce qui a changé suffit.
    const known = Object.values(map.links)[0]?.listId;
    const delta = batch.length === 0 && known ? since(cursors.get(map.id)) : undefined;
    const { listId, existing } = delta
      ? { listId: known!, existing: await tasksIn(known!, google, delta) }
      : await destination(known, listTitle, google);
    readAt.set(map.id, now);
    const latest = existing.reduce((max, task) => (task.updated && task.updated > max ? task.updated : max), cursors.get(map.id) ?? '');
    if (latest) cursors.set(map.id, latest);
    const alive = existing.filter((task) => !task.deleted);
    for (const task of existing) if (task.deleted) gone.add(task.id);
    for (const task of alive) remote.set(task.id, fieldsOf(task));
    await send(map, batch, listId, alive, google, options);
  }
  const current = (await readMap(map.id, options)) ?? map;
  const plan = reconcile(current.root, settleLinks(current.root, absorb(current.links, remote, gone)), remote);
  await annotate(map.id, ({ links }) => ({ links: settleReconciled(absorb(links, remote, gone), plan) }), options);
  const pushes: TaskUpdate[] = plan
    .filter(({ push }) => Object.keys(push).length > 0)
    .map(({ nodeId, taskId, listId, push }) => ({ nodeId, taskId, listId, ...push }));
  await update(map.id, pushes.slice(0, MAX_PER_PASS), google, options);
  return {
    waiting: Math.max(0, pushes.length - MAX_PER_PASS),
    pulls: plan.filter(({ pull }) => Object.keys(pull).length > 0).map(({ nodeId, pull }) => ({ id: nodeId, ...pull })),
  };
}

async function sync(id: string, listTitle: string, google: Google, options: SyncOptions): Promise<SyncResult | null> {
  const map = await readMap(id, options);
  if (!map) return null;
  const create = tasksToCreate(id, map.root, map.links);
  const batch = map.sendTasks ? create.slice(0, MAX_PER_PASS) : [];
  let exchanged: Exchanged = { waiting: 0, pulls: [] };
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
export function syncTasks(id: string, listTitle: string, google: Google, options: SyncOptions = {}): Promise<SyncResult | null> {
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
