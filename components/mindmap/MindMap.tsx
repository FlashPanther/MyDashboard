'use client';

import Link from 'next/link';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Preparing } from '@/components/Preparing';
import { layout, linkPath, type Box, type Size } from '@/lib/mindmap/layout';
import {
  branchesOn,
  countDescendants,
  newNode,
  parse,
  serialize,
  SIDES,
  toggleCollapsed,
  visibleNodes,
  type MapNode,
  type Side,
  type VisibleNode,
} from '@/lib/mindmap/tree';
import { fit, zoomAt, type View } from '@/lib/mindmap/view';
import { readStored, writeStored } from '@/lib/storage';

const STORAGE_KEY = 'carte.document';
const BRANCH_COLOURS = ['#e4572e', '#2e86ab', '#3b9a5b', '#a23b72', '#d99a1c', '#5b5fc7', '#1f9e9a', '#c2527a'];
const UNMEASURED: Size = { width: 120, height: 36 };

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
  const [root, setRoot] = useState<MapNode | null>(null);
  const [opened, setOpened] = useState(0);
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setRoot(storedMap()), []);

  useEffect(() => {
    if (!root) return;
    const saved = serialize(root);
    writeStored(STORAGE_KEY, saved);
    if (readStored(STORAGE_KEY) !== saved) {
      setNotice("Enregistrement impossible dans ce navigateur : exporte la carte pour la garder.");
    }
  }, [root]);

  const toggle = useCallback((id: string) => setRoot((current) => current && toggleCollapsed(current, id)), []);

  if (!root) return <Preparing>Préparation de la carte…</Preparing>;

  function open(next: MapNode) {
    setNotice('');
    setRoot(next);
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
        <button type="button" className="action" onClick={() => open(blankMap())}>
          Nouvelle carte
        </button>
        <button type="button" className="action" onClick={() => fileInput.current?.click()}>
          Importer
        </button>
        <button type="button" className="action" onClick={() => exportFile(root)}>
          Exporter
        </button>
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
      <MapCanvas key={opened} root={root} onToggle={toggle} />
    </div>
  );
}

function MapCanvas({ root, onToggle }: { root: MapNode; onToggle: (id: string) => void }) {
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

  useLayoutEffect(() => {
    if (view || !measured || !viewport.current) return;
    setView(fit(boxes.values(), viewport.current.clientWidth, viewport.current.clientHeight));
  }, [view, measured, boxes]);

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

  return (
    <main ref={viewport} className="relative min-h-0 flex-1 touch-none overflow-hidden">
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={
          view
            ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }
            : { visibility: 'hidden' }
        }
      >
        <MapLayer root={root} visible={visible} boxes={boxes} observe={observe} onToggle={onToggle} />
      </div>
    </main>
  );
}

const MapLayer = memo(function MapLayer({
  root,
  visible,
  boxes,
  observe,
  onToggle,
}: {
  root: MapNode;
  visible: VisibleNode[];
  boxes: Map<string, Box>;
  observe: (element: HTMLElement | null) => (() => void) | undefined;
  onToggle: (id: string) => void;
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
        return (
          <div
            key={node.id}
            ref={observe}
            data-id={node.id}
            className={nodeClass(depth, side)}
            style={{ left: box.x, top: box.y, '--branch': branchColour(colour) } as CSSProperties}
          >
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
            onToggle={onToggle}
          />
        ));
      })}
    </>
  );
});

function branchColour(index: number): string {
  return BRANCH_COLOURS[index % BRANCH_COLOURS.length];
}

function nodeClass(depth: number, side: Side): string {
  const base = 'absolute w-max min-w-11 max-w-[300px] whitespace-pre-wrap break-words bg-panel text-ink';
  if (depth === 0) {
    return `${base} rounded-full border-2 border-ink px-5 py-2.5 font-display text-[17px] font-bold`;
  }
  const accent =
    side === 'left' ? 'border-r-4 border-r-[color:var(--branch)]' : 'border-l-4 border-l-[color:var(--branch)]';
  return `${base} rounded-md border border-rule px-3 py-[7px] text-[15px] leading-5 ${accent}`;
}

function FoldToggle({
  node,
  box,
  side,
  colour,
  onToggle,
}: {
  node: MapNode;
  box: Box;
  side: Side;
  colour: string | undefined;
  onToggle: (id: string) => void;
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
      onClick={() => onToggle(node.id)}
    >
      {node.collapsed ? countDescendants(node) : null}
    </button>
  );
}
