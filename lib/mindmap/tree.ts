export type Side = 'left' | 'right';

export type MapNode = {
  id: string;
  text: string;
  collapsed: boolean;
  children: MapNode[];
  colour?: number;
  side?: 'left';
};

export type VisibleNode = { node: MapNode; parentId: string | null; depth: number; colour: number; side: Side };

export const SIDES: readonly Side[] = ['right', 'left'];

export function newNode(text = '', id: string = crypto.randomUUID()): MapNode {
  return { id, text, collapsed: false, children: [] };
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

export function toggleCollapsed(root: MapNode, id: string): MapNode {
  if (root.id === id) return root.children.length ? { ...root, collapsed: !root.collapsed } : root;
  const children = root.children.map((child) => toggleCollapsed(child, id));
  return children.every((child, index) => child === root.children[index]) ? root : { ...root, children };
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
  const uniqueId = typeof id === 'string' && id !== '' && !seen.has(id) ? id : crypto.randomUUID();
  seen.add(uniqueId);
  const kept = children
    .map((child) => parseNode(child, depth + 1, seen))
    .filter((child) => child.text !== '' || child.children.length > 0);
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
