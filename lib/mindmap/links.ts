import { createHash } from 'node:crypto';
import { TASK_TITLE_MAX } from '../google/taskWrites.ts';
import type { MapNode } from './tree.ts';

export type Link = {
  taskId: string;
  listId: string;
  /** Le nœud n'est plus une tâche : la tâche Google est gardée, et retrouvée si le nœud revient. */
  detached?: true;
  /** La tâche n'existe plus chez Google : on ne la recrée pas et on n'y écrit plus. */
  lost?: true;
  /** Le dernier état sur lequel la carte et Google étaient d'accord : un écart dit lequel des deux a changé. */
  title?: string;
  done?: boolean;
  updated?: string;
};
export type Links = Record<string, Link>;
export type TaskUpdate = { nodeId: string; taskId: string; listId: string; title?: string; done?: boolean };
export type NewTask = { nodeId: string; marker: string; title: string; notes: string; done: boolean };

const SEPARATOR = ' › ';
const PATH_MAX = 4000;
const REFERENCE = 'Réf. carte : ';
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function titleOf(node: MapNode): string {
  return node.text.replace(/\s+/g, ' ').trim();
}

function taskTitleOf(node: MapNode): string {
  return titleOf(node).slice(0, TASK_TITLE_MAX);
}

/** Ce qui identifie le nœud dans le détail de sa tâche Google : un identifiant fait main n'est unique que dans sa carte. */
function markerOf(mapId: string, nodeId: string): string {
  if (UUID.test(nodeId)) return nodeId;
  return `${mapId}/${createHash('sha256').update(nodeId).digest('hex').slice(0, 16)}`;
}

export function markerIn(notes: string | undefined): string | null {
  const line = notes
    ?.split('\n')
    .filter((each) => each.startsWith(REFERENCE))
    .at(-1);
  return line ? line.slice(REFERENCE.length).trim() : null;
}

export function parseLinks(value: unknown): Links {
  const links: Links = {};
  if (typeof value !== 'object' || value === null) return links;
  for (const [nodeId, raw] of Object.entries(value)) {
    const { taskId, listId, detached, lost, title, done, updated } = (raw ?? {}) as Record<string, unknown>;
    if (typeof taskId !== 'string' || !taskId || typeof listId !== 'string' || !listId) continue;
    links[nodeId] = {
      taskId,
      listId,
      ...(detached === true ? { detached } : {}),
      ...(lost === true ? { lost } : {}),
      ...(typeof title === 'string' ? { title } : {}),
      ...(typeof done === 'boolean' ? { done } : {}),
      ...(typeof updated === 'string' ? { updated } : {}),
    };
  }
  return links;
}

export function tasksToCreate(mapId: string, root: MapNode, links: Links): NewTask[] {
  const create: NewTask[] = [];
  const visit = (node: MapNode, path: string[]) => {
    const title = titleOf(node);
    if (node.task && title && !links[node.id]) {
      const marker = markerOf(mapId, node.id);
      const where = `Carte : ${path.join(SEPARATOR)}`.slice(0, PATH_MAX);
      create.push({ nodeId: node.id, marker, title: taskTitleOf(node), notes: `${where}\n\n${REFERENCE}${marker}`, done: node.task.done });
    }
    for (const child of node.children) visit(child, [...path, title || '…']);
  };
  visit(root, []);
  return create;
}

/** Pour chaque tâche liée, ce qui a changé dans la carte depuis le dernier état commun, et rien d'autre. */
export function tasksToUpdate(root: MapNode, links: Links): TaskUpdate[] {
  const updates: TaskUpdate[] = [];
  const visit = (node: MapNode) => {
    const link = links[node.id];
    const title = taskTitleOf(node);
    const followed = link && !link.detached && !link.lost && link.title !== undefined;
    if (node.task && title && followed) {
      const changed = {
        ...(link.title === title ? {} : { title }),
        ...(link.done === node.task.done ? {} : { done: node.task.done }),
      };
      if (Object.keys(changed).length > 0) updates.push({ nodeId: node.id, taskId: link.taskId, listId: link.listId, ...changed });
    }
    node.children.forEach(visit);
  };
  visit(root);
  return updates;
}

/** Les nœuds-tâches dont la tâche Google a disparu. */
export function lostTasks(root: MapNode, links: Links): number {
  let lost = 0;
  const visit = (node: MapNode) => {
    if (node.task && links[node.id]?.lost) lost += 1;
    node.children.forEach(visit);
  };
  visit(root);
  return lost;
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
