import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from 'react';
import { ContextMenu, type MenuItem } from '@/components/mindmap/ContextMenu';
import { Ghost } from '@/components/mindmap/Ghost';
import { MapLayer } from '@/components/mindmap/MapLayer';
import type { Drag, Send } from '@/components/mindmap/types';
import type { Editing } from '@/lib/mindmap/editor';
import type { ZoomCommand } from '@/lib/mindmap/keymap';
import { dropAt, grabbed, type Carried } from '@/lib/mindmap/drop';
import { boxesIn, layout, type Point, type Size } from '@/lib/mindmap/layout';
import { branchIds, find, visibleNodes, type MapNode } from '@/lib/mindmap/tree';
import { fit, reveal, toWorld, zoomAt, type View } from '@/lib/mindmap/view';

const UNMEASURED: Size = { width: 120, height: 36 };
const DRAG_THRESHOLD = 5;
const NOTHING: ReadonlySet<string> = new Set();

export type CanvasHandle = { zoom: (command: ZoomCommand) => void };
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

export function MapCanvas({
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
  const closeMenu = useCallback(() => setMenu(null), []);
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

  function menuItems(id: string): MenuItem[] {
    const node = find(root, id);
    if (!node) return [];
    const items: MenuItem[] = [];
    if (id !== root.id) {
      items.push({
        label: node.task ? 'Redevenir une idée' : 'Transformer en tâche',
        run: () => send({ type: 'task', ids: [id] }),
      });
    }
    if (node.children.length) {
      items.push(
        { label: 'Replier toute la branche', run: () => send({ type: 'foldBranch', id, collapsed: true }) },
        { label: 'Déplier toute la branche', run: () => send({ type: 'foldBranch', id, collapsed: false }) },
      );
    }
    return items;
  }

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
        if (!id || id === editing?.id || menuItems(id).length === 0) return;
        event.preventDefault();
        send({ type: 'select', id });
        setMenu({ id, x: event.clientX, y: event.clientY });
      }}
      onPointerCancel={(event) => {
        if (press.current?.pointerId === event.pointerId) cancelGesture();
      }}
      onDoubleClick={(event) => {
        const id = nodeIdAt(event.target);
        if (id && !(event.target as Element).closest('button')) send({ type: 'edit', id });
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
      {menu && menuItems(menu.id).length > 0 && (
        <ContextMenu at={menu} items={menuItems(menu.id)} onClose={closeMenu} />
      )}
    </main>
  );
}
