import { branchesOn, visibleChildren, type MapNode } from './tree.ts';

export type Size = { width: number; height: number };
export type Box = Size & { x: number; y: number };
type Gaps = { x: number; y: number };

type Measure = { size: Size; childrenHeight: number; height: number };

const GAPS: Gaps = { x: 56, y: 14 };

export function layout(root: MapNode, sizeOf: (node: MapNode) => Size, gaps: Gaps = GAPS): Map<string, Box> {
  const boxes = new Map<string, Box>();
  const measures = new Map<string, Measure>();

  const stackHeight = (nodes: MapNode[]): number =>
    nodes.reduce((total, node) => total + measure(node).height, 0) + gaps.y * Math.max(0, nodes.length - 1);

  const measure = (node: MapNode): Measure => {
    const childrenHeight = stackHeight(visibleChildren(node));
    const size = sizeOf(node);
    const result = { size, childrenHeight, height: Math.max(size.height, childrenHeight) };
    measures.set(node.id, result);
    return result;
  };

  const stack = (nodes: MapNode[], edge: number, top: number, direction: 1 | -1): void => {
    for (const node of nodes) {
      const { size, childrenHeight, height } = measures.get(node.id)!;
      const x = direction > 0 ? edge : edge - size.width;
      boxes.set(node.id, { x, y: top + (height - size.height) / 2, ...size });
      const childEdge = direction > 0 ? x + size.width + gaps.x : x - gaps.x;
      stack(visibleChildren(node), childEdge, top + (height - childrenHeight) / 2, direction);
      top += height + gaps.y;
    }
  };

  const size = sizeOf(root);
  const right = branchesOn(root, 'right');
  const left = branchesOn(root, 'left');
  const rightHeight = stackHeight(right);
  const leftHeight = stackHeight(left);
  const height = Math.max(size.height, rightHeight, leftHeight);
  boxes.set(root.id, { x: 0, y: (height - size.height) / 2, ...size });
  stack(right, size.width + gaps.x, (height - rightHeight) / 2, 1);
  stack(left, -gaps.x, (height - leftHeight) / 2, -1);
  return boxes;
}

export function linkPath(parent: Box, child: Box): string {
  const leftwards = child.x < parent.x;
  const x1 = leftwards ? parent.x : parent.x + parent.width;
  const x2 = leftwards ? child.x + child.width : child.x;
  const y1 = parent.y + parent.height / 2;
  const y2 = child.y + child.height / 2;
  const middle = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`;
}
