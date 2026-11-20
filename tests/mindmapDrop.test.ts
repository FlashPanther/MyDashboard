import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dropAt } from '../lib/mindmap/drop.ts';
import { carried, layout } from '../lib/mindmap/layout.ts';
import { move, newNode, type MapNode } from '../lib/mindmap/tree.ts';

const size = () => ({ width: 100, height: 30 });

function scene(arrange: (nodes: Record<string, MapNode>) => void = () => {}) {
  const nodes = Object.fromEntries(['root', 'a', 'b', 'c', 'a1'].map((id) => [id, newNode(id, id)]));
  nodes.a.children.push(nodes.a1);
  nodes.root.children.push(nodes.a, nodes.b, nodes.c);
  [nodes.a, nodes.b, nodes.c].forEach((branch, index) => (branch.colour = index));
  arrange(nodes);
  const root = nodes.root;
  const boxes = layout(root, size);
  const dragged = (id: string, dx: number, dy: number) => {
    const box = boxes.get(id)!;
    return dropAt(root, boxes, [id], { ...box, x: box.x + dx, y: box.y + dy });
  };
  const beside = (id: string, target: string, dy = 0) => {
    const from = boxes.get(id)!;
    const to = boxes.get(target)!;
    return dragged(id, to.x + to.width + 40 - from.x, to.y - from.y + dy);
  };
  return { root, boxes, dragged, beside };
}

test('un nœud à peine bougé garde sa place', () => {
  assert.deepEqual(scene().dragged('b', 3, 3), { parentId: 'root', beforeId: 'c', side: 'right' });
});

test('un nœud lâché à droite d’un autre devient son enfant', () => {
  assert.deepEqual(scene().beside('c', 'b'), { parentId: 'b', beforeId: null, side: 'right' });
});

test('la hauteur du nœud glissé fixe son rang parmi ses futurs frères', () => {
  const { boxes, dragged } = scene();
  const up = boxes.get('a')!.y - boxes.get('c')!.y - 20;
  assert.deepEqual(dragged('c', 0, up), { parentId: 'root', beforeId: 'a', side: 'right' });
  assert.deepEqual(dragged('a', 0, 120), { parentId: 'root', beforeId: null, side: 'right' });
});

test('le rang se lit aussi parmi les enfants d’un autre parent', () => {
  assert.deepEqual(scene().beside('c', 'a', -40), { parentId: 'a', beforeId: 'a1', side: 'right' });
});

test('un nœud replié reçoit le nœud en dernier, sans regarder ses enfants cachés', () => {
  const { beside } = scene((nodes) => {
    nodes.a.collapsed = true;
  });
  assert.deepEqual(beside('c', 'a', -10), { parentId: 'a', beforeId: null, side: 'right' });
});

test('un parent large garde son enfant à peine bougé, même centré loin de lui', () => {
  const root = newNode('root', 'root');
  const a = newNode('a', 'a');
  const b = newNode('b', 'b');
  a.children.push(newNode('a1', 'a1'));
  b.children.push(...Array.from({ length: 9 }, (_, index) => newNode('', `b${index}`)));
  root.children.push(a, b);
  const boxes = layout(root, (node) => ({ width: node === b ? 300 : 100, height: 34 }));
  const first = boxes.get('b0')!;
  assert.deepEqual(dropAt(root, boxes, ['b0'], { ...first, x: first.x + 6 }), { parentId: 'b', beforeId: 'b1', side: 'right' });
});

test('un nœud n’est jamais rattaché à sa propre branche', () => {
  const { beside } = scene();
  assert.equal(beside('a', 'a')?.parentId, 'b');
  assert.equal(beside('a', 'a1')?.parentId, 'b');
});

test('lâché à gauche de la racine, le nœud passe de l’autre côté', () => {
  const { boxes, root } = scene();
  const box = boxes.get('a')!;
  const ghost = { ...box, x: -40 - box.width, y: boxes.get('root')!.y };
  assert.deepEqual(dropAt(root, boxes, ['a'], ghost), { parentId: 'root', beforeId: null, side: 'left' });
});

test('à gauche, on range et on imbrique comme à droite', () => {
  const { boxes, root } = scene((nodes) => {
    nodes.a.side = 'left';
    nodes.b.side = 'left';
  });
  const dragged = boxes.get('c')!;
  const first = boxes.get('a')!;
  assert.deepEqual(dropAt(root, boxes, ['c'], { ...dragged, x: first.x, y: first.y + 30 }), {
    parentId: 'root',
    beforeId: 'b',
    side: 'left',
  });
  const leaf = boxes.get('b')!;
  assert.deepEqual(dropAt(root, boxes, ['c'], { ...dragged, x: leaf.x - 40 - dragged.width, y: leaf.y }), {
    parentId: 'b',
    beforeId: null,
    side: 'left',
  });
});

test('une branche n’accueille rien du côté qui regarde la racine', () => {
  const { boxes, root } = scene();
  const target = boxes.get('a')!;
  const drop = dropAt(root, boxes, ['c'], { x: target.x - 30, y: target.y, width: 20, height: 30 });
  assert.deepEqual([drop?.parentId, drop?.side], ['root', 'right']);
});

test('loin de tout nœud, ou pour la racine, il n’y a pas de destination', () => {
  const { dragged } = scene();
  assert.equal(dragged('a', 2000, 0), null);
  assert.equal(dragged('a', -2000, 0), null);
  assert.equal(dragged('root', 300, 0), null);
});

test('un groupe se range en sautant ses propres nœuds', () => {
  const { boxes, root } = scene();
  const box = boxes.get('a')!;
  assert.deepEqual(dropAt(root, boxes, ['a', 'b'], { ...box, y: box.y + 5 }), { parentId: 'root', beforeId: 'c', side: 'right' });
});

const outline = (node: MapNode): string =>
  node.text + (node.side ? '←' : '') + (node.collapsed ? '[+]' : '') + (node.children.length ? `(${node.children.map(outline).join(' ')})` : '');

test('déplacer range le nœud avant un frère, ou en dernier', () => {
  const { root } = scene();
  assert.equal(outline(move(root, ['c'], 'root', 'a', 'right')), 'root(c a(a1) b)');
  assert.equal(outline(move(root, ['a'], 'root', null, 'right')), 'root(b c a(a1))');
});

test('déplacer emporte la branche, déplie le nouveau parent et laisse l’ancienne carte intacte', () => {
  const { root } = scene((nodes) => {
    nodes.b.children.push(newNode('b1', 'b1'));
    nodes.b.collapsed = true;
  });
  assert.equal(outline(move(root, ['a'], 'b', 'b1', 'right')), 'root(b(a(a1) b1) c)');
  assert.equal(outline(root), 'root(a(a1) b[+](b1) c)');
});

test('un parent vidé par un déplacement n’est plus marqué replié', () => {
  const { root } = scene((nodes) => {
    nodes.a.collapsed = true;
  });
  assert.equal(outline(move(root, ['a1'], 'root', null, 'right')), 'root(a b c a1)');
});

test('le côté est noté sous la racine et oublié plus profond, la couleur suit la règle des branches', () => {
  const { root } = scene();
  const left = move(root, ['a1'], 'root', null, 'left');
  assert.equal(outline(left), 'root(a b c a1←)');
  assert.equal(left.children[3].colour, 3);
  const deeper = move(left, ['a1'], 'b', null, 'left');
  assert.equal(outline(deeper), 'root(a b(a1) c)');
  assert.equal(deeper.children[1].children[0].colour, undefined);
});

test('un groupe déplacé garde son ordre', () => {
  const { root } = scene();
  assert.equal(outline(move(root, ['b', 'c'], 'a', 'a1', 'right')), 'root(a(b c a1))');
});

test('les déplacements impossibles ou sans effet rendent la même carte', () => {
  const { root } = scene();
  assert.equal(move(root, ['root'], 'a', null, 'right'), root);
  assert.equal(move(root, ['a'], 'a', null, 'right'), root);
  assert.equal(move(root, ['a'], 'a1', null, 'right'), root);
  assert.equal(move(root, ['a'], 'root', 'a', 'right'), root);
  assert.equal(move(root, ['a'], 'inconnu', null, 'right'), root);
  assert.equal(move(root, ['b'], 'root', 'c', 'right'), root);
});

test('la copie glissée suit le décalage, et se retourne autour du nœud saisi', () => {
  const { boxes } = scene();
  const a = boxes.get('a')!;
  const a1 = boxes.get('a1')!;
  const shifted = carried(boxes, ['a', 'a1'], 'a', 10, 20, false);
  assert.deepEqual(shifted.get('a1'), { ...a1, x: a1.x + 10, y: a1.y + 20 });
  const mirrored = carried(boxes, ['a', 'a1'], 'a', 0, 0, true);
  assert.deepEqual(mirrored.get('a'), a);
  assert.equal(mirrored.get('a1')!.x, a.x - (a1.x - a.x - a.width) - a1.width);
});
