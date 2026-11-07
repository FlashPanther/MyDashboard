import type { TaskItem, TaskList } from '@/app/api/tasks/route';

export const LATER_TAG = 'plustard';

export type ListBranch = {
  id: string;
  title: string;
  /** Les tâches à montrer d'emblée, dans l'ordre reçu (en retard, du jour, datées, puis sans date). */
  tasks: TaskItem[];
  /** Les tâches `#plustard`, repliées par défaut. */
  later: TaskItem[];
  pressing: number;
};

/**
 * Une branche par liste Google, listes vides comprises pour pouvoir y ajouter.
 * Les listes qui ont du retard ou du travail du jour passent devant, puis les
 * plus chargées ; l'ordre de Google départage.
 */
export function branches(lists: TaskList[], tasks: TaskItem[]): ListBranch[] {
  return lists
    .map((list, index) => {
      const own = tasks.filter((task) => task.listId === list.id);
      const later = own.filter((task) => task.tags.includes(LATER_TAG));
      const shown = own.filter((task) => !later.includes(task));
      return {
        id: list.id,
        title: list.title,
        tasks: shown,
        later,
        pressing: shown.filter((task) => task.overdue || task.dueToday).length,
        index,
      };
    })
    .sort((a, b) => b.pressing - a.pressing || b.tasks.length - a.tasks.length || a.index - b.index)
    .map(({ index: _index, ...branch }) => branch);
}
