import { NextResponse } from 'next/server';
import { handle } from '@/lib/api';
import { googleFetch } from '@/lib/google/oauth';
import { parseTags } from '@/lib/tags';

export const dynamic = 'force-dynamic';

export type TaskItem = {
  id: string;
  title: string;
  /** Le titre sans ses « #etiquettes », pour l'affichage. */
  label: string;
  /** Les « #etiquettes » du titre, en minuscules (voir lib/tags.ts). */
  tags: string[];
  due: string | null;
  notes: string | null;
  list: string;
  overdue: boolean;
  dueToday: boolean;
  /** Page de la tâche dans Google Tasks. */
  url: string;
  /** Derniere modification : sert a remonter les plus oubliees. */
  updated: string | null;
};

export async function GET() {
  return handle(async () => {
    const lists = await googleFetch<{ items?: { id: string; title: string }[] }>(
      'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=10',
    );

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const all = await Promise.all(
      (lists.items ?? []).map(async (list) => {
        const params = new URLSearchParams({
          showCompleted: 'false',
          showHidden: 'false',
          maxResults: '50',
        });
        const data = await googleFetch<{
          items?: {
            id: string;
            title?: string;
            due?: string;
            notes?: string;
            status?: string;
            webViewLink?: string;
            updated?: string;
          }[];
        }>(`https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks?${params}`);

        return (data.items ?? [])
          .filter((task) => task.status !== 'completed' && task.title?.trim())
          .map<TaskItem>((task) => {
            const due = task.due ? new Date(task.due) : null;
            const title = task.title!.trim();
            return {
              id: task.id,
              title,
              ...parseTags(title),
              due: task.due ?? null,
              notes: task.notes ?? null,
              list: list.title,
              overdue: Boolean(due && due < startOfDay),
              dueToday: Boolean(due && due >= startOfDay && due <= endOfDay),
              url: task.webViewLink ?? 'https://tasks.google.com/',
              updated: task.updated ?? null,
            };
          });
      }),
    );

    // En retard d'abord, puis l'échéance du jour, puis le reste par date.
    const rank = (task: TaskItem) => (task.overdue ? 0 : task.dueToday ? 1 : task.due ? 2 : 3);
    const tasks = all
      .flat()
      .sort((a, b) => rank(a) - rank(b) || (a.due ?? '9999').localeCompare(b.due ?? '9999'));

    return { tasks, fetchedAt: new Date().toISOString() };
  });
}

/**
 * Cree une tache dans la liste par defaut. JSON exige : une page web ne peut
 * pas en envoyer ici sans une verification CORS a laquelle on ne repond pas.
 */
export async function POST(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'JSON attendu' }, { status: 415 });
  }
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 1024) : '';
  if (!title) return NextResponse.json({ error: 'Titre vide' }, { status: 400 });

  return handle(async () => {
    const task = await googleFetch<{ id: string }>(
      'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title }),
      },
    );
    return { id: task.id };
  });
}
