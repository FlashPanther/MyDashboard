'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { writeJson } from '@/components/mindmap/writeJson';
import { Preparing } from '@/components/Preparing';
import type { MapSummary } from '@/lib/mindmap/store';
import { draftKey } from '@/lib/mindmap/sync';
import { newNode, parse, type MapNode } from '@/lib/mindmap/tree';
import { readStored, writeStored } from '@/lib/storage';
import { relative } from '@/lib/time';
import { fetcher, useEndpoint } from '@/lib/useEndpoint';
import { takeOverMap } from '@/lib/mindmap/takeOver';
import type { TaskItem } from '@/app/api/tasks/route';

const BROWSER_MAP_KEY = 'carte.document';
const BLANK_TITLE = 'Idée centrale';

function browserMap(): MapNode | null {
  try {
    const stored = readStored(BROWSER_MAP_KEY);
    const map = stored ? parse(stored) : null;
    return map && (map.children.length > 0 || map.text !== BLANK_TITLE) ? map : null;
  } catch {
    return null;
  }
}

export function MapList() {
  const router = useRouter();
  const list = useEndpoint<{ maps: MapSummary[] }>('/api/cartes', 0);
  const [local, setLocal] = useState<MapNode | null>(null);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [doomed, setDoomed] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [spared, setSpared] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const notice = failure || list.error;

  useEffect(() => setLocal(browserMap()), []);

  async function create(root: MapNode, sendTasks = false): Promise<boolean> {
    setBusy(true);
    setFailure('');
    const { status, body } = await writeJson('/api/cartes', 'POST', { root, sendTasks });
    const { id, error } = (body ?? {}) as { id?: string; error?: string };
    if (status === 200 && id) {
      router.push(`/carte/${id}`);
      return true;
    }
    setFailure(error ?? 'Création impossible');
    setBusy(false);
    return false;
  }

  async function takeOver() {
    setBusy(true);
    setFailure('');
    try {
      const [tasks, followed] = await Promise.all([fetcher('/api/tasks'), fetcher('/api/cartes/suivies')]);
      const root = takeOverMap(tasks.tasks as TaskItem[], new Set(followed.taskIds as string[]));
      if (!root) {
        const open = (tasks.tasks as TaskItem[]).length;
        setFailure(open === 0 ? 'Aucune tâche Google ouverte à reprendre.' : 'Toutes tes tâches Google ouvertes sont déjà dans une carte.');
        setBusy(false);
        return;
      }
      await create(root, true);
    } catch (error) {
      setFailure((error as Error).message || 'Lecture des tâches Google impossible');
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setFailure('');
    const draft = readStored(draftKey(id));
    const { status, body } = await writeJson(`/api/cartes/${id}`, 'DELETE');
    if (status === 200 || status === 404) {
      if (readStored(draftKey(id)) === draft) writeStored(draftKey(id), null);
      setRemoved((ids) => [...ids, id]);
      list.refresh();
    } else {
      setFailure((body as { error?: string } | null)?.error ?? 'Suppression impossible');
    }
    setDoomed(null);
    setBusy(false);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    let root: MapNode;
    try {
      root = parse(await file.text());
    } catch {
      setBusy(false);
      return setFailure(`« ${file.name} » n'est pas une carte valide.`);
    }
    await create(root);
  }

  const maps = list.data?.maps.filter((map) => !removed.includes(map.id));
  if (!maps && !notice) return <Preparing>Préparation des cartes…</Preparing>;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/" className="font-mono text-xs text-muted hover:text-ink">
          ← Tableau
        </Link>
        <h1 className="font-display text-xl font-extrabold uppercase tracking-[0.16em] text-ink">Cartes</h1>
        <button type="button" className="action" disabled={busy} onClick={() => create(newNode(BLANK_TITLE), true)}>
          Nouvelle carte
        </button>
        <button type="button" className="action" disabled={busy} onClick={() => fileInput.current?.click()}>
          Importer
        </button>
        <button type="button" className="action" disabled={busy} onClick={takeOver}>
          Reprendre mes tâches Google
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            void importFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </header>

      {notice && (
        <p role="status" className="font-mono text-xs text-amber">
          {notice}
        </p>
      )}

      {local && (
        <section className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
          <p className="min-w-0 flex-1">
            Une carte est gardée dans ce navigateur seulement : <strong>{local.text || 'sans titre'}</strong>.
          </p>
          <button
            type="button"
            className="action"
            disabled={busy}
            onClick={async () => (await create(local)) && writeStored(BROWSER_MAP_KEY, null)}
          >
            La mettre sur le serveur
          </button>
        </section>
      )}

      {maps && maps.length === 0 && <p className="text-sm text-muted">Aucune carte sur le serveur pour l’instant.</p>}

      <ul className="flex flex-col gap-2">
        {maps?.map((map) => {
          const title = map.title || 'Sans titre';
          return (
            <li key={map.id} className="panel flex items-center gap-3 pr-3 hover:border-ink">
              {doomed === map.id ? (
                <>
                  <p className="min-w-0 flex-1 px-4 py-3 text-sm">
                    Supprimer <strong>{title}</strong> ?
                    {readStored(draftKey(map.id)) && ' Des modifications de ce navigateur, pas encore enregistrées, seront perdues.'}
                  </p>
                  <button key="confirm" type="button" className="action" disabled={busy} onClick={() => remove(map.id)}>
                    Oui, supprimer
                  </button>
                  <button
                    key="cancel"
                    type="button"
                    className="action"
                    autoFocus
                    disabled={busy}
                    onClick={() => {
                      setDoomed(null);
                      setSpared(map.id);
                    }}
                  >
                    Annuler
                  </button>
                </>
              ) : (
                <>
                  <Link href={`/carte/${map.id}`} className="flex min-w-0 flex-1 items-baseline justify-between gap-4 py-3 pl-4">
                    <span className="min-w-0 truncate font-display font-bold text-ink">{title}</span>
                    <time dateTime={map.updatedAt} className="shrink-0 font-mono text-xs text-muted">
                      {relative(map.updatedAt)}
                    </time>
                  </Link>
                  <button
                    key="delete"
                    type="button"
                    className="font-mono text-xs text-muted hover:text-ink"
                    autoFocus={spared === map.id}
                    disabled={busy}
                    onClick={() => setDoomed(map.id)}
                  >
                    Supprimer
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
