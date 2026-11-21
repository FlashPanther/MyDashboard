'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { MapCanvas, type CanvasHandle } from '@/components/mindmap/MapCanvas';
import { Shortcuts } from '@/components/mindmap/Shortcuts';
import { TaskShelf } from '@/components/mindmap/TaskShelf';
import type { TaskItem } from '@/app/api/tasks/route';
import { useMapSync } from '@/components/mindmap/useMapSync';
import { useTaskSync } from '@/components/mindmap/useTaskSync';
import { writeJson } from '@/components/mindmap/writeJson';
import type { Send } from '@/components/mindmap/types';
import { Preparing } from '@/components/Preparing';
import { initialState, modeOf, reduce, shownRoot } from '@/lib/mindmap/editor';
import { commandFor, isZoom, swallowed } from '@/lib/mindmap/keymap';
import { draftKey, isClean, opening, parseDraft, readCopy, type Opened, type SyncStatus } from '@/lib/mindmap/sync';
import { branchIds, countDescendants, find, serialize, taskProgress, type MapNode, type RemoteChange } from '@/lib/mindmap/tree';
import type { Drop } from '@/lib/mindmap/drop';
import { readStored, writeStored } from '@/lib/storage';
import { fetcher, HttpError } from '@/lib/useEndpoint';

const HIDE_DONE_KEY = 'carte.masquerFaites';

const STATUS: Record<SyncStatus, string> = {
  saved: 'Enregistrée',
  saving: 'Enregistrement…',
  offline: 'Serveur injoignable : nouvel essai en cours, la carte attend dans ce navigateur.',
  conflict: 'Cette carte a été modifiée sur un autre appareil.',
  gone: 'Cette carte a été supprimée sur le serveur : exporte-la pour la garder.',
  refused: 'Le serveur refuse l’enregistrement : recharge la page, ou exporte la carte pour la garder.',
};

const UNKEPT = ' Ce navigateur ne peut rien garder : exporte la carte avant de fermer la page.';

export function MindMap({ id }: { id: string }) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [failure, setFailure] = useState('');
  const [orphan, setOrphan] = useState<{ text: string; root: MapNode } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let stale = false;
    fetcher(`/api/cartes/${id}`)
      .then((body) => {
        if (stale) return;
        const server = readCopy(body);
        if (!server) return setFailure('Carte illisible');
        const result = opening(server, parseDraft(readStored(draftKey(id))));
        if (isClean(result.sync, result.root)) writeStored(draftKey(id), null);
        setOpened(result);
      })
      .catch((error: Error) => {
        if (stale) return;
        const missing = error instanceof HttpError && error.status === 404;
        const text = missing ? readStored(draftKey(id)) : null;
        const draft = parseDraft(text);
        if (text && draft) setOrphan({ text, root: draft.root });
        setFailure(missing ? 'Cette carte n’existe pas, ou plus, sur le serveur.' : error.message);
      });
    return () => {
      stale = true;
    };
  }, [id]);

  async function restore(kept: { text: string; root: MapNode }) {
    setRestoring(true);
    const { status, body } = await writeJson('/api/cartes', 'POST', { root: kept.root });
    const created = (body as { id?: string } | null)?.id;
    if (status !== 200 || !created) {
      setRestoring(false);
      return setFailure('La carte n’a pas pu être remise sur le serveur.');
    }
    if (readStored(draftKey(id)) === kept.text) writeStored(draftKey(id), null);
    router.replace(`/carte/${created}`);
  }

  if (opened) return <Editor id={id} opened={opened} />;
  return (
    <Preparing>
      {failure ? (
        <span className="flex max-w-md flex-col items-center gap-3 text-center">
          {failure}
          {orphan && (
            <>
              <span>
                Ce navigateur en garde une version non enregistrée : <strong>{orphan.root.text || 'sans titre'}</strong>.
              </span>
              <button type="button" className="action" disabled={restoring} onClick={() => restore(orphan)}>
                La remettre sur le serveur
              </button>
            </>
          )}
          <Link href="/carte" className="underline">
            Retour aux cartes
          </Link>
        </span>
      ) : (
        'Préparation de la carte…'
      )}
    </Preparing>
  );
}

function Editor({ id, opened }: { id: string; opened: Opened }) {
  const [state, dispatch] = useReducer(reduce, opened.root, (map) => initialState(map, readStored(HIDE_DONE_KEY) === '1'));
  const [refits, setRefits] = useState(0);
  const editingElement = useRef<HTMLElement | null>(null);
  const canvas = useRef<CanvasHandle>(null);

  const send = useCallback<Send>(
    (action) => dispatch({ draft: editingElement.current?.innerText, newId: crypto.randomUUID(), ...action }),
    [],
  );

  const { root, hideDone } = state;
  const shown = shownRoot(state);
  const progress = useMemo(() => taskProgress(root), [root]);
  const hidden = useMemo(() => countDescendants(root) - countDescendants(shown), [root, shown]);
  const mode = modeOf(state);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => writeStored(HIDE_DONE_KEY, hideDone ? '1' : '0'), [hideDone]);

  const adopt = useCallback(
    (theirs: MapNode) => {
      send({ type: 'replace', root: theirs });
      setRefits((count) => count + 1);
    },
    [send],
  );
  const { status, kept, settle, flush, forgetOnSave } = useMapSync(id, opened.sync, root, adopt);
  const [shelf, setShelf] = useState(false);
  const pull = useCallback((changes: RemoteChange[]) => send({ type: 'remote', changes }), [send]);
  const { sync: google, toggle: sendTasks } = useTaskSync(id, status === 'saved', root, pull);
  const addTask = useCallback(
    (task: TaskItem, at?: Drop) => {
      const from = { taskId: task.id, listId: task.listId };
      const place = at ?? { parentId: latest.current.selected ?? root.id };
      send({ type: 'adopt', id: crypto.randomUUID(), text: task.title, from, ...place });
    },
    [send, root.id],
  );
  const [carried, setCarried] = useState<TaskItem | null>(null);
  const [catching, setCatching] = useState(false);
  const [released, setReleased] = useState<ReadonlySet<string>>(new Set());
  const inMap = useMemo(() => new Set(fromIds(root)), [root]);
  // Sur la carte entière : un nœud qui porte des tâches faites masquées n'est pas retiré d'un geste.
  const canRelease = useCallback(
    (ids: string[]) =>
      ids.every((id) => {
        const node = find(latest.current.root, id);
        return node?.task && node.children.length === 0;
      }),
    [],
  );
  const forgetReleased = useCallback((ids: string[]) => setReleased((current) => new Set([...current].filter((id) => !ids.includes(id)))), []);
  const release = useCallback(
    (ids: string[]) => {
      const gone = ids.flatMap((id) => fromIds(find(latest.current.root, id)!));
      setReleased((current) => new Set([...current, ...gone]));
      send({ type: 'remove', ids });
    },
    [send],
  );
  // Sur la carte entière : une tâche faite masquée dans la branche est retirée avec elle.
  const linkedIn = useCallback((nodeId: string) => [...branchIds(root, [nodeId])].filter((each) => google.linked.includes(each)), [root, google.linked]);
  const removeWithTasks = useCallback(
    (nodeId: string) => {
      forgetOnSave(linkedIn(nodeId));
      send({ type: 'select', id: nodeId });
      send({ type: 'command', command: 'delete' });
    },
    [forgetOnSave, linkedIn, send],
  );
  const leave = useCallback(() => {
    const draft = editingElement.current?.innerText;
    flush(reduce(latest.current, { type: 'command', command: 'stop', draft }).root);
  }, [flush]);
  // En nettoyage d'effet ordinaire, React a déjà détaché le champ de saisie : le texte en cours serait perdu.
  useLayoutEffect(() => leave, [leave]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if ((event.target as Element).closest('button, input, summary, a')) return;
      const command = commandFor(event, mode);
      if (command || swallowed(event, mode)) event.preventDefault();
      if (!command) return;
      if (isZoom(command)) canvas.current?.zoom(command);
      else send({ type: 'command', command, key: event.key });
    };
    // À la fermeture, rien ne garantit un rendu React : la saisie en cours est validée et écrite sur-le-champ.
    const onLeave = () => {
      leave();
      send({ type: 'command', command: 'stop' });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', onLeave);
    };
  }, [mode, send, leave]);

  function exportFile(map: MapNode) {
    const name = map.text.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'carte';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([serialize(map)], { type: 'application/json' }));
    link.download = `${name}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-panel px-4 py-2">
        <Link href="/carte" className="font-mono text-xs text-muted hover:text-ink">
          ← Cartes
        </Link>
        <h1 className="font-display text-xl font-extrabold uppercase tracking-[0.16em] text-ink">Carte</h1>
        <ToolbarButton onPress={() => exportFile(state.root)}>Exporter</ToolbarButton>
        {(hideDone || progress.size > 0) && (
          <ToolbarButton
            pressed={hideDone}
            onPress={() => send({ type: 'hideDone', hide: !hideDone })}
          >
            {hideDone ? `Tâches faites masquées (${hidden} nœud${hidden > 1 ? 's' : ''})` : 'Masquer les tâches faites'}
          </ToolbarButton>
        )}
        <p role="status" className={`font-mono text-xs ${kept && (status === 'saved' || status === 'saving') ? 'text-muted' : 'text-amber'}`}>
          {STATUS[status]}
          {!kept && status !== 'saved' && UNKEPT}
        </p>
        {google.enabled && (
          <ToolbarButton pressed={shelf} onPress={() => setShelf(!shelf)}>
            Tâches libres
          </ToolbarButton>
        )}
        {(google.enabled || google.waiting > 0) && (
          <ToolbarButton pressed={google.enabled} onPress={() => sendTasks(!google.enabled)}>
            {!google.enabled
              ? `Envoyer ${google.waiting} tâche${google.waiting > 1 ? 's' : ''} à Google`
              : google.waiting > 0
                ? `Envoi à Google… (${google.waiting} en attente)`
                : 'Tâches envoyées à Google'}
          </ToolbarButton>
        )}
        {google.blocked > 0 && (
          <p role="status" className="font-mono text-xs text-amber">
            {google.blocked > 1 ? `${google.blocked} tâches reprises sont` : 'Une tâche reprise est'} déjà suivie(s) par une autre carte : rien n’en part d’ici.
          </p>
        )}
        {google.lost > 0 && (
          <p role="status" className="font-mono text-xs text-amber">
            {google.lost > 1 ? `${google.lost} tâches n’existent plus` : 'Une tâche n’existe plus'} chez Google : la carte les garde, sans les
            renvoyer.
          </p>
        )}
        {google.state === 'unlinked' && (
          <a href="/api/auth/google" className="font-mono text-xs text-amber underline">
            Google n’est pas relié : les tâches restent dans la carte. Relier
          </a>
        )}
        {google.state === 'failed' && (
          <p role="status" className="font-mono text-xs text-amber">
            Tâches pas encore envoyées à Google : nouvel essai dans un instant.
          </p>
        )}
        {status === 'conflict' && (
          <>
            <ToolbarButton onPress={() => settle(false)}>Garder ma version</ToolbarButton>
            <ToolbarButton onPress={() => settle(true)}>Prendre l’autre version</ToolbarButton>
          </>
        )}
      </header>
      <MapCanvas
        key={refits}
        ref={canvas}
        root={shown}
        progress={progress}
        selected={state.selected}
        group={state.group}
        editing={state.editing}
        editingElement={editingElement}
        send={send}
        linkedIn={linkedIn}
        removeWithTasks={removeWithTasks}
        shelf={
          shelf && google.enabled
            ? {
                carried,
                adopt: (task: TaskItem, at: Drop) => {
                  setCarried(null);
                  addTask(task, at);
                },
                canRelease,
                release,
                hover: setCatching,
              }
            : null
        }
      />
      {shelf && google.enabled && (
        <TaskShelf
          inMap={inMap}
          released={released}
          onSettled={forgetReleased}
          linked={google.linked.join()}
          catching={catching}
          onAdd={addTask}
          onCarry={setCarried}
          onClose={() => setShelf(false)}
        />
      )}
      <Shortcuts />
    </div>
  );
}

function ToolbarButton({ onPress, pressed, children }: { onPress: () => void; pressed?: boolean; children: string }) {
  return (
    <button
      type="button"
      className="action"
      aria-pressed={pressed}
      onClick={(event) => {
        event.currentTarget.blur();
        onPress();
      }}
    >
      {children}
    </button>
  );
}

function fromIds(node: MapNode): string[] {
  return [...(node.from ? [node.from.taskId] : []), ...node.children.flatMap(fromIds)];
}
