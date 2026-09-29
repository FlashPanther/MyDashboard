'use client';

import { useState, type FormEvent } from 'react';
import { config } from '@/dashboard.config';
import { Panel, Empty } from '@/components/Panel';
import { useEndpoint } from '@/lib/useEndpoint';
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

export function TasksWidget() {
  const { data, error, notConnected, refresh } = useEndpoint<TasksPayload>(
    '/api/tasks',
    config.refresh.tasks,
  );

  const tasks = data?.tasks ?? [];
  const dated = tasks.filter((task) => task.due);
  // Les plus anciennes d'abord : ce sont celles qu'on a le plus surement oubliees.
  const undated = tasks
    .filter((task) => !task.due)
    .sort((a, b) => (a.updated ?? '').localeCompare(b.updated ?? ''));
  const pressing = dated.filter((task) => task.overdue || task.dueToday).length;

  return (
    <Panel
      title="Tâches"
      grow
      href="https://tasks.google.com/"
      hrefLabel="Ouvrir Google Tasks"
      meta={
        data ? (
          <>
            <span className={`font-semibold ${pressing === 0 ? 'text-jade' : 'text-amber'}`}>
              {pressing}
            </span>{' '}
            aujourd&rsquo;hui ·{' '}
            <span
              className={`font-semibold ${undated.length === 0 ? 'text-jade' : 'text-amber'}`}
            >
              {undated.length}
            </span>{' '}
            à planifier
          </>
        ) : null
      }
      error={error}
      notConnected={notConnected}
    >
      <div className="flex h-[19rem] flex-col lg:h-full">
        <QuickAdd onCreated={refresh} />
        {!data ? (
          <p className="font-mono text-sm text-muted">Chargement…</p>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {dated.length === 0 ? (
                <Empty>Aucune tâche datée.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {dated.slice(0, 8).map((task) => {
                    const due = dueLabel(task);
                    return (
                      <li
                        key={task.id}
                        title={task.notes ?? task.title}
                        className="relative -mx-1 flex items-baseline gap-2.5 rounded-sm px-1 py-0.5 transition-colors hover:bg-panel-soft"
                      >
                        <span
                          className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                            task.overdue ? 'bg-rose' : task.dueToday ? 'bg-amber' : 'bg-muted/50'
                          }`}
                        />
                        <a
                          href={task.url}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 flex-1 truncate text-[13px] text-ink after:absolute after:inset-0 hover:underline"
                        >
                          {task.title}
                        </a>
                        <span className={`shrink-0 font-mono text-[11px] ${due.tone}`}>
                          {due.text}
                        </span>
                      </li>
                    );
                  })}
                  {dated.length > 8 && (
                    <li className="pt-1 font-mono text-[11px] text-muted">
                      +{dated.length - 8} autres datées
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/*
             * Les taches sans echeance coulaient en bas de liste et n'etaient
             * jamais visibles, donc jamais planifiees. Elles ont leur bloc, en
             * bas, avec une puce creuse : rien n'est encore pose sur le calendrier.
             */}
            <div className="mt-2 shrink-0 border-t border-rule pt-2">
              {undated.length === 0 ? (
                <p className="font-mono text-[11px] text-jade">Tout est planifié.</p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="eyebrow">À planifier</span>
                    <span className="font-mono text-[10px] text-muted">
                      {undated.length} sans échéance
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {undated.slice(0, 3).map((task) => (
                      <li
                        key={task.id}
                        title={`Sans échéance${
                          task.updated ? ` · inchangée depuis le ${shortDate(task.updated)}` : ''
                        }`}
                        className="relative -mx-1 flex items-baseline gap-2.5 rounded-sm px-1 py-0.5 transition-colors hover:bg-panel-soft"
                      >
                        <span className="mt-1.5 size-2 shrink-0 rounded-full border border-muted" />
                        <a
                          href={task.url}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 flex-1 truncate text-[13px] text-ink after:absolute after:inset-0 hover:underline"
                        >
                          {task.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {undated.length > 3 && (
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      +{undated.length - 3} en attente d&rsquo;une date
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Panel>
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
