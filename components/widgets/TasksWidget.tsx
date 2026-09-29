'use client';

import { useState, type FormEvent } from 'react';
import { config } from '@/dashboard.config';
import { Panel, Empty } from '@/components/Panel';
import { useEndpoint } from '@/lib/useEndpoint';
import { useStoredChoice } from '@/lib/storage';
import { shortDate } from '@/lib/time';
import type { TaskItem } from '@/app/api/tasks/route';

type TasksPayload = { tasks: TaskItem[] };

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

const TABS = ['today', 'plan'] as const;

export function TasksWidget() {
  const { data, error, notConnected, refresh } = useEndpoint<TasksPayload>(
    '/api/tasks',
    config.refresh.tasks,
  );
  const [tab, setTab] = useStoredChoice('tasks-tab', TABS);

  // Deja triees par l'API : en retard, puis du jour, puis par echeance.
  const tasks = data?.tasks ?? [];
  const pressing = tasks.filter((task) => task.overdue || task.dueToday);
  const upcoming = tasks.filter((task) => task.due && !pressing.includes(task));
  // Les plus anciennes d'abord : ce sont celles qu'on a le plus surement oubliees.
  const undated = tasks
    .filter((task) => !task.due)
    .sort((a, b) => (a.updated ?? '').localeCompare(b.updated ?? ''));

  return (
    <Panel
      title="Tâches"
      grow
      href="https://tasks.google.com/"
      hrefLabel="Ouvrir Google Tasks"
      tabs={{
        label: 'Tâches',
        value: tab,
        onChange: setTab,
        items: [
          { key: 'today', label: 'Aujourd’hui', count: data && pressing.length },
          { key: 'plan', label: 'À planifier', count: data && undated.length },
        ],
      }}
      error={error}
      notConnected={notConnected}
    >
      <div className="flex h-[19rem] flex-col lg:h-full">
        {/* Une tache creee n'a pas d'echeance : on montre l'onglet ou elle arrive. */}
        <QuickAdd
          onCreated={() => {
            refresh();
            setTab('plan');
          }}
        />
        {!data ? (
          <p className="font-mono text-sm text-muted">Chargement…</p>
        ) : (
          // Les lignes debordent de 4 px pour leur fond au survol : la marge est
          // portee par la zone qui defile, pour qu'elle n'ait rien a masquer.
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {tab === 'today' && (
              <>
                {pressing.length === 0 ? <Empty>Rien pour aujourd’hui.</Empty> : <TaskList tasks={pressing} />}
                {/* Les taches datees plus tard n'ont plus d'autre place : elles suivent. */}
                {upcoming.length > 0 && (
                  <>
                    <p className="eyebrow mt-3 mb-1.5">À venir</p>
                    <TaskList tasks={upcoming} />
                  </>
                )}
              </>
            )}
            {tab === 'plan' &&
              (undated.length === 0 ? (
                <p className="py-1 font-mono text-[11px] text-jade">Tout est planifié.</p>
              ) : (
                <TaskList tasks={undated} />
              ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function TaskList({ tasks }: { tasks: TaskItem[] }) {
  return (
    <ul className="space-y-1.5">
      {tasks.map((task) => {
        const due = dueOf(task);
        return (
          <li
            key={task.id}
            title={due.title}
            className="relative -mx-1 flex items-baseline gap-2.5 rounded-sm px-1 py-0.5 transition-colors hover:bg-panel-soft"
          >
            <span className={`mt-1.5 shrink-0 rounded-full ${due.dot}`} />
            <a
              href={task.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-[13px] text-ink after:absolute after:inset-0 hover:underline"
            >
              {task.title}
            </a>
            {due.text && <span className={`shrink-0 font-mono text-[11px] ${due.tone}`}>{due.text}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Une ligne, Entree : la tache part dans la liste par defaut de Google Tasks. */
function QuickAdd({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; relink?: boolean } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = title.trim();
    if (!value || busy) return;
    setBusy(true);
    setProblem(null);
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: value }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) {
      setTitle('');
      onCreated();
    } else if (body?.scopeMissing) {
      setProblem({ text: 'Google n’autorise encore que la lecture des tâches.', relink: true });
    } else {
      setProblem({ text: body?.error ?? 'La tâche n’a pas pu être créée.' });
    }
  }

  return (
    <form onSubmit={submit} className="mb-2 shrink-0">
      <div className="flex items-center gap-2 border-b border-rule pb-1.5">
        <span aria-hidden className="font-mono text-[13px] text-muted">
          +
        </span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Nouvelle tâche, puis Entrée"
          aria-label="Nouvelle tâche"
          maxLength={1024}
          disabled={busy}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-muted focus:outline-none disabled:opacity-50"
        />
        {title.trim() && (
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 font-mono text-[11px] text-amber hover:underline disabled:opacity-50"
          >
            {busy ? '…' : 'Ajouter'}
          </button>
        )}
      </div>
      {problem && (
        <p className="mt-1 text-[12px] text-rose">
          {problem.text}{' '}
          {problem.relink && (
            <a href="/api/auth/google" className="text-amber underline-offset-2 hover:underline">
              Relier Google à nouveau
            </a>
          )}
        </p>
      )}
    </form>
  );
}
