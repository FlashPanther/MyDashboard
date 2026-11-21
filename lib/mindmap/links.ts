import { TASK_TITLE_MAX } from '../google/taskWrites.ts';
import type { MapNode } from './tree.ts';

export type Link = {
  taskId: string;
  listId: string;
  /** Le nœud n'est plus une tâche : la tâche Google est gardée, et retrouvée si le nœud revient. */
  detached?: true;
  /** Ce qui a été envoyé à Google, et quand il l'a enregistré : la base pour comparer plus tard. */
  title?: string;
  done?: boolean;
  updated?: string;
};
export type Links = Record<string, Link>;
export type NewTask = { nodeId: string; title: string; notes: string; done: boolean };

const SEPARATOR = ' › ';

function titleOf(node: MapNode): string {
  return node.text.replace(/\s+/g, ' ').trim();
}

export function parseLinks(value: unknown): Links {
  const links: Links = {};
  if (typeof value !== 'object' || value === null) return links;
  for (const [nodeId, raw] of Object.entries(value)) {
    const { taskId, listId, detached, title, done, updated } = (raw ?? {}) as Record<string, unknown>;
    if (typeof taskId !== 'string' || !taskId || typeof listId !== 'string' || !listId) continue;
    links[nodeId] = {
      taskId,
      listId,
      ...(detached === true ? { detached } : {}),
      ...(typeof title === 'string' ? { title } : {}),
      ...(typeof done === 'boolean' ? { done } : {}),
      ...(typeof updated === 'string' ? { updated } : {}),
    };
  }
  return links;
}

export function tasksToCreate(root: MapNode, links: Links): NewTask[] {
  const create: NewTask[] = [];
  const visit = (node: MapNode, path: string[]) => {
    const title = titleOf(node);
    if (node.task && title && !links[node.id]) {
      create.push({ nodeId: node.id, title: title.slice(0, TASK_TITLE_MAX), notes: `Carte : ${path.join(SEPARATOR)}`, done: node.task.done });
    }
    for (const child of node.children) visit(child, [...path, title || '…']);
  };
  visit(root, []);
  return create;
}

export function settleLinks(root: MapNode, links: Links): Links {
  const tasks = new Set<string>();
  const visit = (node: MapNode) => {
    if (node.task) tasks.add(node.id);
    node.children.forEach(visit);
  };
  visit(root);
  return Object.fromEntries(
    Object.entries(links).map(([nodeId, { detached: _detached, ...link }]) => [
      nodeId,
      tasks.has(nodeId) ? link : { ...link, detached: true as const },
    ]),
  );
}
