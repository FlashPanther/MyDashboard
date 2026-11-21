import { createHash } from 'node:crypto';
import { TASK_TITLE_MAX } from '../google/taskWrites.ts';
import type { MapNode } from './tree.ts';

export type Fields = { title?: string; done?: boolean };
export type Link = {
  taskId: string;
  listId: string;
  /** Le nœud n'est plus une tâche : la tâche Google est gardée, et retrouvée si le nœud revient. */
  detached?: true;
  /** La tâche n'existe plus chez Google : on ne la recrée pas et on n'y écrit plus. */
  lost?: true;
  /** Le nœud a été retiré avec le choix de supprimer aussi sa tâche chez Google. */
  doomed?: true;
  /** Le dernier état sur lequel la carte et Google étaient d'accord : un écart dit lequel des deux a changé. */
  title?: string;
  done?: boolean;
  updated?: string;
  /** Ce que Google a changé et que la carte n'a pas encore repris. */
  incoming?: Fields;
};
export type Links = Record<string, Link>;
export type TaskUpdate = { nodeId: string; taskId: string; listId: string } & Fields;
/** Pour un nœud lié : ce qui part vers Google, ce qui en revient, et ce sur quoi les deux sont déjà d'accord. */
export type Reconciled = { nodeId: string; taskId: string; listId: string; push: Fields; pull: Fields; agreed: Fields };
export type NewTask = { nodeId: string; marker: string; title: string; notes: string; done: boolean };

const SEPARATOR = ' › ';
const PATH_MAX = 4000;
const REFERENCE = 'Réf. carte : ';
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function titleOf(node: MapNode): string {
  return node.text.replace(/\s+/g, ' ').trim();
}

/** Un titre tel que la carte l'envoie à Google : espaces réduits, coupé à la limite. Sert aussi à lire les titres de Google. */
export function taskTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, TASK_TITLE_MAX);
}

function taskTitleOf(node: MapNode): string {
  return taskTitle(node.text);
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

function parseFields(value: unknown): Fields {
  const { title, done } = (value ?? {}) as Record<string, unknown>;
  return { ...(typeof title === 'string' ? { title } : {}), ...(typeof done === 'boolean' ? { done } : {}) };
}

export function parseLinks(value: unknown): Links {
  const links: Links = {};
  if (typeof value !== 'object' || value === null) return links;
  for (const [nodeId, raw] of Object.entries(value)) {
    const { taskId, listId, detached, lost, doomed, updated, incoming } = (raw ?? {}) as Record<string, unknown>;
    const pending = parseFields(incoming);
    if (typeof taskId !== 'string' || !taskId || typeof listId !== 'string' || !listId) continue;
    links[nodeId] = {
      taskId,
      listId,
      ...(detached === true ? { detached } : {}),
      ...(lost === true ? { lost } : {}),
      ...(doomed === true ? { doomed } : {}),
      ...parseFields(raw),
      ...(typeof updated === 'string' ? { updated } : {}),
      ...(Object.keys(pending).length > 0 ? { incoming: pending } : {}),
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

const FIELDS = ['title', 'done'] as const;

/**
 * Compare, champ par champ, la carte, le dernier état commun et Google (`remote`, ou à défaut ce qui en était déjà
 * arrivé). Carte seule changée : on pousse. Google seul changé : on tire. Les deux : la carte l'emporte.
 */
export function reconcile(root: MapNode, links: Links, remote: ReadonlyMap<string, Fields> = new Map()): Reconciled[] {
  const result: Reconciled[] = [];
  const visit = (node: MapNode) => {
    const link = links[node.id];
    const title = taskTitleOf(node);
    if (node.task && title && link && !link.detached && !link.lost && link.title !== undefined) {
      const mine: Fields = { title, done: node.task.done };
      const theirs = { ...link.incoming, ...remote.get(link.taskId) };
      const entry: Reconciled = { nodeId: node.id, taskId: link.taskId, listId: link.listId, push: {}, pull: {}, agreed: {} };
      for (const field of FIELDS) {
        const carte = mine[field];
        // La carte qui montre ce que Google avait envoyé n'a rien changé elle-même : c'est Google qui décide encore.
        const base = link.incoming?.[field] !== undefined && carte === link.incoming[field] ? carte : link[field];
        const google = theirs[field] ?? link[field];
        if (carte === google) {
          if (carte !== link[field]) Object.assign(entry.agreed, { [field]: carte });
        } else if (carte === base) Object.assign(entry.pull, { [field]: google });
        else Object.assign(entry.push, { [field]: carte });
      }
      result.push(entry);
    }
    node.children.forEach(visit);
  };
  visit(root);
  return result;
}

/** Range dans les liens ce que le rapprochement a établi : l'accord devient la base, ce qui vient de Google attend la carte. */
export function settleReconciled(links: Links, plan: Reconciled[]): Links {
  const next = { ...links };
  for (const { nodeId, taskId, agreed, pull } of plan) {
    const { incoming: _incoming, ...link } = next[nodeId] ?? {};
    if (link.taskId !== taskId) continue;
    next[nodeId] = { ...(link as Link), ...agreed, ...(Object.keys(pull).length > 0 ? { incoming: pull } : {}) };
  }
  return next;
}

/**
 * Ce que la lecture de Google apprend aux liens, avant tout rapprochement : une tâche supprimée est perdue (et ce qui en
 * était arrivé ne vaut plus), une tâche revue redevient suivie, et ce qui change sur un nœud détaché attend son retour.
 */
export function absorb(links: Links, remote: ReadonlyMap<string, Fields>, gone: ReadonlySet<string>): Links {
  return Object.fromEntries(
    Object.entries(links).map(([nodeId, link]): [string, Link] => {
      if (gone.has(link.taskId)) {
        const { incoming: _incoming, ...rest } = link;
        return [nodeId, { ...rest, lost: true }];
      }
      const fields = remote.get(link.taskId);
      if (!fields) return [nodeId, link];
      const { lost: _lost, ...alive } = link;
      if (!alive.detached) return [nodeId, alive];
      const pending: Fields = { ...alive.incoming };
      for (const field of FIELDS) {
        if (fields[field] === undefined) continue;
        // Google revenu à la base pendant le détachement : il n'y a plus rien à reprendre.
        if (fields[field] === alive[field]) delete pending[field];
        else Object.assign(pending, { [field]: fields[field] });
      }
      const { incoming: _previous, ...rest } = alive;
      return [nodeId, { ...rest, ...(Object.keys(pending).length > 0 ? { incoming: pending } : {}) }];
    }),
  );
}

/** Les nœuds-tâches reliés à une tâche Google qu'on suit encore, et le nombre de ceux dont la tâche a disparu. */
export function taskStatus(root: MapNode, links: Links): { linked: string[]; lost: number } {
  const linked: string[] = [];
  let lost = 0;
  const visit = (node: MapNode) => {
    const link = node.task ? links[node.id] : undefined;
    if (link?.lost) lost += 1;
    else if (link && !link.detached) linked.push(node.id);
    node.children.forEach(visit);
  };
  visit(root);
  return { linked, lost };
}

/** À l'enregistrement : les nœuds retirés avec le choix de supprimer aussi leur tâche Google sont marqués. */
export function doom(links: Links, root: MapNode, ids: readonly string[]): Links {
  const present = new Set<string>();
  const visit = (node: MapNode) => {
    present.add(node.id);
    node.children.forEach(visit);
  };
  visit(root);
  const next = { ...links };
  for (const id of ids) if (next[id] && !present.has(id)) next[id] = { ...next[id], doomed: true };
  return next;
}

export function settleLinks(root: MapNode, links: Links): Links {
  const tasks = new Set<string>();
  const visit = (node: MapNode) => {
    if (node.task) tasks.add(node.id);
    node.children.forEach(visit);
  };
  visit(root);
  return Object.fromEntries(
    Object.entries(links).map(([nodeId, { detached: _detached, doomed, ...link }]) => [
      nodeId,
      // Un nœud revenu dans la carte (annulation) n'est plus à supprimer chez Google.
      tasks.has(nodeId) ? link : { ...link, detached: true as const, ...(doomed ? { doomed } : {}) },
    ]),
  );
}
