'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TaskItem } from '@/app/api/tasks/route';
import { ListChecks } from 'lucide-react';
import { Empty, Panel } from '@/components/Panel';
import { useEndpoint } from '@/lib/useEndpoint';

/** Les tâches Google qui ne sont dans aucune carte, à reprendre dans la carte ouverte. */
export function TaskShelf({
  inMap,
  released,
  linked,
  catching,
  onAdd,
  onCarry,
  onSettled,
  onClose,
}: {
  inMap: ReadonlySet<string>;
  released: ReadonlySet<string>;
  linked: string;
  catching: boolean;
  onAdd: (task: TaskItem) => void;
  onCarry: (task: TaskItem | null) => void;
  onSettled: (ids: string[]) => void;
  onClose: () => void;
}) {
  const tasks = useEndpoint<{ tasks: TaskItem[] }>('/api/tasks', 0);
  const followed = useEndpoint<{ taskIds: string[] }>('/api/cartes/suivies', 0);
  const [query, setQuery] = useState('');
  const refreshFollowed = useRef(followed.refresh);
  refreshFollowed.current = followed.refresh;

  useEffect(() => {
    refreshFollowed.current();
  }, [linked]);

  // Une tâche retirée de la carte que le serveur ne compte plus comme suivie n'a plus besoin d'être forcée dans la liste.
  const settled = useMemo(() => {
    const taskIds = followed.data?.taskIds;
    return taskIds ? [...released].filter((id) => !taskIds.includes(id)) : [];
  }, [followed.data, released]);
  useEffect(() => {
    if (settled.length > 0) onSettled(settled);
  }, [settled, onSettled]);

  const free = useMemo(() => {
    const words = query.trim().toLowerCase();
    const elsewhere = new Set((followed.data?.taskIds ?? []).filter((id) => !released.has(id)));
    return (tasks.data?.tasks ?? []).filter(
      (task) => !elsewhere.has(task.id) && !inMap.has(task.id) && (!words || `${task.title} ${task.list}`.toLowerCase().includes(words)),
    );
  }, [tasks.data, followed.data, inMap, released, query]);

  return (
    <aside
      data-shelf
      className={`fixed bottom-3 right-3 top-16 z-10 flex w-80 max-w-[calc(100vw-1.5rem)] flex-col ${catching ? 'outline-2 outline-offset-2 outline-dashed outline-sky' : ''}`}
    >
      <Panel
        title="Tâches libres"
        icon={ListChecks}
        grow
        error={tasks.error ?? followed.error}
        notConnected={tasks.notConnected}
        loading={!tasks.data || !followed.data}
        meta={
          <button type="button" className="font-mono text-xs text-muted hover:text-ink" onClick={onClose}>
            Fermer
          </button>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2 text-sm">
          <p className="text-xs text-muted">
            {catching
              ? 'Lâche ici pour retirer de la carte : la tâche reste dans Google.'
              : 'Les tâches Google qui ne sont dans aucune carte. Glisse-les sur la carte, ou « Ajouter » sous le nœud sélectionné. Glisse un nœud-tâche ici pour le retirer de la carte.'}
          </p>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Chercher"
            className="border border-rule bg-ground px-2 py-1 text-sm text-ink outline-none focus:border-ink"
          />
          {free.length === 0 && <Empty>Aucune tâche libre.</Empty>}
          <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {free.map((task) => (
              <li
                key={task.id}
                draggable
                onDragStart={(event) => {
                  // Firefox ne commence pas le glissement sans donnée attachée.
                  event.dataTransfer.setData('text/plain', task.title);
                  event.dataTransfer.effectAllowed = 'copy';
                  onCarry(task);
                }}
                onDragEnd={() => onCarry(null)}
                className="flex cursor-grab items-baseline gap-2 border-b border-rule py-1 active:cursor-grabbing"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-ink">{task.title}</span>
                  <span className="font-mono text-[11px] text-muted">{task.list}</span>
                </span>
                <button type="button" className="shrink-0 font-mono text-xs text-muted hover:text-ink" onClick={() => onAdd(task)}>
                  Ajouter
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </aside>
  );
}
