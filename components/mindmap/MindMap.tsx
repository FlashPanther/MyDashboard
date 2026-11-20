'use client';

import Link from 'next/link';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { MapCanvas } from '@/components/mindmap/MapCanvas';
import { Shortcuts } from '@/components/mindmap/Shortcuts';
import type { CanvasHandle, Send } from '@/components/mindmap/types';
import { Preparing } from '@/components/Preparing';
import { initialState, modeOf, reduce } from '@/lib/mindmap/editor';
import { commandFor, isZoom, swallowed } from '@/lib/mindmap/keymap';
import { newNode, parse, serialize, type MapNode } from '@/lib/mindmap/tree';
import { readStored, writeStored } from '@/lib/storage';

const STORAGE_KEY = 'carte.document';

function blankMap(): MapNode {
  return newNode('Idée centrale');
}

function storedMap(): MapNode {
  try {
    const stored = readStored(STORAGE_KEY);
    return stored ? parse(stored) : blankMap();
  } catch {
    return blankMap();
  }
}

export function MindMap() {
  const [stored, setStored] = useState<MapNode | null>(null);

  useEffect(() => setStored(storedMap()), []);

  return stored ? <Editor initial={stored} /> : <Preparing>Préparation de la carte…</Preparing>;
}

function Editor({ initial }: { initial: MapNode }) {
  const [state, dispatch] = useReducer(reduce, initial, initialState);
  const [opened, setOpened] = useState(0);
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const editingElement = useRef<HTMLElement | null>(null);
  const canvas = useRef<CanvasHandle>(null);

  const send = useCallback<Send>(
    (action) => dispatch({ draft: editingElement.current?.innerText, newId: crypto.randomUUID(), ...action }),
    [],
  );

  const { root } = state;
  const mode = modeOf(state);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    const saved = serialize(root);
    writeStored(STORAGE_KEY, saved);
    if (readStored(STORAGE_KEY) !== saved) {
      setNotice("Enregistrement impossible dans ce navigateur : exporte la carte pour la garder.");
    }
  }, [root]);

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
      writeStored(STORAGE_KEY, serialize(reduce(latest.current, { type: 'command', command: 'stop', draft }).root));
      send({ type: 'command', command: 'stop' });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', onLeave);
    };
  }, [mode, send]);

  function open(next: MapNode) {
    setNotice('');
    send({ type: 'replace', root: next });
    setOpened((count) => count + 1);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      open(parse(await file.text()));
    } catch {
      setNotice(`« ${file.name} » n'est pas une carte valide.`);
    }
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
        <Link href="/" className="font-mono text-xs text-muted hover:text-ink">
          ← Tableau
        </Link>
        <h1 className="font-display text-xl font-extrabold uppercase tracking-[0.16em] text-ink">Carte</h1>
        <ToolbarButton onPress={() => open(blankMap())}>Nouvelle carte</ToolbarButton>
        <ToolbarButton onPress={() => fileInput.current?.click()}>Importer</ToolbarButton>
        <ToolbarButton onPress={() => exportFile(state.root)}>Exporter</ToolbarButton>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            importFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        {notice && (
          <p role="status" className="font-mono text-xs text-amber">
            {notice}
          </p>
        )}
      </header>
      <MapCanvas
        key={opened}
        ref={canvas}
        root={state.root}
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

function ToolbarButton({ onPress, children }: { onPress: () => void; children: string }) {
  return (
    <button
      type="button"
      className="action"
      onClick={(event) => {
        event.currentTarget.blur();
        onPress();
      }}
    >
      {children}
    </button>
  );
}
