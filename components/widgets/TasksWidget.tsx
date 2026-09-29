'use client';

import { useState, type FormEvent } from 'react';
import { config } from '@/dashboard.config';
import { Panel, Empty } from '@/components/Panel';
import { PanelTabs } from '@/components/PanelTabs';
import { useEndpoint } from '@/lib/useEndpoint';
import { useStoredChoice } from '@/lib/storage';
import { shortDate } from '@/lib/time';
import type { TaskItem } from '@/app/api/tasks/route';

type TasksPayload = { tasks: TaskItem[] };

function dueLabel(task: TaskItem): { text: string; tone: string } {
  if (task.overdue) return { text: 'en retard', tone: 'text-rose' };
  if (task.dueToday) return { text: "aujourd'hui", tone: 'text-amber' };
  if (task.due)
    return {
      text: new Date(task.due).toLocaleDateString(config.locale, { day: 'numeric', month: 'short' }),
      tone: 'text-muted',
    };
  return { text: '', tone: 'text-muted' };
}

const TABS = ['today', 'plan'] as const;

export function TasksWidget() {
  const { data, error, notConnected, refresh } = useEndpoint<TasksPayload>(
    '/api/tasks',
    config.refresh.tasks,
  );
  const [tab, setTab] = useStoredChoice('tasks-tab', TABS);

  const tasks = data?.tasks ?? [];
  // Deja triees par l'API : en retard, puis du jour, puis par echeance.
  const pressing = tasks.filter((task) => task.overdue || task.dueToday);
  const upcoming = tasks.filter((task) => task.due && !task.overdue && !task.dueToday);
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
      meta={
        <PanelTabs
          label="Tâches"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'today', label: 'Aujourd’hui', count: data ? pressing.length : undefined },
            { key: 'plan', label: 'À planifier', count: data ? undated.length : undefined },
          ]}
        />
      }
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
          <div role="tabpanel" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            {tab === 'today' ? (
              <>
                {pressing.length === 0 ? (
                  <Empty>Rien pour aujourd’hui.</Empty>
                ) : (
                  <TaskList tasks={pressing} />
                )}
                {/* Les taches datees plus tard n'ont plus d'autre place : elles suivent. */}
                {upcoming.length > 0 && (
                  <>
                    <p className="eyebrow mt-3 mb-1.5">À venir</p>
                    <TaskList tasks={upcoming} />
                  </>
                )}
              </>
            ) : undated.length === 0 ? (
              <p className="py-1 font-mono text-[11px] text-jade">Tout est planifié.</p>
            ) : (
              <TaskList tasks={undated} />
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

/**
 * Taches datees : puce pleine (rose en retard, ambre du jour) et echeance a
 * droite. Sans echeance : puce creuse, rien n'est encore pose sur le calendrier.
 */
function TaskList({ tasks }: { tasks: TaskItem[] }) {
  return (
    <ul className="space-y-1.5">
      {tasks.map((task) => {
        const due = dueLabel(task);
        return (
          <li
            key={task.id}
            title={
              task.due
                ? (task.notes ?? task.title)
                : `Sans échéance${task.updated ? ` · inchangée depuis le ${shortDate(task.updated)}` : ''}`
            }
            className="relative -mx-1 flex items-baseline gap-2.5 rounded-sm px-1 py-0.5 transition-colors hover:bg-panel-soft"
          >
            {task.due ? (
              <span
                className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                  task.overdue ? 'bg-rose' : task.dueToday ? 'bg-amber' : 'bg-muted/50'
                }`}
              />
            ) : (
              <span className="mt-1.5 size-2 shrink-0 rounded-full border border-muted" />
            )}
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
