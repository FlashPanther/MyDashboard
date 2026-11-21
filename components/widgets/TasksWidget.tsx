'use client';

import { useState } from 'react';
import { config } from '@/dashboard.config';
import { Panel, Empty } from '@/components/Panel';
import { useEndpoint } from '@/lib/useEndpoint';
import { ListChecks } from 'lucide-react';
import { mutate } from 'swr';
import { taskAlert } from '@/lib/taskAlert';
import { shortDate } from '@/lib/time';
import type { TaskItem, TaskList } from '@/app/api/tasks/route';

const TASKS_URL = '/api/tasks';

type TasksPayload = { tasks: TaskItem[]; lists: TaskList[] };

async function send(url: string, method: 'PATCH', payload: object) {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => null);
  return { ok: Boolean(res?.ok), body: await res?.json().catch(() => ({})) };
}

/**
 * Ce qu'une tache montre de son echeance : puce (pleine et coloree si datee,
 * creuse si rien n'est encore pose sur le calendrier), date a droite, infobulle.
 */
function dueOf(task: TaskItem): { text: string; tone: string; dot: string; title: string } {
  const dated = (text: string, tone: string, dot: string) => ({
    text,
    tone,
    dot: `size-1.5 ${dot}`,
    title: task.notes ?? task.title,
  });
  if (task.overdue) return dated('en retard', 'text-rose', 'bg-rose');
  if (task.dueToday) return dated("aujourd'hui", 'text-amber', 'bg-amber');
  if (task.due) {
    const day = new Date(task.due).toLocaleDateString(config.locale, { day: 'numeric', month: 'short' });
    return dated(day, 'text-muted', 'bg-muted/50');
  }
  return {
    text: '',
    tone: '',
    dot: 'size-2 border border-muted',
    title: `Sans échéance${task.updated ? ` · inchangée depuis le ${shortDate(task.updated)}` : ''}`,
  };
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
        const { ok, body } = await send(`${TASKS_URL}/${encodeURIComponent(task.id)}`, 'PATCH', { listId: task.listId, done: true });
        if (!ok) throw new Error(body?.error ?? 'La tâche n’a pas pu être modifiée.');
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
  const upcoming = tasks.filter((task) => task.due && !pressing.includes(task));

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
            title={due.title}
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
              <span className={`block rounded-full ${due.dot}`} />
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
