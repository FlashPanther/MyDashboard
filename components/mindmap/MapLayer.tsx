import { memo, useLayoutEffect, type CSSProperties, type RefObject } from 'react';
import { branchColour, LINK, nodeClass, nodeStyle } from '@/components/mindmap/nodeStyle';
import type { Send } from '@/components/mindmap/types';
import type { Editing } from '@/lib/mindmap/editor';
import { linkPath, type Box } from '@/lib/mindmap/layout';
import { branchesOn, countDescendants, SIDES, type MapNode, type Side, type VisibleNode } from '@/lib/mindmap/tree';

const FADED = ' opacity-30';

type Observe = (element: HTMLElement | null) => (() => void) | undefined;

export const MapLayer = memo(function MapLayer({
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
      data-id={node.id}
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
