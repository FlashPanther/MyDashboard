import { allPages } from '../google/allPages.ts';
import { newTaskListRequest, newTaskRequest, taskListsRequest } from '../google/taskWrites.ts';
import { applyPlan, planTasks, type Links } from './links.ts';
import { readMap, relink } from './store.ts';

export type Google = <T>(url: string, init?: RequestInit) => Promise<T>;
export type SyncResult = { created: number; detached: number; waiting: number };

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

async function sync(id: string, listTitle: string, google: Google, dir?: string): Promise<SyncResult | null> {
  const map = await readMap(id, { dir });
  if (!map) return null;
  const plan = planTasks(map.root, map.links);
  const batch = plan.create.slice(0, MAX_CREATIONS);
  const created: Links = {};
  let detached = plan.detach.length;
  try {
    if (batch.length > 0) {
      const listId = await listNamed(listTitle, google);
      for (const task of batch) {
        const { url, init } = newTaskRequest(task.title, listId, task);
        created[task.nodeId] = { taskId: (await google<{ id: string }>(url, init)).id, listId };
      }
    }
  } finally {
    // Même si Google lâche en route, les tâches déjà créées gardent leur lien : elles ne seront pas créées deux fois.
    if (Object.keys(created).length > 0 || plan.detach.length > 0) {
      await relink(
        id,
        (latest) => {
          const merged = { ...latest.links, ...created };
          const gone = planTasks(latest.root, merged).detach;
          detached = gone.length;
          return applyPlan(merged, {}, gone);
        },
        { dir },
      );
    }
  }
  return { created: batch.length, detached, waiting: plan.create.length - batch.length };
}

export function syncTasks(id: string, listTitle: string, google: Google, dir?: string): Promise<SyncResult | null> {
  const current = running.get(id);
  if (current) return current;
  const run = sync(id, listTitle, google, dir).finally(() => running.delete(id));
  running.set(id, run);
  return run;
}
