import type { Box } from './layout.ts';
import { branchesOn, branchIds, SIDES, visibleChildren, visibleNodes, type MapNode, type Side } from './tree.ts';

export type Drop = { parentId: string; beforeId: string | null; side: Side };

const REACH = 260;
const VERTICAL_WEIGHT = 3;

export function dropAt(root: MapNode, boxes: Map<string, Box>, draggedIds: string[], ghost: Box): Drop | null {
  const own = branchIds(root, draggedIds);
  const centre = ghost.y + ghost.height / 2;

  const extent = (node: MapNode): [number, number] => {
    const box = boxes.get(node.id)!;
    const spans = visibleChildren(node).map(extent);
    return [Math.min(box.y, ...spans.map(([top]) => top)), Math.max(box.y + box.height, ...spans.map(([, bottom]) => bottom))];
  };

  let best: { parent: MapNode; side: Side; siblings: MapNode[] } | null = null;
  let nearest = REACH;
  for (const { node, depth, side: nodeSide } of visibleNodes(root)) {
    if (own.has(node.id)) continue;
    const box = boxes.get(node.id)!;
    for (const side of depth === 0 ? SIDES : [nodeSide]) {
      const gap = side === 'right' ? ghost.x - (box.x + box.width) : box.x - (ghost.x + ghost.width);
      if (gap < 0) continue;
      const siblings = depth === 0 ? branchesOn(root, side) : visibleChildren(node);
      const spans = siblings.map(extent);
      const top = Math.min(box.y, ...spans.map(([above]) => above));
      const bottom = Math.max(box.y + box.height, ...spans.map(([, below]) => below));
      const distance = Math.hypot(gap, VERTICAL_WEIGHT * Math.max(top - centre, centre - bottom, 0));
      if (distance < nearest) {
        best = { parent: node, side, siblings };
        nearest = distance;
      }
    }
  }
  if (!best) return null;

  const next = best.siblings.find((child) => {
    const box = boxes.get(child.id)!;
    return !own.has(child.id) && box.y + box.height / 2 > centre;
  });
  return { parentId: best.parent.id, beforeId: next?.id ?? null, side: best.side };
}
