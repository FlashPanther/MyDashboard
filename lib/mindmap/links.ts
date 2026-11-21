import type { MapNode } from './tree.ts';

export type Link = { taskId: string; listId: string };
export type Links = Record<string, Link>;
export type NewTask = { nodeId: string; title: string; notes: string; done: boolean };
export type Plan = { create: NewTask[]; detach: string[] };

const TITLE_MAX = 1024;
const SEPARATOR = ' › ';

export function parseLinks(value: unknown): Links {
  const links: Links = {};
  if (typeof value !== 'object' || value === null) return links;
  for (const [nodeId, link] of Object.entries(value)) {
    const { taskId, listId } = (link ?? {}) as Partial<Link>;
    if (typeof taskId === 'string' && taskId && typeof listId === 'string' && listId) links[nodeId] = { taskId, listId };
  }
  return links;
}

export function planTasks(root: MapNode, links: Links): Plan {
  const create: NewTask[] = [];
  const tasks = new Set<string>();
  const visit = (node: MapNode, path: string[]) => {
    const title = node.text.replace(/\s+/g, ' ').trim();
    if (node.task && title) {
      tasks.add(node.id);
      if (!links[node.id]) {
        create.push({ nodeId: node.id, title: title.slice(0, TITLE_MAX), notes: `Carte : ${path.join(SEPARATOR)}`, done: node.task.done });
      }
    }
    for (const child of node.children) visit(child, [...path, title || '…']);
  };
  visit(root, []);
  return { create, detach: Object.keys(links).filter((nodeId) => !tasks.has(nodeId)) };
}

export function applyPlan(links: Links, created: Links, detached: string[]): Links {
  const next = { ...links, ...created };
  for (const nodeId of detached) delete next[nodeId];
  return next;
}
