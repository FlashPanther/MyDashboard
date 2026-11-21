import type { TaskItem } from '@/app/api/tasks/route';

export function isPressing(task: Pick<TaskItem, 'overdue' | 'dueToday'>) {
  return task.overdue || task.dueToday;
}
