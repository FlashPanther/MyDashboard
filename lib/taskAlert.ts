import type { TaskItem } from '@/app/api/tasks/route';
import type { PanelAlert } from '@/components/Panel';

type Flagged = Pick<TaskItem, 'overdue' | 'tags'>;

/** Taches en retard ou sans etiquette ; une tache dans les deux cas compte une fois. */
export function taskAlert(tasks: Flagged[]): PanelAlert | null {
  const late = tasks.filter((task) => task.overdue).length;
  const untagged = tasks.filter((task) => task.tags.length === 0).length;
  const count = tasks.filter((task) => task.overdue || task.tags.length === 0).length;
  if (count === 0) return null;
  const detail = [
    late && `${late} en retard`,
    untagged && `${untagged} sans #étiquette`,
  ]
    .filter(Boolean)
    .join(' · ');
  return { count, detail, severe: late > 0 };
}
