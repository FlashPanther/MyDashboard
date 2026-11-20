export type Side = 'left' | 'right';

export type MapNode = {
  id: string;
  text: string;
  collapsed: boolean;
  children: MapNode[];
  colour?: number;
  side?: 'left';
};

type Direction = 'left' | 'right' | 'up' | 'down';

export type VisibleNode = { node: MapNode; parentId: string | null; depth: number; colour: number; side: Side };

export const SIDES: readonly Side[] = ['right', 'left'];

const MAX_DEPTH = 100;
const MAX_NODES = 5000;

export function newNode(text = '', id: string = crypto.randomUUID()): MapNode {
  return { id, text, collapsed: false, children: [] };
}

export function find(root: MapNode, id: string): MapNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function locate(root: MapNode, id: string): { parent: MapNode; index: number } | null {
  const index = root.children.findIndex((child) => child.id === id);
  if (index >= 0) return { parent: root, index };
  for (const child of root.children) {
    const found = locate(child, id);
    if (found) return found;
  }
  return null;
}

export function parentOf(root: MapNode, id: string): MapNode | null {
  return locate(root, id)?.parent ?? null;
}

export function isEmptyLeaf(node: MapNode): boolean {
  return node.text.trim() === '' && node.children.length === 0;
}

export function sameMap(a: MapNode, b: MapNode): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export function withinLimits(root: MapNode): boolean {
  let count = 0;
  const fits = (node: MapNode, depth: number): boolean =>
    depth <= MAX_DEPTH && ++count <= MAX_NODES && node.children.every((child) => fits(child, depth + 1));
  return fits(root, 0);
}

export function visibleChildren(node: MapNode): MapNode[] {
  return node.collapsed ? [] : node.children;
}

function sideOf(node: MapNode): Side {
  return node.side ?? 'right';
}

export function branchesOn(root: MapNode, side: Side): MapNode[] {
  return visibleChildren(root).filter((branch) => sideOf(branch) === side);
}

export function countDescendants(node: MapNode): number {
  return node.children.reduce((total, child) => total + 1 + countDescendants(child), 0);
}

export function visibleNodes(root: MapNode): VisibleNode[] {
  const result: VisibleNode[] = [];
  const visit = (node: MapNode, parentId: string | null, depth: number, colour: number, side: Side): void => {
    result.push({ node, parentId, depth, colour, side });
    for (const child of visibleChildren(node)) {
      if (depth === 0) visit(child, node.id, 1, child.colour ?? 0, sideOf(child));
      else visit(child, node.id, depth + 1, colour, side);
    }
  };
  visit(root, null, 0, 0, 'right');
  return result;
}

function withChildren(node: MapNode, children: MapNode[]): MapNode {
  return children.every((child, index) => child === node.children[index]) ? node : { ...node, children };
}

function update(root: MapNode, id: string, alter: (node: MapNode) => MapNode): MapNode {
  if (root.id === id) return alter(root);
  return withChildren(root, root.children.map((child) => update(child, id, alter)));
}

export function toggleCollapsed(root: MapNode, id: string): MapNode {
  return update(root, id, (node) => (node.children.length ? { ...node, collapsed: !node.collapsed } : node));
}

export function foldBranch(root: MapNode, id: string, collapsed: boolean): MapNode {
  const fold = (node: MapNode): MapNode => {
    const next = withChildren(node, node.children.map(fold));
    const folded = collapsed && node.children.length > 0;
    return next.collapsed === folded ? next : { ...next, collapsed: folded };
  };
  return update(root, id, fold);
}

function change(root: MapNode, mutate: (draft: MapNode) => void): MapNode {
  const draft = structuredClone(root);
  mutate(draft);
  for (const branch of draft.children) {
    for (const child of branch.children) stripBranchMarks(child);
  }
  colourBranches(draft);
  unfoldLeaves(draft);
  return draft;
}

function unfoldLeaves(node: MapNode): void {
  if (node.children.length === 0) node.collapsed = false;
  node.children.forEach(unfoldLeaves);
}

function stripBranchMarks(node: MapNode): void {
  delete node.colour;
  delete node.side;
  node.children.forEach(stripBranchMarks);
}

export function addChild(root: MapNode, parentId: string, id: string): MapNode {
  if (!find(root, parentId)) return root;
  return change(root, (draft) => {
    const parent = find(draft, parentId)!;
    parent.children.push(newNode('', id));
    parent.collapsed = false;
  });
}

export function addSibling(root: MapNode, siblingId: string, id: string, where: 'above' | 'below'): MapNode {
  if (!locate(root, siblingId)) return root;
  return change(root, (draft) => {
    const { parent, index } = locate(draft, siblingId)!;
    const node = newNode('', id);
    const sibling = parent.children[index];
    if (sibling.side) node.side = sibling.side;
    parent.children.splice(where === 'above' ? index : index + 1, 0, node);
  });
}

export function addParent(root: MapNode, childId: string, id: string): MapNode {
  if (!locate(root, childId)) return root;
  return change(root, (draft) => {
    const { parent, index } = locate(draft, childId)!;
    const node = newNode('', id);
    const child = parent.children[index];
    if (child.colour !== undefined) node.colour = child.colour;
    if (child.side) node.side = child.side;
    node.children.push(child);
    parent.children[index] = node;
  });
}

export function remove(root: MapNode, id: string): { root: MapNode; next: string | null } {
  const place = locate(root, id);
  if (!place) return { root, next: null };
  const { parent, index } = place;
  const next = parent.children[index + 1] ?? parent.children[index - 1] ?? parent;
  return {
    next: next.id,
    root: change(root, (draft) => {
      const target = locate(draft, id)!;
      target.parent.children.splice(target.index, 1);
    }),
  };
}

export function branchIds(root: MapNode, ids: string[]): Set<string> {
  const branches = ids.map((id) => find(root, id)).filter((node) => node !== null);
  return new Set(branches.flatMap((branch) => visibleNodes(branch).map(({ node }) => node.id)));
}

export function topmost(root: MapNode, ids: ReadonlySet<string>): string[] {
  const result: string[] = [];
  const visit = (node: MapNode): void => {
    for (const child of node.children) {
      if (ids.has(child.id)) result.push(child.id);
      else visit(child);
    }
  };
  visit(root);
  return result;
}

export function move(root: MapNode, moved: string[], parentId: string, beforeId: string | null, side: Side): MapNode {
  const ids = topmost(root, new Set(moved));
  const stuck = (id: string): boolean => find(find(root, id)!, parentId) !== null;
  if (ids.length === 0 || !find(root, parentId) || ids.some(stuck) || (beforeId !== null && ids.includes(beforeId))) {
    return root;
  }
  const next = change(root, (draft) => {
    const nodes = ids.map((id) => {
      const { parent, index } = locate(draft, id)!;
      return parent.children.splice(index, 1)[0];
    });
    const parent = find(draft, parentId)!;
    for (const node of nodes) {
      if (parent === draft && side === 'left') node.side = 'left';
      else delete node.side;
    }
    const index = parent.children.findIndex((child) => child.id === beforeId);
    parent.children.splice(index < 0 ? parent.children.length : index, 0, ...nodes);
    parent.collapsed = false;
  });
  return sameMap(bySide(next), bySide(root)) ? root : next;
}

function bySide(root: MapNode): MapNode {
  return { ...root, children: SIDES.flatMap((side) => root.children.filter((branch) => sideOf(branch) === side)) };
}

export function removeAll(root: MapNode, ids: ReadonlySet<string>): { root: MapNode; next: string | null } {
  const removed = topmost(root, ids);
  if (removed.length === 0) return { root, next: null };
  const gone = new Set(removed);
  const { parent, index } = locate(root, removed.at(-1)!)!;
  const kept = (node: MapNode): boolean => !gone.has(node.id);
  const next = parent.children.slice(index).find(kept) ?? parent.children.slice(0, index).reverse().find(kept) ?? parent;
  return {
    next: next.id,
    root: change(root, (draft) => {
      for (const id of removed) {
        const target = locate(draft, id)!;
        target.parent.children.splice(target.index, 1);
      }
    }),
  };
}

export function rename(root: MapNode, id: string, text: string): MapNode {
  const node = find(root, id);
  if (!node || node.text === text) return root;
  return change(root, (draft) => {
    find(draft, id)!.text = text;
  });
}

export function neighbour(root: MapNode, id: string, direction: Direction): string | null {
  const visible = visibleNodes(root);
  const current = visible.find((entry) => entry.node.id === id);
  if (!current) return null;
  if (direction === 'left' || direction === 'right') {
    if (current.depth === 0) return branchesOn(root, direction)[0]?.id ?? null;
    if (direction !== current.side) return current.parentId;
    return visibleChildren(current.node)[0]?.id ?? null;
  }
  const peers = visible.filter((entry) => entry.depth === current.depth && entry.side === current.side);
  return peers[peers.indexOf(current) + (direction === 'up' ? -1 : 1)]?.node.id ?? null;
}

function colourBranches(root: MapNode): void {
  const used = new Set<number>();
  const uncoloured = root.children.filter((branch) => {
    if (branch.colour === undefined || used.has(branch.colour)) return true;
    used.add(branch.colour);
    return false;
  });
  for (const branch of uncoloured) {
    branch.colour = 0;
    while (used.has(branch.colour)) branch.colour++;
    used.add(branch.colour);
  }
}

export function serialize(root: MapNode): string {
  return JSON.stringify({ version: 1, root }, null, 2);
}

export function parse(json: string): MapNode {
  const data: unknown = JSON.parse(json);
  if (typeof data !== 'object' || data === null || !('root' in data)) {
    throw new Error('Fichier de carte invalide');
  }
  const root = parseNode(data.root, 0, new Set());
  colourBranches(root);
  return root;
}

function parseNode(value: unknown, depth: number, seen: Set<string>): MapNode {
  if (typeof value !== 'object' || value === null) throw new Error('Nœud invalide');
  const { id, text, collapsed, children, colour, side } = value as Record<string, unknown>;
  if (typeof text !== 'string' || !Array.isArray(children)) throw new Error('Nœud invalide');
  if (depth > MAX_DEPTH || seen.size >= MAX_NODES) throw new Error('Carte trop grande');
  const uniqueId = typeof id === 'string' && id !== '' && !seen.has(id) ? id : crypto.randomUUID();
  seen.add(uniqueId);
  const kept = children
    .map((child) => parseNode(child, depth + 1, seen))
    .filter((child) => !isEmptyLeaf(child));
  const branch = depth === 1;
  return {
    id: uniqueId,
    text: text.trim(),
    collapsed: collapsed === true && kept.length > 0,
    children: kept,
    ...(branch && typeof colour === 'number' && Number.isInteger(colour) && colour >= 0 ? { colour } : {}),
    ...(branch && side === 'left' ? { side } : {}),
  };
}
