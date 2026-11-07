import type { TaskItem, TaskList } from '@/app/api/tasks/route';
import { isLater } from './tags.ts';

export type ListBranch = {
  id: string;
  title: string;
  /** Les tâches à montrer d'emblée, dans l'ordre reçu (en retard, du jour, datées, puis sans date). */
  tasks: TaskItem[];
  /** Les tâches `#plustard` sans échéance pressante, repliées par défaut. */
  later: TaskItem[];
  pressing: number;
};

export function isPressing(task: Pick<TaskItem, 'overdue' | 'dueToday'>) {
  return task.overdue || task.dueToday;
}

/**
 * Une branche par liste Google. Les listes qui ont du retard ou du travail du
 * jour passent devant, puis les plus chargées ; l'ordre de Google départage.
 */
export function branches(lists: TaskList[], tasks: TaskItem[], { keepEmpty = true } = {}): ListBranch[] {
  const byList = new Map(
    lists.map((list): [string, ListBranch] => [list.id, { id: list.id, title: list.title, tasks: [], later: [], pressing: 0 }]),
  );
  for (const task of tasks) {
    const branch = byList.get(task.listId);
    if (!branch) continue;
    const pressing = isPressing(task);
    if (isLater(task) && !pressing) branch.later.push(task);
    else {
      branch.tasks.push(task);
      if (pressing) branch.pressing += 1;
    }
  }
  return [...byList.values()]
    .filter((branch) => keepEmpty || branch.tasks.length + branch.later.length > 0)
    .sort((a, b) => b.pressing - a.pressing || b.tasks.length - a.tasks.length);
}
