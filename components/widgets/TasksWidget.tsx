'use client';

import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { config } from '@/dashboard.config';
import { Panel, Empty, CHIP } from '@/components/Panel';
import { useEndpoint } from '@/lib/useEndpoint';
import { useStored, useStoredChoice } from '@/lib/storage';
import { ListChecks } from 'lucide-react';
import { mutate } from 'swr';
import { tagColor } from '@/lib/tags';
import { taskAlert } from '@/lib/taskAlert';
import { shortDate } from '@/lib/time';
import { branches, type ListBranch } from '@/lib/taskMap';
import type { TaskItem, TaskList } from '@/app/api/tasks/route';

const TASKS_URL = '/api/tasks';

type TasksPayload = { tasks: TaskItem[]; lists: TaskList[] };

async function send(url: string, method: 'POST' | 'PATCH', payload: object) {
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

const TABS = ['today', 'plan', 'map'] as const;

export function TasksWidget() {
  const { data, error, notConnected, refresh } = useEndpoint<TasksPayload>(
    TASKS_URL,
    config.refresh.tasks,
  );
  const [tab, setTab] = useStoredChoice('tasks-tab', TABS);
  const [tag, chooseTag] = useStored('tasks-tag');
  const [changeError, setChangeError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [chosenList, setChosenList] = useState<string | null>(null);
  const [openLater, setOpenLater] = useState<string[]>([]);
  const addInput = useRef<HTMLInputElement>(null);
  const lists = data?.lists ?? [];

  // Une ecriture a la fois : SWR ne revalide pas apres deux mutations croisees, et un
  // double clic atteindrait la tache remontee sous le pointeur.
  async function change(task: TaskItem, payload: { done: true } | { moveTo: string }) {
    setWriting(true);
    setChangeError(null);
    await mutate<TasksPayload>(
      TASKS_URL,
      async () => {
        const { ok, body } = await send(`${TASKS_URL}/${encodeURIComponent(task.id)}`, 'PATCH', {
          listId: task.listId,
          ...payload,
        });
        if (!ok) {
          throw new Error(
            'moveTo' in payload
              ? 'Google a refusé le déplacement : une tâche récurrente ne peut pas changer de liste.'
              : (body?.error ?? 'La tâche n’a pas pu être modifiée.'),
          );
        }
        return undefined;
      },
      {
        optimisticData:
          'done' in payload && data
            ? { ...data, tasks: data.tasks.filter((other) => other.id !== task.id) }
            : undefined,
        populateCache: false,
        rollbackOnError: true,
      },
    ).catch((error: Error) => setChangeError(error.message));
    setWriting(false);
  }

  const row = {
    lists,
    writing,
    onTag: chooseTag,
    onFinish: (task: TaskItem) => change(task, { done: true }),
    onMove: (task: TaskItem, moveTo: string) => change(task, { moveTo }),
  };

  // Les etiquettes en usage, les plus frequentes d'abord.
  const counts = new Map<string, number>();
  for (const task of data?.tasks ?? []) for (const t of task.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const tags = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
  const active = tag && counts.has(tag) ? tag : null;
  // Une etiquette retenue qui n'existe plus est oubliee a l'arrivee des donnees :
  // elle ne doit pas se remettre a filtrer d'elle-meme le jour ou une tache la reprend.
  useEffect(() => {
    if (data && tag && !data.tasks.some((task) => task.tags.includes(tag))) chooseTag(null);
    // Seulement quand les taches changent.
  }, [data]);

  // Deja triees par l'API : en retard, puis du jour, puis par echeance.
  const tasks = (data?.tasks ?? []).filter((task) => !active || task.tags.includes(active));
  const pressing = tasks.filter((task) => task.overdue || task.dueToday);
  const upcoming = tasks.filter((task) => task.due && !pressing.includes(task));
  // Les plus anciennes d'abord : ce sont celles qu'on a le plus surement oubliees.
  const undated = tasks
    .filter((task) => !task.due)
    .sort((a, b) => (a.updated ?? '').localeCompare(b.updated ?? ''));
  const map = branches(lists, tasks).filter((branch) => !active || branch.tasks.length + branch.later.length > 0);

  function addTo(listId: string) {
    setChosenList(listId);
    addInput.current?.focus();
  }

  return (
    <Panel
      title="Tâches"
      icon={ListChecks}
      alert={data && taskAlert(data.tasks)}
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
          { key: 'map', label: 'Carte', count: data && map.reduce((sum, branch) => sum + branch.tasks.length, 0) },
        ],
      }}
      error={error}
      notConnected={notConnected}
    >
      <div className="flex h-[19rem] flex-col lg:h-full">
        {/* Une tache creee n'a pas d'echeance : on montre l'onglet ou elle arrive. */}
        <QuickAdd
          lists={lists}
          listId={chosenList ?? lists[0]?.id}
          onChooseList={setChosenList}
          inputRef={addInput}
          onCreated={() => {
            refresh();
            if (tab !== 'map') setTab('plan');
          }}
        />
        {changeError && <p className="mb-1 shrink-0 text-[12px] text-rose">{changeError}</p>}
        {tags.length > 0 && <TagFilter tags={tags} active={active} onChange={chooseTag} />}
        {!data ? (
          <p className="font-mono text-sm text-muted">Chargement…</p>
        ) : (
          // Les lignes debordent de 4 px pour leur fond au survol : la marge est
          // portee par la zone qui defile, pour qu'elle n'ait rien a masquer.
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {tab === 'today' && (
              <>
                {pressing.length === 0 ? <Empty>{active ? `Aucune tâche #${active} pour aujourd’hui.` : 'Rien pour aujourd’hui.'}</Empty> : <TaskRows tasks={pressing} {...row} />}
                {/* Les taches datees plus tard n'ont plus d'autre place : elles suivent. */}
                {upcoming.length > 0 && (
                  <>
                    <p className="eyebrow mt-3 mb-1.5">À venir</p>
                    <TaskRows tasks={upcoming} {...row} />
                  </>
                )}
              </>
            )}
            {tab === 'plan' && undated.length > 0 && <TaskRows tasks={undated} {...row} />}
            {tab === 'plan' && undated.length === 0 && active && (
              <Empty>Aucune tâche #{active} à planifier.</Empty>
            )}
            {tab === 'plan' && undated.length === 0 && !active && (
              <p className="py-1 font-mono text-[11px] text-jade">Tout est planifié.</p>
            )}
            {tab === 'map' && (
              <ListMap
                map={map}
                openLater={openLater}
                onToggleLater={(id) =>
                  setOpenLater((open) => (open.includes(id) ? open.filter((other) => other !== id) : [...open, id]))
                }
                onAdd={addTo}
                {...row}
              />
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

/** Pastille d'une etiquette : meme couleur partout pour un meme nom. */
function TagChip({ tag, selected }: { tag: string; selected?: boolean }) {
  return (
    <span
      className={`${CHIP} ${tagColor(tag)} ${
        selected ? 'ring-1 ring-current' : ''
      }`}
    >
      #{tag}
    </span>
  );
}

/** Filtre par etiquette : une a la fois, « Tout » pour l'enlever. */
function TagFilter({
  tags,
  active,
  onChange,
}: {
  tags: string[];
  active: string | null;
  onChange: (tag: string | null) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filtrer par étiquette"
      className="mb-2 flex shrink-0 items-center gap-1.5 overflow-x-auto pb-0.5"
    >
      <button
        type="button"
        aria-pressed={!active}
        onClick={() => onChange(null)}
        className={`shrink-0 ${CHIP} ${active ? 'text-muted hover:text-ink' : 'bg-ink text-ground'}`}
      >
        Tout
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          aria-pressed={tag === active}
          onClick={() => onChange(tag === active ? null : tag)}
          className="shrink-0"
        >
          <TagChip tag={tag} selected={tag === active} />
        </button>
      ))}
    </div>
  );
}

function ListOptions({ lists }: { lists: TaskList[] }) {
  return lists.map((list) => (
    <option key={list.id} value={list.id}>
      {list.title}
    </option>
  ));
}

/** Une branche par liste Google : son nom, ses tâches, et ce qui est remis à plus tard, replié. */
function ListMap({
  map,
  openLater,
  onToggleLater,
  onAdd,
  ...row
}: {
  map: ListBranch[];
  openLater: string[];
  onToggleLater: (listId: string) => void;
  onAdd: (listId: string) => void;
} & Omit<Parameters<typeof TaskRows>[0], 'tasks'>) {
  if (map.length === 0) return <Empty>Aucune liste.</Empty>;
  return (
    <div className="space-y-4">
      {map.map((branch) => (
        <section key={branch.id} aria-label={branch.title} className="min-w-0">
          <header className="mb-1.5 flex items-baseline gap-2 border-b border-rule pb-1">
            <h3 className="eyebrow min-w-0 flex-1 truncate">{branch.title}</h3>
            {branch.pressing > 0 && (
              <span className="shrink-0 font-mono text-[11px] text-rose">{branch.pressing}</span>
            )}
            <span className="tnum shrink-0 font-mono text-[11px] text-muted">{branch.tasks.length}</span>
            <button
              type="button"
              title={`Ajouter une tâche dans « ${branch.title} »`}
              aria-label={`Ajouter une tâche dans « ${branch.title} »`}
              onClick={() => onAdd(branch.id)}
              className="shrink-0 font-mono text-[13px] leading-none text-muted hover:text-amber"
            >
              +
            </button>
          </header>
          {branch.tasks.length === 0 && branch.later.length === 0 && (
            <p className="font-mono text-[11px] text-jade">Rien à faire.</p>
          )}
          {branch.tasks.length > 0 && <TaskRows tasks={branch.tasks} {...row} />}
          {branch.later.length > 0 && (
            <>
              <button
                type="button"
                aria-expanded={openLater.includes(branch.id)}
                onClick={() => onToggleLater(branch.id)}
                className="mt-1 font-mono text-[11px] text-muted hover:text-ink"
              >
                {openLater.includes(branch.id) ? '− ' : '+ '}
                {branch.later.length} plus tard
              </button>
              {openLater.includes(branch.id) && (
                <div className="mt-1 opacity-70">
                  <TaskRows tasks={branch.later} {...row} />
                </div>
              )}
            </>
          )}
        </section>
      ))}
    </div>
  );
}

function TaskRows({
  tasks,
  lists,
  writing,
  onTag,
  onFinish,
  onMove,
}: {
  tasks: TaskItem[];
  lists: TaskList[];
  writing: boolean;
  onTag: (tag: string) => void;
  onFinish: (task: TaskItem) => void;
  onMove: (task: TaskItem, listId: string) => void;
}) {
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
            {/* Au-dessus du lien qui couvre la ligne : un clic filtre sur l'etiquette. */}
            {task.tags.map((t) => (
              <button
                key={t}
                type="button"
                title={`Filtrer sur #${t}`}
                onClick={() => onTag(t)}
                className="relative z-10 shrink-0"
              >
                <TagChip tag={t} />
              </button>
            ))}
            {due.text && <span className={`shrink-0 font-mono text-[11px] ${due.tone}`}>{due.text}</span>}
            {lists.length > 1 && (
              <span className="relative z-10 w-4 shrink-0 text-center font-mono text-[11px] text-muted opacity-0 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                →
                <select
                  value={task.listId}
                  disabled={writing}
                  title={`Dans « ${task.list} » : déplacer vers…`}
                  aria-label={`Déplacer « ${task.label} » vers une autre liste`}
                  onChange={(event) => onMove(task, event.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  <ListOptions lists={lists} />
                </select>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Une ligne, Entree : la tache part dans la liste choisie de Google Tasks. */
function QuickAdd({
  lists,
  listId,
  onChooseList,
  inputRef,
  onCreated,
}: {
  lists: TaskList[];
  listId: string | undefined;
  onChooseList: (listId: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; relink?: boolean } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = title.trim();
    if (!value || busy) return;
    setBusy(true);
    setProblem(null);
    const { ok, body } = await send(TASKS_URL, 'POST', { title: value, listId });
    setBusy(false);
    if (ok) {
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
          ref={inputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Nouvelle tâche (#étiquette), puis Entrée"
          aria-label="Nouvelle tâche"
          maxLength={1024}
          disabled={busy}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-muted focus:outline-none disabled:opacity-50"
        />
        {lists.length > 1 && (
          <select
            value={listId}
            onChange={(event) => onChooseList(event.target.value)}
            aria-label="Liste de la nouvelle tâche"
            className="max-w-28 shrink-0 cursor-pointer truncate bg-transparent font-mono text-[11px] text-muted hover:text-ink"
          >
            <ListOptions lists={lists} />
          </select>
        )}
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
