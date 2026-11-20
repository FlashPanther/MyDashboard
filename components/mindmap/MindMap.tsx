'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { layout, linkPath, type Box, type Size } from '@/lib/mindmap/layout';
import {
  childrenOn,
  countDescendants,
  newNode,
  parse,
  serialize,
  SIDES,
  toggleCollapsed,
  visibleChildren,
  visibleNodes,
  type MapNode,
  type Side,
} from '@/lib/mindmap/tree';
import { fit, zoomAt, type View } from '@/lib/mindmap/view';
import { readStored, writeStored } from '@/lib/storage';

const STORAGE_KEY = 'carte.document';
const BRANCH_COLOURS = ['#e4572e', '#2e86ab', '#3b9a5b', '#a23b72', '#d99a1c', '#5b5fc7', '#1f9e9a', '#c2527a'];
const UNMEASURED: Size = { width: 120, height: 36 };
const ACTION =
  'border border-rule px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink transition-colors hover:border-ink';

function blankMap(): MapNode {
  return newNode('Idée centrale');
}

function storedMap(): MapNode {
  try {
    const stored = readStored(STORAGE_KEY);
    if (stored) return parse(stored);
  } catch {
    // Carte illisible : on repart d'une carte neuve.
  }
  return blankMap();
}

function sameSizes(a: ReadonlyMap<string, Size>, b: ReadonlyMap<string, Size>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, size] of a) {
    const other = b.get(id);
    if (!other || other.width !== size.width || other.height !== size.height) return false;
  }
  return true;
}

export function MindMap() {
  const [root, setRoot] = useState<MapNode | null>(null);
  const [sizes, setSizes] = useState<ReadonlyMap<string, Size>>(new Map());
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [notice, setNotice] = useState('');
  const [fontsReady, setFontsReady] = useState(false);
  const viewport = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const awaitingFit = useRef(true);

  useEffect(() => {
    setRoot(storedMap());
    document.fonts.ready.then(() => setFontsReady(true));
  }, []);

  useEffect(() => {
    if (root) writeStored(STORAGE_KEY, serialize(root));
  }, [root]);

  const visible = useMemo(() => (root ? visibleNodes(root) : []), [root]);
  const boxes = useMemo(
    () => (root ? layout(root, (node) => sizes.get(node.id) ?? UNMEASURED) : new Map<string, Box>()),
    [root, sizes],
  );
  const ready = root !== null;
  const colours = useMemo(() => new Map(visible.map(({ node, colour }) => [node.id, branchColour(colour)])), [visible]);
  const measured = visible.length > 0 && visible.every(({ node }) => sizes.has(node.id));

  useLayoutEffect(() => {
    const next = new Map<string, Size>();
    for (const { node } of visible) {
      const element = elements.current.get(node.id);
      if (element) next.set(node.id, { width: element.offsetWidth, height: element.offsetHeight });
    }
    if (!sameSizes(next, sizes)) setSizes(next);
  }, [visible, sizes, fontsReady]);

  useLayoutEffect(() => {
    if (!awaitingFit.current || !measured || !viewport.current) return;
    awaitingFit.current = false;
    setView(fit(boxes.values(), viewport.current.clientWidth, viewport.current.clientHeight));
  }, [boxes, measured]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const bounds = element.getBoundingClientRect();
        const factor = Math.exp(-event.deltaY / 300);
        setView((current) => zoomAt(current, factor, event.clientX - bounds.left, event.clientY - bounds.top));
        return;
      }
      const sideways = event.shiftKey && event.deltaX === 0;
      setView((current) => ({
        ...current,
        x: current.x - (sideways ? event.deltaY : event.deltaX),
        y: current.y - (sideways ? 0 : event.deltaY),
      }));
    };
    // React pose ses écouteurs de molette en passif : preventDefault y serait ignoré.
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [ready]);

  function open(next: MapNode) {
    awaitingFit.current = true;
    setNotice('');
    setRoot(next);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      open(parse(await file.text()));
    } catch {
      setNotice(`« ${file.name} » n'est pas une carte valide.`);
    }
  }

  function exportFile() {
    if (!root) return;
    const name = root.text.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'carte';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([serialize(root)], { type: 'application/json' }));
    link.download = `${name}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (!root) {
    return (
      <div className="flex min-h-screen items-center justify-center font-mono text-sm text-muted">
        Préparation de la carte…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-panel px-4 py-2">
        <Link href="/" className="font-mono text-xs text-muted hover:text-ink">
          ← Tableau
        </Link>
        <h1 className="font-display text-xl font-extrabold uppercase tracking-[0.16em] text-ink">Carte</h1>
        <button type="button" className={ACTION} onClick={() => open(blankMap())}>
          Nouvelle carte
        </button>
        <button type="button" className={ACTION} onClick={() => fileInput.current?.click()}>
          Importer
        </button>
        <button type="button" className={ACTION} onClick={exportFile}>
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

      <main ref={viewport} className="relative min-h-0 flex-1 touch-none overflow-hidden">
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            visibility: measured ? 'visible' : 'hidden',
          }}
        >
          <svg aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-visible">
            {visible.flatMap(({ node }) =>
              visibleChildren(node).map((child) => (
                <path
                  key={child.id}
                  d={linkPath(boxes.get(node.id)!, boxes.get(child.id)!)}
                  fill="none"
                  strokeWidth={2}
                  strokeLinecap="round"
                  stroke={colours.get(child.id)}
                />
              )),
            )}
          </svg>

          {visible.map(({ node, depth, colour, side }) => {
            const box = boxes.get(node.id)!;
            return (
              <div
                key={node.id}
                ref={(element) => {
                  if (element) elements.current.set(node.id, element);
                  else elements.current.delete(node.id);
                }}
                className={nodeClass(depth, side)}
                style={{ left: box.x, top: box.y, '--branch': branchColour(colour) } as CSSProperties}
              >
                {node.text}
              </div>
            );
          })}

          {visible.flatMap(({ node, depth, colour, side }) => {
            if (node.children.length === 0) return [];
            const sides = depth > 0 || node.collapsed ? [side] : SIDES.filter((each) => childrenOn(root, node, each).length > 0);
            return sides.map((each) => (
              <FoldToggle
                key={`${node.id}-${each}`}
                node={node}
                box={boxes.get(node.id)!}
                side={each}
                colour={depth > 0 ? branchColour(colour) : undefined}
                onToggle={() => setRoot(toggleCollapsed(root, node.id))}
              />
            ));
          })}
        </div>
      </main>
    </div>
  );
}

function branchColour(index: number): string {
  return BRANCH_COLOURS[Math.max(0, index) % BRANCH_COLOURS.length];
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
  onToggle: () => void;
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
      onClick={onToggle}
    >
      {node.collapsed ? countDescendants(node) : null}
    </button>
  );
}
