'use client';

import { useMemo, useState } from 'react';
import type { TaskItem } from '@/app/api/tasks/route';
import { useEndpoint } from '@/lib/useEndpoint';

/** Les tâches Google qui ne sont dans aucune carte, à reprendre dans la carte ouverte. */
export function TaskShelf({ onAdd, onClose }: { onAdd: (task: TaskItem) => void; onClose: () => void }) {
  const tasks = useEndpoint<{ tasks: TaskItem[] }>('/api/tasks', 0);
  const followed = useEndpoint<{ taskIds: string[] }>('/api/cartes/suivies', 0);
  const [query, setQuery] = useState('');
  const [taken, setTaken] = useState<string[]>([]);

  const free = useMemo(() => {
    const known = new Set([...(followed.data?.taskIds ?? []), ...taken]);
    const words = query.trim().toLowerCase();
    return (tasks.data?.tasks ?? []).filter(
      (task) => !known.has(task.id) && (!words || `${task.title} ${task.list}`.toLowerCase().includes(words)),
    );
  }, [tasks.data, followed.data, taken, query]);

  const loading = !tasks.data || !followed.data;
  const error = tasks.error || followed.error;

  return (
    <aside className="panel fixed bottom-3 right-3 top-16 z-10 flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-2 p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="eyebrow">Tâches libres</h2>
        <button type="button" className="font-mono text-xs text-muted hover:text-ink" onClick={onClose}>
          Fermer
        </button>
      </div>
      <p className="text-xs text-muted">Les tâches Google qui ne sont dans aucune carte. « Ajouter » la place sous le nœud sélectionné.</p>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Chercher"
        className="border border-rule bg-ground px-2 py-1 text-sm text-ink outline-none focus:border-ink"
      />
      {error && <p className="font-mono text-xs text-amber">{error}</p>}
      {loading && !error && <p className="font-mono text-xs text-muted">Lecture des tâches…</p>}
      {!loading && free.length === 0 && <p className="text-xs text-muted">Aucune tâche libre.</p>}
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {free.map((task) => (
          <li key={task.id} className="flex items-baseline gap-2 border-b border-rule py-1">
            <span className="min-w-0 flex-1">
              <span className="block break-words text-ink">{task.title}</span>
              <span className="font-mono text-[11px] text-muted">{task.list}</span>
            </span>
            <button
              type="button"
              className="shrink-0 font-mono text-xs text-muted hover:text-ink"
              onClick={() => {
                setTaken((current) => [...current, task.id]);
                onAdd(task);
              }}
            >
              Ajouter
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
