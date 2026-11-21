'use client';

import { useState } from 'react';
import { config } from '@/dashboard.config';
import { Panel, Empty } from '@/components/Panel';
import { useEndpoint } from '@/lib/useEndpoint';
import { ListChecks } from 'lucide-react';
import { mutate } from 'swr';
import { taskAlert } from '@/lib/taskAlert';
import type { TaskItem } from '@/app/api/tasks/route';

const TASKS_URL = '/api/tasks';

type TasksPayload = { tasks: TaskItem[] };

/** Ce qu'une tache montre de son echeance : puce coloree, date a droite, detail en infobulle. */
function dueOf(task: TaskItem): { text: string; tone: string; dot: string } {
  if (task.overdue) return { text: 'en retard', tone: 'text-rose', dot: 'bg-rose' };
  if (task.dueToday) return { text: "aujourd'hui", tone: 'text-amber', dot: 'bg-amber' };
  const day = task.due ? new Date(task.due).toLocaleDateString(config.locale, { day: 'numeric', month: 'short' }) : '';
  return { text: day, tone: 'text-muted', dot: 'bg-muted/50' };
}

export function TasksWidget() {
  const { data, error, notConnected } = useEndpoint<TasksPayload>(TASKS_URL, config.refresh.tasks);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);

  // Une ecriture a la fois : SWR ne revalide pas apres deux mutations croisees, et un
  // double clic atteindrait la tache remontee sous le pointeur.
  async function finish(task: TaskItem) {
    setWriting(true);
    setChangeError(null);
    await mutate<TasksPayload>(
      TASKS_URL,
      async () => {
        const res = await fetch(`${TASKS_URL}/${encodeURIComponent(task.id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ listId: task.listId, done: true }),
        }).catch(() => null);
        if (!res?.ok) throw new Error((await res?.json().catch(() => null))?.error ?? 'La tâche n’a pas pu être modifiée.');
        return undefined;
      },
      {
        optimisticData: data && { ...data, tasks: data.tasks.filter((other) => other.id !== task.id) },
        populateCache: false,
        rollbackOnError: true,
      },
    ).catch((error: Error) => setChangeError(error.message));
    setWriting(false);
  }

  // Deja triees par l'API : en retard, puis du jour, puis par echeance.
  const tasks = data?.tasks ?? [];
  const pressing = tasks.filter((task) => task.overdue || task.dueToday);
  const upcoming = tasks.filter((task) => task.due && !task.overdue && !task.dueToday);

  return (
    <Panel
      title="Tâches"
      icon={ListChecks}
      alert={data && taskAlert(data.tasks)}
      grow
      href="https://tasks.google.com/"
      hrefLabel="Ouvrir Google Tasks"
      error={error}
      notConnected={notConnected}
    >
      <div className="flex h-[19rem] flex-col lg:h-full">
        {changeError && <p className="mb-1 shrink-0 text-[12px] text-rose">{changeError}</p>}
        {!data ? (
          <p className="font-mono text-sm text-muted">Chargement…</p>
        ) : (
          // Les lignes debordent de 4 px pour leur fond au survol : la marge est
          // portee par la zone qui defile, pour qu'elle n'ait rien a masquer.
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {pressing.length === 0 ? <Empty>Rien pour aujourd’hui.</Empty> : <TaskRows tasks={pressing} writing={writing} onFinish={finish} />}
            {upcoming.length > 0 && (
              <>
                <p className="eyebrow mt-3 mb-1.5">À venir</p>
                <TaskRows tasks={upcoming} writing={writing} onFinish={finish} />
              </>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

function TaskRows({ tasks, writing, onFinish }: { tasks: TaskItem[]; writing: boolean; onFinish: (task: TaskItem) => void }) {
  return (
    <ul className="space-y-1.5">
      {tasks.map((task) => {
        const due = dueOf(task);
        return (
          <li
            key={task.id}
            title={task.notes ?? task.title}
            className="group relative -mx-1 flex items-baseline gap-2.5 rounded-sm px-1 py-0.5 transition-colors hover:bg-panel-soft"
          >
            <button
              type="button"
              title="Marquer comme terminée"
              aria-label={`Marquer « ${task.label} » comme terminée`}
              disabled={writing}
              onClick={() => onFinish(task)}
              className="relative z-10 -m-1 shrink-0 rounded-full p-1 hover:bg-jade/30"
            >
              <span className={`block size-1.5 rounded-full ${due.dot}`} />
            </button>
            <a
              href={task.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-[13px] text-ink after:absolute after:inset-0 hover:underline"
            >
              {task.label}
            </a>
            {due.text && <span className={`shrink-0 font-mono text-[11px] ${due.tone}`}>{due.text}</span>}
          </li>
        );
      })}
    </ul>
  );
}
