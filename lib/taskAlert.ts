import type { TaskItem } from '@/app/api/tasks/route';
import type { PanelAlert } from '@/components/Panel';

/** Taches en retard : le reste se range dans les cartes. */
export function taskAlert(tasks: Pick<TaskItem, 'overdue'>[]): PanelAlert | null {
  const late = tasks.filter((task) => task.overdue).length;
  return late === 0 ? null : { count: late, detail: `${late} en retard`, severe: true };
}
