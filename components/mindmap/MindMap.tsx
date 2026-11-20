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
import { commandFor, isZoom, swallowed, type ZoomCommand } from '@/lib/mindmap/keymap';
import { dropAt, grabbed, type Carried, type Drop } from '@/lib/mindmap/drop';
import { boxesIn, carried, layout, linkPath, type Box, type Point, type Size } from '@/lib/mindmap/layout';
import {
  branchesOn,
  branchIds,
  countDescendants,
  find,
  newNode,
  parse,
  serialize,
  SIDES,
  visibleNodes,
  type MapNode,
  type Side,
  type VisibleNode,
} from '@/lib/mindmap/tree';
import { fit, reveal, toWorld, zoomAt, type View } from '@/lib/mindmap/view';
import { readStored, writeStored } from '@/lib/storage';

const STORAGE_KEY = 'carte.document';
const BRANCH_COLOURS = ['#e4572e', '#2e86ab', '#3b9a5b', '#a23b72', '#d99a1c', '#5b5fc7', '#1f9e9a', '#c2527a'];
const UNMEASURED: Size = { width: 120, height: 36 };
const DRAG_THRESHOLD = 5;
const NOTHING: ReadonlySet<string> = new Set();
const FADED = ' opacity-30';
const LINK = { fill: 'none', strokeWidth: 2, strokeLinecap: 'round' } as const;

type Send = (action: EditorAction) => void;
type Observe = (element: HTMLElement | null) => (() => void) | undefined;
type CanvasHandle = { zoom: (command: ZoomCommand) => void };
type Press = {
  id: string | null;
  carried: Carried | null;
  pointerId: number;
  x: number;
  y: number;
  start: Point;
  last: Point;
};
type Frame = { from: Point; to: Point; ids: string[] };
type Menu = { id: string; x: number; y: number };
type Drag = Carried & { lifted: ReadonlySet<string>; dx: number; dy: number; drop: Drop | null };

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

function MapCanvas({
  ref,
  root,
  selected,
  group,
  editing,
  editingElement,
  send,
}: {
  ref: Ref<CanvasHandle>;
  root: MapNode;
  selected: string | null;
  group: string[];
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

  const [drag, setDrag] = useState<Drag | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const press = useRef<Press | null>(null);
  const gesturing = drag !== null || frame !== null;
  const lifted = drag?.lifted ?? NOTHING;
  const markedIds = frame?.ids ?? group;
  const marked = useMemo(() => new Set(markedIds), [markedIds]);

  const cancelGesture = useCallback(() => {
    press.current = null;
    setDrag(null);
    setFrame(null);
  }, []);

  useEffect(() => {
    if (!gesturing) return;
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      if (event.key === 'Escape') cancelGesture();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [gesturing, cancelGesture]);

  function nodeIdAt(target: EventTarget): string | null {
    return (target as Element).closest<HTMLElement>('[data-id]')?.dataset.id ?? null;
  }

  function follow(): void {
    const pressed = press.current;
    if (!pressed || !view) return;
    const point = toWorld(view, pressed.last.x, pressed.last.y);
    if (!pressed.carried) {
      const ids = boxesIn(boxes, pressed.start, point);
      return setFrame((current) => {
        const same = current && current.ids.length === ids.length && current.ids.every((id, index) => id === ids[index]);
        return { from: pressed.start, to: point, ids: same ? current.ids : ids };
      });
    }
    const { ids, anchorId } = pressed.carried;
    const origin = boxes.get(anchorId);
    if (!origin) return cancelGesture();
    const dx = point.x - pressed.start.x;
    const dy = point.y - pressed.start.y;
    const drop = dropAt(root, boxes, ids, { ...origin, x: origin.x + dx, y: origin.y + dy });
    setDrag((current) => ({ ids, anchorId, lifted: current?.lifted ?? branchIds(root, ids), dx, dy, drop }));
  }

  useEffect(() => {
    if (gesturing) follow();
  }, [view, boxes]);

  function viewportPoint(event: { clientX: number; clientY: number }): Point {
    const bounds = viewport.current!.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  return (
    <main
      ref={viewport}
      className="relative min-h-0 flex-1 touch-none overflow-hidden"
      onPointerDown={(event) => {
        if (!event.isPrimary || gesturing || (event.target as Element).closest('button')) return;
        const id = nodeIdAt(event.target);
        if (id === null || !group.includes(id)) send({ type: 'select', id });
        if (!view || id === editing?.id || event.button !== 0) return;
        const carriedNodes = id === null ? null : grabbed(root, group, id);
        if (id !== null && !carriedNodes) return;
        const at = viewportPoint(event);
        press.current = {
          id,
          carried: carriedNodes,
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          start: toWorld(view, at.x, at.y),
          last: at,
        };
      }}
      onPointerMove={(event) => {
        const pressed = press.current;
        if (pressed?.pointerId !== event.pointerId) return;
        if (event.buttons === 0) return cancelGesture();
        if (!gesturing) {
          if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < DRAG_THRESHOLD) return;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        pressed.last = viewportPoint(event);
        follow();
      }}
      onPointerUp={(event) => {
        const pressed = press.current;
        if (pressed?.pointerId !== event.pointerId) return;
        if (frame) send({ type: 'mark', ids: frame.ids });
        else if (drag?.drop) send({ type: 'move', ids: drag.ids, ...drag.drop });
        else if (!drag && pressed.id !== null && group.length > 0) send({ type: 'select', id: pressed.id });
        cancelGesture();
      }}
      onContextMenu={(event) => {
        const id = nodeIdAt(event.target);
        if (!id || id === editing?.id || !find(root, id)?.children.length) return;
        event.preventDefault();
        send({ type: 'select', id });
        setMenu({ id, x: event.clientX, y: event.clientY });
      }}
      onPointerCancel={(event) => {
        if (press.current?.pointerId === event.pointerId) cancelGesture();
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
          marked={marked}
          editing={editing}
          editingElement={editingElement}
          lifted={lifted}
          observe={observe}
          send={send}
        />
        {drag && <Ghost visible={visible} boxes={boxes} lifted={lifted} drag={drag} />}
        {frame && (
          <div
            className="pointer-events-none absolute border border-sky bg-sky/10"
            style={{
              left: Math.min(frame.from.x, frame.to.x),
              top: Math.min(frame.from.y, frame.to.y),
              width: Math.abs(frame.to.x - frame.from.x),
              height: Math.abs(frame.to.y - frame.from.y),
            }}
          />
        )}
      </div>
      {menu && find(root, menu.id)?.children.length ? (
        <BranchMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onFold={(collapsed) => send({ type: 'foldBranch', id: menu.id, collapsed })}
        />
      ) : null}
    </main>
  );
}

function BranchMenu({ menu, onClose, onFold }: { menu: Menu; onClose: () => void; onFold: (collapsed: boolean) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: menu.x, top: menu.y });

  useLayoutEffect(() => {
    const { offsetWidth, offsetHeight } = element.current!;
    setPlace({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - offsetWidth - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - offsetHeight - 8)),
    });
    element.current!.querySelector('button')!.focus();
  }, [menu]);

  useEffect(() => {
    const onOutside = (event: Event) => {
      if (!element.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('wheel', onOutside, true);
    return () => {
      window.removeEventListener('pointerdown', onOutside, true);
      window.removeEventListener('wheel', onOutside, true);
    };
  }, [onClose]);

  return (
    <div
      ref={element}
      className="panel fixed z-10 flex flex-col p-1 shadow-lg"
      style={place}
      onKeyDown={(event) => {
        const items = [...element.current!.querySelectorAll('button')];
        const step = { ArrowDown: 1, Tab: 1, ArrowUp: -1 }[event.key];
        if (event.key === 'Enter' || event.key === ' ') return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') onClose();
        if (step) items[(items.indexOf(document.activeElement as HTMLButtonElement) + step + items.length) % items.length].focus();
      }}
    >
      {([true, false] as const).map((collapsed) => (
        <button
          key={String(collapsed)}
          type="button"
          className="whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-panel-soft focus:bg-panel-soft"
          onClick={() => {
            onFold(collapsed);
            onClose();
          }}
        >
          {collapsed ? 'Replier toute la branche' : 'Déplier toute la branche'}
        </button>
      ))}
    </div>
  );
}

const MapLayer = memo(function MapLayer({
  root,
  visible,
  boxes,
  selected,
  marked,
  editing,
  editingElement,
  lifted,
  observe,
  send,
}: {
  root: MapNode;
  visible: VisibleNode[];
  boxes: Map<string, Box>;
  selected: string | null;
  marked: ReadonlySet<string>;
  editing: Editing | null;
  editingElement: RefObject<HTMLElement | null>;
  lifted: ReadonlySet<string>;
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
              {...LINK}
              stroke={branchColour(colour)}
              className={lifted.has(node.id) ? FADED : undefined}
            />
          ),
        )}
      </svg>

      {visible.map(({ node, depth, colour, side }) => {
        const box = boxes.get(node.id)!;
        const shared = {
          'data-id': node.id,
          className: nodeClass(depth, side, node.id === selected || marked.has(node.id), node.id === editing?.id) + (lifted.has(node.id) ? FADED : ''),
          style: nodeStyle(box, colour),
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
            faded={lifted.has(node.id)}
            send={send}
          />
        ));
      })}
    </>
  );
});

function Ghost({
  visible,
  boxes,
  lifted,
  drag,
}: {
  visible: VisibleNode[];
  boxes: Map<string, Box>;
  lifted: ReadonlySet<string>;
  drag: Drag;
}) {
  const branch = visible.filter(({ node }) => lifted.has(node.id));
  const origin = branch.find(({ node }) => node.id === drag.anchorId)!.side;
  const side = drag.drop?.side ?? origin;
  const moved = carried(boxes, lifted, drag.anchorId, drag.dx, drag.dy, side !== origin);
  const target = drag.drop && boxes.get(drag.drop.parentId)!;
  return (
    <div className="pointer-events-none absolute left-0 top-0">
      <svg aria-hidden="true" className="absolute left-0 top-0 h-px w-px overflow-visible">
        {branch.map(({ node, parentId, colour }) => {
          const box = moved.get(node.id)!;
          const parent = moved.get(parentId!);
          if (parent) return <path key={node.id} d={linkPath(parent, box)} {...LINK} stroke={branchColour(colour)} />;
          if (!target) return null;
          return <path key={node.id} d={linkPath(target, box)} {...LINK} stroke="var(--color-sky)" strokeDasharray="7 6" />;
        })}
      </svg>
      {branch.map(({ node, depth, colour }) => (
        <div
          key={node.id}
          className={`${nodeClass(depth, side, drag.ids.includes(node.id), false)} shadow-lg`}
          style={nodeStyle(moved.get(node.id)!, colour)}
        >
          {node.text}
        </div>
      ))}
    </div>
  );
}

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

function nodeStyle(box: Box, colour: number): CSSProperties {
  return { left: box.x, top: box.y, '--branch': branchColour(colour) } as CSSProperties;
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
  faded,
  send,
}: {
  node: MapNode;
  box: Box;
  side: Side;
  colour: string | undefined;
  faded: boolean;
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
      className={`absolute bg-panel ${shape}${faded ? FADED : ''}`}
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
  ['Glisser un nœud', 'Le déplacer avec sa branche : le lien en pointillés montre son futur parent'],
  ['Clic droit sur un nœud', 'Replier ou déplier toute sa branche'],
  ['Glisser sur le fond', 'Tracer un cadre pour sélectionner plusieurs nœuds, puis les supprimer ou les glisser ensemble'],
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
