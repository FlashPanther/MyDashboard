'use client';

import Link from 'next/link';
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
  type RefObject,
} from 'react';
import { Preparing } from '@/components/Preparing';
import { initialState, modeOf, reduce, type Editing, type EditorAction } from '@/lib/mindmap/editor';
import { commandFor, isZoom, type ZoomCommand } from '@/lib/mindmap/keymap';
import { layout, linkPath, type Box, type Size } from '@/lib/mindmap/layout';
import {
  branchesOn,
  countDescendants,
  newNode,
  parse,
  serialize,
  SIDES,
  visibleNodes,
  type MapNode,
  type Side,
  type VisibleNode,
} from '@/lib/mindmap/tree';
import { fit, reveal, zoomAt, type View } from '@/lib/mindmap/view';
import { readStored, writeStored } from '@/lib/storage';

const STORAGE_KEY = 'carte.document';
const BRANCH_COLOURS = ['#e4572e', '#2e86ab', '#3b9a5b', '#a23b72', '#d99a1c', '#5b5fc7', '#1f9e9a', '#c2527a'];
const UNMEASURED: Size = { width: 120, height: 36 };

type Send = (action: EditorAction) => void;
type Observe = (element: HTMLElement | null) => (() => void) | undefined;
type CanvasHandle = { zoom: (command: ZoomCommand) => void };

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
  useEffect(() => {
    if (mode === 'editing') return;
    const saved = serialize(root);
    writeStored(STORAGE_KEY, saved);
    if (readStored(STORAGE_KEY) !== saved) {
      setNotice("Enregistrement impossible dans ce navigateur : exporte la carte pour la garder.");
    }
  }, [root, mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if ((event.target as Element).closest('button, input, summary, a')) return;
      const command = commandFor(event, mode);
      if (!command) return;
      event.preventDefault();
      if (isZoom(command)) canvas.current?.zoom(command);
      else send({ type: 'command', command, key: event.key });
    };
    const onLeave = () => send({ type: 'command', command: 'stop' });
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

function MapCanvas({
  ref,
  root,
  selected,
  editing,
  editingElement,
  send,
}: {
  ref: Ref<CanvasHandle>;
  root: MapNode;
  selected: string | null;
  editing: Editing | null;
  editingElement: RefObject<HTMLElement | null>;
  send: Send;
}) {
  const [sizes, setSizes] = useState<ReadonlyMap<string, Size>>(new Map());
  const [view, setView] = useState<View | null>(null);
  const viewport = useRef<HTMLElement>(null);
  const observer = useRef<ResizeObserver | null>(null);

  const visible = useMemo(() => visibleNodes(root), [root]);
  const boxes = useMemo(() => layout(root, (node) => sizes.get(node.id) ?? UNMEASURED), [root, sizes]);
  const measured = visible.every(({ node }) => sizes.has(node.id));

  const observe = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    observer.current ??= new ResizeObserver((entries) => {
      setSizes((current) => {
        const next = new Map(current);
        for (const { target } of entries) {
          const node = target as HTMLElement;
          next.set(node.dataset.id!, { width: node.offsetWidth, height: node.offsetHeight });
        }
        return next;
      });
    });
    observer.current.observe(element);
    return () => observer.current?.unobserve(element);
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  useImperativeHandle(
    ref,
    () => ({
      zoom(command) {
        const { clientWidth: width, clientHeight: height } = viewport.current!;
        if (command === 'zoomFit') return setView(fit(boxes.values(), width, height));
        setView((current) => {
          if (!current) return current;
          const factor = command === 'zoomIn' ? 1.2 : command === 'zoomOut' ? 1 / 1.2 : 1 / current.scale;
          return zoomAt(current, factor, width / 2, height / 2);
        });
      },
    }),
    [boxes],
  );

  useLayoutEffect(() => {
    if (view || !measured || !viewport.current) return;
    setView(fit(boxes.values(), viewport.current.clientWidth, viewport.current.clientHeight));
  }, [view, measured, boxes]);

  useEffect(() => {
    const box = selected ? boxes.get(selected) : undefined;
    if (!box) return;
    const { clientWidth: width, clientHeight: height } = viewport.current!;
    setView((current) => current && reveal(current, box, width, height));
  }, [selected, boxes]);

  useEffect(() => {
    const element = viewport.current!;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const sideways = event.shiftKey && event.deltaX === 0;
      setView((current) => {
        if (!current) return current;
        if (event.ctrlKey || event.metaKey) {
          return zoomAt(current, Math.exp(-event.deltaY / 300), event.clientX - bounds.left, event.clientY - bounds.top);
        }
        return {
          ...current,
          x: current.x - (sideways ? event.deltaY : event.deltaX),
          y: current.y - (sideways ? 0 : event.deltaY),
        };
      });
    };
    // React pose ses écouteurs de molette en passif : preventDefault y serait ignoré.
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  function nodeIdAt(target: EventTarget): string | null {
    return (target as Element).closest<HTMLElement>('[data-id]')?.dataset.id ?? null;
  }

  return (
    <main
      ref={viewport}
      className="relative min-h-0 flex-1 touch-none overflow-hidden"
      onPointerDown={(event) => {
        if ((event.target as Element).closest('button')) return;
        send({ type: 'select', id: nodeIdAt(event.target) });
      }}
      onDoubleClick={(event) => {
        const id = nodeIdAt(event.target);
        if (id) send({ type: 'edit', id });
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={
          view
            ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }
            : { visibility: 'hidden' }
        }
      >
        <MapLayer
          root={root}
          visible={visible}
          boxes={boxes}
          selected={selected}
          editing={editing}
          editingElement={editingElement}
          observe={observe}
          send={send}
        />
      </div>
    </main>
  );
}

const MapLayer = memo(function MapLayer({
  root,
  visible,
  boxes,
  selected,
  editing,
  editingElement,
  observe,
  send,
}: {
  root: MapNode;
  visible: VisibleNode[];
  boxes: Map<string, Box>;
  selected: string | null;
  editing: Editing | null;
  editingElement: RefObject<HTMLElement | null>;
  observe: Observe;
  send: Send;
}) {
  return (
    <>
      <svg aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-visible">
        {visible.map(({ node, parentId, colour }) =>
          parentId === null ? null : (
            <path
              key={node.id}
              d={linkPath(boxes.get(parentId)!, boxes.get(node.id)!)}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              stroke={branchColour(colour)}
            />
          ),
        )}
      </svg>

      {visible.map(({ node, depth, colour, side }) => {
        const box = boxes.get(node.id)!;
        const shared = {
          'data-id': node.id,
          className: nodeClass(depth, side, node.id === selected, node.id === editing?.id),
          style: { left: box.x, top: box.y, '--branch': branchColour(colour) } as CSSProperties,
        };
        return node.id === editing?.id ? (
          <EditedNode
            key={node.id}
            {...shared}
            id={node.id}
            text={editing.initial ?? node.text}
            caretAtEnd={editing.initial !== null}
            editingElement={editingElement}
            observe={observe}
            send={send}
          />
        ) : (
          <div key={node.id} ref={observe} {...shared}>
            {node.text}
          </div>
        );
      })}

      {visible.flatMap(({ node, depth, colour, side }) => {
        if (node.children.length === 0) return [];
        const sides = depth > 0 || node.collapsed ? [side] : SIDES.filter((each) => branchesOn(root, each).length > 0);
        return sides.map((each) => (
          <FoldToggle
            key={`${node.id}-${each}`}
            node={node}
            box={boxes.get(node.id)!}
            side={each}
            colour={depth > 0 ? branchColour(colour) : undefined}
            send={send}
          />
        ));
      })}
    </>
  );
});

function EditedNode({
  id,
  text,
  caretAtEnd,
  editingElement,
  observe,
  send,
  ...shared
}: {
  id: string;
  text: string;
  caretAtEnd: boolean;
  editingElement: RefObject<HTMLElement | null>;
  observe: Observe;
  send: Send;
  className: string;
  style: CSSProperties;
  'data-id': string;
}) {
  useLayoutEffect(() => {
    const node = editingElement.current!;
    node.textContent = text;
    node.focus();
    const selection = getSelection()!;
    selection.selectAllChildren(node);
    if (caretAtEnd) selection.collapseToEnd();
    return observe(node);
  }, []);

  return (
    <div
      ref={editingElement as RefObject<HTMLDivElement | null>}
      {...shared}
      contentEditable="plaintext-only"
      onBlur={() => send({ type: 'blur', id })}
    />
  );
}

function branchColour(index: number): string {
  return BRANCH_COLOURS[index % BRANCH_COLOURS.length];
}

function nodeClass(depth: number, side: Side, selected: boolean, editing: boolean): string {
  const state = [
    'absolute w-max min-w-11 max-w-[300px] whitespace-pre-wrap break-words bg-panel text-ink outline-none',
    editing ? 'cursor-text select-text' : 'cursor-pointer select-none',
    selected ? 'ring-2 ring-sky' : '',
  ].join(' ');
  if (depth === 0) {
    return `${state} min-h-[46px] rounded-full border-2 border-ink px-5 py-2.5 font-display text-[17px] font-bold`;
  }
  const accent =
    side === 'left' ? 'border-r-4 border-r-[color:var(--branch)]' : 'border-l-4 border-l-[color:var(--branch)]';
  return `${state} min-h-[36px] rounded-md border border-rule px-3 py-[7px] text-[15px] leading-5 ${accent}`;
}

function FoldToggle({
  node,
  box,
  side,
  colour,
  send,
}: {
  node: MapNode;
  box: Box;
  side: Side;
  colour: string | undefined;
  send: Send;
}) {
  const gap = node.collapsed ? 6 : 3;
  const shape = node.collapsed
    ? 'h-5 min-w-5 rounded-full border border-rule px-1.5 font-mono text-xs leading-[18px] text-muted hover:border-ink hover:text-ink'
    : 'h-3 w-3 rounded-full border-2 border-[color:var(--branch,var(--color-ink))] hover:bg-[color:var(--branch,var(--color-ink))]';
  return (
    <button
      type="button"
      title={node.collapsed ? 'Déplier' : 'Replier'}
      className={`absolute bg-panel ${shape}`}
      style={
        {
          left: side === 'left' ? box.x : box.x + box.width,
          top: box.y + box.height / 2,
          transform: side === 'left' ? `translate(calc(-100% - ${gap}px), -50%)` : `translate(${gap}px, -50%)`,
          '--branch': colour,
        } as CSSProperties
      }
      // Sans cela, l'appui prend le focus et la saisie en cours se ferme avant le clic.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => send({ type: 'toggle', id: node.id })}
    >
      {node.collapsed ? countDescendants(node) : null}
    </button>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Tab', 'Ajouter un enfant'],
  ['Entrée', 'Modifier le nœud, puis ajouter un frère'],
  ['Ctrl Entrée', 'Ajouter un frère au-dessus'],
  ['Alt Entrée', 'Ajouter un parent'],
  ['Maj Tab', 'Revenir au parent'],
  ['Maj Entrée', 'Saut de ligne'],
  ['Ctrl /, clic sur le point', 'Replier, déplier'],
  ['← → ↑ ↓', 'Se déplacer'],
  ['Taper, F2, double-clic', 'Modifier le texte'],
  ['Échap', 'Finir la saisie, désélectionner'],
  ['Suppr', 'Supprimer la branche'],
  ['Ctrl Z, Ctrl Maj Z', 'Annuler, rétablir'],
  ['= - 0 1', 'Zoom avant, arrière, 100 %, tout voir'],
  ['Molette, Maj molette', 'Déplacer la vue'],
  ['Ctrl molette', 'Zoomer'],
];

function Shortcuts() {
  return (
    <details className="panel fixed bottom-3 right-3 max-w-[calc(100vw-1.5rem)] px-3 py-2 text-[13px]">
      <summary className="eyebrow cursor-pointer">Raccourcis</summary>
      <table className="mt-2 border-separate border-spacing-y-1">
        <tbody>
          {SHORTCUTS.map(([keys, effect]) => (
            <tr key={keys}>
              <td className="whitespace-nowrap pr-4 font-mono text-xs text-muted">{keys}</td>
              <td>{effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
