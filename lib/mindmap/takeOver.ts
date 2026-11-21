import { newNode, parseDocument, type MapNode } from './tree.ts';

import type { TaskItem } from '../../app/api/tasks/route.ts';

export type OpenTask = Pick<TaskItem, 'id' | 'title' | 'list' | 'listId'>;

/**
 * Une carte qui reprend les tâches Google libres : une branche par liste, un nœud-tâche par tâche. Chaque nœud porte son
 * origine : le serveur le relie à sa tâche, qui reste dans sa liste, sans jamais rien créer chez Google.
 */
export function takeOverMap(tasks: readonly OpenTask[], followed: ReadonlySet<string>, newId: () => string = () => crypto.randomUUID()): MapNode | null {
  const free = tasks.filter((task) => !followed.has(task.id) && task.title.trim());
  if (free.length === 0) return null;
  const branches = new Map<string, MapNode>();
  for (const task of free) {
    const branch = branches.get(task.listId) ?? newNode(task.list || 'Sans liste', newId());
    branches.set(task.listId, branch);
    branch.children.push({ ...newNode(task.title, newId()), task: { done: false }, from: { taskId: task.id, listId: task.listId } });
  }
  const root = newNode('Mes tâches Google', newId());
  root.children = [...branches.values()];
  // Passe par la lecture d'un fichier : couleurs des branches et limites de taille, comme une carte importée.
  return parseDocument({ root });
}
