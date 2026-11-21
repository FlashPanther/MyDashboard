import { allPages } from '../google/allPages.ts';
import { taskDeleteRequest, newTaskListRequest, newTaskRequest, taskListsRequest, tasksInListRequest, taskUpdateRequest } from '../google/taskWrites.ts';
import { GoogleHttpError } from '../google/errors.ts';
import {
  taskStatus,
  markerIn,
  reconcile,
  absorb,
  adoptLinks,
  hasUnlinkedAdoption,
  settleLinks,
  settleReconciled,
  taskTitle,
  tasksToCreate,
  type Fields,
  type Link,
  type NewTask,
  type TaskUpdate,
} from './links.ts';
import { annotate, readMap, tasksFollowedElsewhere, type Options, type StoredMap } from './store.ts';
import { find, type RemoteChange } from './tree.ts';

export type Google = <T>(url: string, init?: RequestInit) => Promise<T>;
/** Ce que Google a changé et que l'éditeur doit reprendre dans la carte. */
export type Pull = RemoteChange;
export type SyncResult = { enabled: boolean; waiting: number; lost: number; pulls: Pull[]; linked: string[] };
type GoogleTask = { id: string; title?: string; notes?: string; status?: string; updated?: string; deleted?: boolean };

const MAX_PER_PASS = 50;
const READ_EVERY_MS = 20_000;
/** Marge prise sur la dernière date vue : une modification enregistrée chez Google pendant la lecture n'est pas manquée. */
const CURSOR_MARGIN_MS = 5_000;
const readAt = new Map<string, number>();
/** Par carte et par liste, la plus récente modification vue chez Google : la lecture suivante ne demande que ce qui a changé depuis. */
const cursors = new Map<string, string>();
type Exchanged = { waiting: number; pulls: Pull[] };
/** `read: false` : ne lire Google que s'il faut créer ; pour les passes sans éditeur, qui n'ont personne à qui rendre ce qui a changé. */
export type SyncOptions = Options & { read?: boolean };
const running = new Map<string, Promise<SyncResult | null>>();
/** Par carte, une passe demandée pendant la passe en cours, et si l'un des demandeurs voulait qu'on relise Google. */
const again = new Map<string, { read: boolean }>();
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

/**
 * Pour chaque tâche, un appel à Google puis ce qu'il faut en garder dans les liens ; une tâche absente chez Google a son
 * propre sort. Chaque tâche est traitée seule : un refus n'empêche pas les autres, et le premier refus est relancé à la fin.
 */
async function eachTask<T extends { nodeId: string; taskId: string }>(
  mapId: string,
  items: T[],
  call: (item: T) => Promise<Partial<Link> | null>,
  absent: Partial<Link> | null,
  options: Options,
): Promise<void> {
  let failure: unknown;
  for (const item of items) {
    let change: Partial<Link> | null;
    try {
      change = await call(item);
    } catch (error) {
      if (!(error instanceof GoogleHttpError) || error.status !== 404) {
        failure ??= error;
        continue;
      }
      change = absent;
    }
    await annotate(mapId, ({ links }) => {
      const link = links[item.nodeId];
      if (link?.taskId !== item.taskId) return {};
      if (change) return { links: { ...links, [item.nodeId]: { ...link, ...change } } };
      const { [item.nodeId]: _gone, ...rest } = links;
      return { links: rest };
    }, options);
  }
  if (failure) throw failure;
}

function update(mapId: string, updates: TaskUpdate[], google: Google, options: Options): Promise<void> {
  return eachTask(
    mapId,
    updates,
    async ({ taskId, listId, nodeId: _nodeId, ...changed }) => {
      const { url, init } = taskUpdateRequest(listId, taskId, changed);
      const { updated } = await google<GoogleTask>(url, init);
      return { ...changed, ...(updated ? { updated } : {}) };
    },
    { lost: true },
    options,
  );
}

/**
 * Supprime chez Google les tâches dont le nœud a été retiré avec ce choix ; une tâche déjà absente est simplement oubliée.
 * Un refus de Google ne fait pas échouer la passe : la suppression est retentée à la suivante.
 */
async function purge(map: StoredMap, google: Google, options: Options): Promise<StoredMap> {
  const candidates = Object.entries(map.links).filter(([, link]) => link.doomed && link.detached);
  if (candidates.length === 0) return map;
  for (const [nodeId, { taskId, listId }] of candidates) {
    // Revérifié juste avant d'envoyer : le nœud a pu revenir entre-temps.
    const latest = await readMap(map.id, options);
    const current = latest?.links[nodeId];
    if (!latest || !current?.doomed || !current.detached || current.taskId !== taskId || find(latest.root, nodeId)) continue;
    // Une carte réimportée peut suivre la même tâche : elle n'est alors que détachée ici. Une carte illisible empêche de
    // le savoir : la suppression attend.
    const elsewhere = await tasksFollowedElsewhere(map.id, options);
    if (!elsewhere) continue;
    let gone = elsewhere.has(taskId);
    if (!gone) {
      try {
        const { url, init } = taskDeleteRequest(listId, taskId);
        await google(url, init);
        gone = true;
      } catch (error) {
        gone = error instanceof GoogleHttpError && error.status === 404;
        if (!gone) console.error(`Carte ${map.id} : suppression d'une tâche Google en échec :`, (error as Error).message);
      }
    }
    if (!gone) continue;
    await annotate(
      map.id,
      ({ links }) => {
        const link = links[nodeId];
        if (!link?.doomed || !link.detached || link.taskId !== taskId) return {};
        const { [nodeId]: _gone, ...rest } = links;
        return { links: rest };
      },
      options,
    );
  }
  return (await readMap(map.id, options)) ?? map;
}

function since(cursor: string | undefined): string | undefined {
  return cursor && new Date(Date.parse(cursor) - CURSOR_MARGIN_MS).toISOString();
}

/** Ce que Google dit d'une tâche, lu comme la carte l'écrit ; un titre vide n'est pas repris. */
function fieldsOf(task: GoogleTask): Fields {
  const title = taskTitle(task.title ?? '');
  return { ...(title ? { title } : {}), done: task.status === 'completed' };
}

async function exchange(map: StoredMap, batch: NewTask[], listTitle: string, google: Google, options: SyncOptions): Promise<Exchanged> {
  const now = options.now?.getTime() ?? Date.now();
  const followed = Object.keys(map.links).length > 0;
  const remote = new Map<string, Fields>();
  const gone = new Set<string>();
  const due = followed && options.read !== false && now - (readAt.get(map.id) ?? 0) >= READ_EVERY_MS;
  if (batch.length > 0 || due) {
    const record = (key: string, tasks: GoogleTask[]) => {
      const latest = tasks.reduce((max, task) => (task.updated && task.updated > max ? task.updated : max), cursors.get(key) ?? '');
      if (latest) cursors.set(key, latest);
      for (const task of tasks) {
        if (task.deleted) gone.add(task.id);
        else remote.set(task.id, fieldsOf(task));
      }
    };
    // Une tâche reprise reste dans sa liste : chaque liste où la carte a des tâches est relue, seulement pour ce qui a changé.
    const lists = new Set(Object.values(map.links).map((link) => link.listId));
    let home: { listId: string; existing: GoogleTask[] } | null = null;
    if (batch.length > 0) {
      // Créer demande toute la liste d'arrivée, pour reconnaître les tâches déjà créées.
      const known = Object.values(map.links).find((link) => !link.adopted)?.listId;
      home = await destination(known, listTitle, google);
      record(`${map.id}:${home.listId}`, home.existing);
      lists.delete(home.listId);
      // La liste retenue a disparu chez Google : inutile de la relire tout de suite.
      if (known && known !== home.listId) lists.delete(known);
    }
    for (const listId of lists) {
      const key = `${map.id}:${listId}`;
      const tasks = await tasksIn(listId, google, since(cursors.get(key))).catch((error) => {
        if (!(error instanceof GoogleHttpError) || error.status !== 404) throw error;
        // Liste supprimée chez Google : ses tâches ont disparu avec elle, la carte le signale.
        for (const link of Object.values(map.links)) if (link.listId === listId) gone.add(link.taskId);
        return null;
      });
      if (tasks) record(key, tasks);
    }
    readAt.set(map.id, now);
    if (home) await send(map, batch, home.listId, home.existing.filter((task) => !task.deleted), google, options);
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

/** Relie les nœuds repris d'une tâche existante ; si une autre carte est illisible, on attend de savoir qui la suit déjà. */
async function relinkAdopted(map: StoredMap, options: Options): Promise<StoredMap> {
  if (!hasUnlinkedAdoption(map.root, map.links)) return map;
  const elsewhere = await tasksFollowedElsewhere(map.id, options);
  if (!elsewhere) return map;
  return (await annotate(map.id, ({ root, links }) => ({ links: adoptLinks(links, root, elsewhere) }), options)) ?? map;
}

async function sync(id: string, listTitle: string, google: Google, options: SyncOptions): Promise<SyncResult | null> {
  const read = await readMap(id, options);
  if (!read) return null;
  const map = await relinkAdopted(read, options);
  const create = tasksToCreate(id, map.root, map.links);
  const batch = map.sendTasks ? create.slice(0, MAX_PER_PASS) : [];
  let exchanged: Exchanged = { waiting: 0, pulls: [] };
  let settled: StoredMap | null = null;
  try {
    if (map.sendTasks) {
      // Un envoi à la fois pour tout le serveur : deux cartes portant les mêmes nœuds (réimport) ne créent pas la même tâche en parallèle.
      const turn = sending.then(() => exchange(map, batch, listTitle, google, options));
      sending = turn.catch(() => undefined);
      exchanged = await turn;
    }
  } finally {
    settled = await annotate(id, (latest) => ({ links: settleLinks(latest.root, latest.links) }), options);
  }
  // Sous le même verrou que les envois : aucune autre carte ne relie une tâche pendant qu'on la supprime.
  const purged = settled && sending.then(() => purge(settled!, google, options));
  if (purged) sending = purged.catch(() => undefined);
  const latest = purged && (await purged);
  const status = latest ? taskStatus(latest.root, latest.links) : { linked: [], lost: 0 };
  return {
    linked: status.linked,
    enabled: map.sendTasks,
    waiting: create.length - batch.length + exchanged.waiting,
    lost: status.lost,
    pulls: exchanged.pulls,
  };
}

/** Une passe à la fois par carte ; une demande arrivée pendant une passe en déclenche une autre à la suite. */
export function syncTasks(id: string, listTitle: string, google: Google, options: SyncOptions = {}): Promise<SyncResult | null> {
  const current = running.get(id);
  if (current) {
    again.set(id, { read: Boolean(again.get(id)?.read) || options.read !== false });
    return current;
  }
  const run = (async () => {
    let result: SyncResult | null;
    let current: SyncOptions = options;
    for (;;) {
      result = await sync(id, listTitle, google, current);
      const next = again.get(id);
      if (!next) return result;
      again.delete(id);
      current = { ...options, read: next.read };
    }
  })().finally(() => {
    running.delete(id);
    again.delete(id);
  });
  running.set(id, run);
  return run;
}
