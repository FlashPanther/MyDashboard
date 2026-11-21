'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { MapCanvas, type CanvasHandle } from '@/components/mindmap/MapCanvas';
import { Shortcuts } from '@/components/mindmap/Shortcuts';
import { useMapSync } from '@/components/mindmap/useMapSync';
import type { Send } from '@/components/mindmap/types';
import { Preparing } from '@/components/Preparing';
import { initialState, modeOf, reduce, shownRoot } from '@/lib/mindmap/editor';
import { commandFor, isZoom, swallowed } from '@/lib/mindmap/keymap';
import { draftKey, opening, parseDraft, type SyncState, type SyncStatus } from '@/lib/mindmap/sync';
import { countDescendants, parseDocument, serialize, taskProgress, type MapNode } from '@/lib/mindmap/tree';
import { readStored, writeStored } from '@/lib/storage';

const HIDE_DONE_KEY = 'carte.masquerFaites';

const STATUS: Record<SyncStatus, string> = {
  saved: 'Enregistrée',
  saving: 'Enregistrement…',
  offline: 'Serveur injoignable : la carte est gardée dans ce navigateur, nouvel essai en cours.',
  conflict: 'Cette carte a été modifiée sur un autre appareil.',
  gone: 'Cette carte a été supprimée sur le serveur : exporte-la pour la garder.',
};

type Opened = { root: MapNode; sync: SyncState };

export function MindMap({ id }: { id: string }) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    let stale = false;
    fetch(`/api/cartes/${id}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(response.status === 404 ? 'Cette carte n’existe pas, ou plus.' : body.error);
        const server = { revision: body.revision, root: parseDocument(body) };
        if (!stale) setOpened(opening(server, parseDraft(readStored(draftKey(id)))));
      })
      .catch((error: Error) => !stale && setFailure(error.message || 'Carte illisible'));
    return () => {
      stale = true;
    };
  }, [id]);

  if (opened) return <Editor id={id} opened={opened} />;
  return (
    <Preparing>
      {failure ? (
        <span>
          {failure}{' '}
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

  const { status, theirs, resolve, flush } = useMapSync(id, opened.sync, root);

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
      const draft = editingElement.current?.innerText;
      flush(reduce(latest.current, { type: 'command', command: 'stop', draft }).root);
      send({ type: 'command', command: 'stop' });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', onLeave);
    };
  }, [mode, send, flush]);

  function takeTheirs() {
    if (!theirs) return;
    resolve({ type: 'takeTheirs' });
    send({ type: 'replace', root: theirs.root });
    setRefits((count) => count + 1);
  }

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
        <p role="status" className={`font-mono text-xs ${status === 'saved' || status === 'saving' ? 'text-muted' : 'text-amber'}`}>
          {STATUS[status]}
        </p>
        {status === 'conflict' && (
          <>
            <ToolbarButton onPress={() => resolve({ type: 'keepMine' })}>Garder ma version</ToolbarButton>
            <ToolbarButton onPress={takeTheirs}>Prendre l’autre version</ToolbarButton>
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
      />
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
