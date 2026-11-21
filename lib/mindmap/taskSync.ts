import { allPages } from '../google/allPages.ts';
import { newTaskListRequest, newTaskRequest, taskListsRequest } from '../google/taskWrites.ts';
import { settleLinks, tasksToCreate, type Links, type NewTask } from './links.ts';
import { readMap, relink, type Options } from './store.ts';

export type Google = <T>(url: string, init?: RequestInit) => Promise<T>;
export type SyncResult = { waiting: number };

const MAX_CREATIONS = 50;
const running = new Map<string, Promise<SyncResult | null>>();

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

async function createIn(listId: string, task: NewTask, google: Google): Promise<Links[string]> {
  const { url, init } = newTaskRequest(task.title, listId, task);
  const { id, updated } = await google<{ id: string; updated?: string }>(url, init);
  return { taskId: id, listId, title: task.title, done: task.done, ...(updated ? { updated } : {}) };
}

async function createAll(batch: NewTask[], known: string | undefined, listTitle: string, google: Google, created: Links) {
  let listId = known ?? (await listNamed(listTitle, google));
  for (const [index, task] of batch.entries()) {
    try {
      created[task.nodeId] = await createIn(listId, task, google);
    } catch (error) {
      // La liste retenue a pu être supprimée ou renommée chez Google : on la recherche une fois avant d'abandonner.
      if (index > 0 || !known) throw error;
      listId = await listNamed(listTitle, google);
      created[task.nodeId] = await createIn(listId, task, google);
    }
  }
}

async function sync(id: string, listTitle: string, google: Google, options: Options): Promise<SyncResult | null> {
  const map = await readMap(id, options);
  if (!map) return null;
  const create = tasksToCreate(map.root, map.links);
  const batch = create.slice(0, MAX_CREATIONS);
  const created: Links = {};
  try {
    if (batch.length > 0) await createAll(batch, Object.values(map.links)[0]?.listId, listTitle, google, created);
  } finally {
    // Même si Google lâche en route, les tâches déjà créées gardent leur lien : elles ne seront pas créées deux fois.
    const settled = JSON.stringify(settleLinks(map.root, map.links)) === JSON.stringify(map.links);
    if (Object.keys(created).length > 0 || !settled) {
      await relink(id, (latest) => settleLinks(latest.root, { ...latest.links, ...created }), options);
    }
  }
  return { waiting: create.length - batch.length };
}

export function syncTasks(id: string, listTitle: string, google: Google, options: Options = {}): Promise<SyncResult | null> {
  const current = running.get(id);
  if (current) return current;
  const run = sync(id, listTitle, google, options).finally(() => running.delete(id));
  running.set(id, run);
  return run;
}
