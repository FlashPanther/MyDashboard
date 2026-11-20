export type Side = 'left' | 'right';

export type MapNode = {
  id: string;
  text: string;
  collapsed: boolean;
  children: MapNode[];
  colour?: number;
  side?: 'left';
};

export type VisibleNode = { node: MapNode; depth: number; colour: number; side: Side };

export const SIDES: readonly Side[] = ['right', 'left'];

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

export function visibleChildren(node: MapNode): MapNode[] {
  return node.collapsed ? [] : node.children;
}

export function sideOf(node: MapNode): Side {
  return node.side ?? 'right';
}

export function childrenOn(root: MapNode, node: MapNode, side: Side): MapNode[] {
  return visibleChildren(node).filter((child) => node !== root || sideOf(child) === side);
}

export function countDescendants(node: MapNode): number {
  return node.children.reduce((total, child) => total + 1 + countDescendants(child), 0);
}

export function visibleNodes(root: MapNode): VisibleNode[] {
  const result: VisibleNode[] = [];
  const visit = (node: MapNode, depth: number, colour: number, side: Side): void => {
    result.push({ node, depth, colour, side });
    for (const child of visibleChildren(node)) {
      if (depth === 0) visit(child, 1, child.colour ?? 0, sideOf(child));
      else visit(child, depth + 1, colour, side);
    }
  };
  visit(root, 0, -1, 'right');
  return result;
}

export function change(root: MapNode, mutate: (draft: MapNode) => void): MapNode {
  const draft = structuredClone(root);
  mutate(draft);
  normalise(draft);
  return draft;
}

export function toggleCollapsed(root: MapNode, id: string): MapNode {
  return change(root, (draft) => {
    const node = find(draft, id);
    if (node?.children.length) node.collapsed = !node.collapsed;
  });
}

function normalise(root: MapNode): void {
  const strip = (node: MapNode): void => {
    delete node.colour;
    delete node.side;
    node.children.forEach(strip);
  };
  delete root.colour;
  delete root.side;
  root.children.forEach((branch) => branch.children.forEach(strip));

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
  const root = parseNode(data.root, new Set());
  normalise(root);
  return root;
}

function parseNode(value: unknown, seen: Set<string>): MapNode {
  if (typeof value !== 'object' || value === null) throw new Error('Nœud invalide');
  const { id, text, collapsed, children, colour, side } = value as Record<string, unknown>;
  if (typeof text !== 'string' || !Array.isArray(children)) throw new Error('Nœud invalide');
  const uniqueId = typeof id === 'string' && id !== '' && !seen.has(id) ? id : crypto.randomUUID();
  seen.add(uniqueId);
  const kept = children
    .map((child) => parseNode(child, seen))
    .filter((child) => child.text !== '' || child.children.length > 0);
  return {
    id: uniqueId,
    text: text.trim(),
    collapsed: collapsed === true && kept.length > 0,
    children: kept,
    ...(typeof colour === 'number' && Number.isInteger(colour) && colour >= 0 ? { colour } : {}),
    ...(side === 'left' ? { side } : {}),
  };
}
