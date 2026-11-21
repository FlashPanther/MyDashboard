import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layout, linkPath } from '../lib/mindmap/layout.ts';
import { newNode } from '../lib/mindmap/tree.ts';

const size = () => ({ width: 100, height: 40 });
const gaps = { x: 50, y: 10 };
const at = (boxes: Map<string, { x: number; y: number }>, id: string) => {
  const { x, y } = boxes.get(id)!;
  return { x, y };
};

test('une racine seule est à l’origine', () => {
  assert.deepEqual(layout(newNode('', 'r'), size, gaps).get('r'), { x: 0, y: 0, width: 100, height: 40 });
});

test('les enfants s’empilent à droite et le parent se centre sur eux', () => {
  const root = newNode('', 'r');
  root.children.push(newNode('', 'a'), newNode('', 'b'));
  const boxes = layout(root, size, gaps);
  assert.deepEqual(at(boxes, 'a'), { x: 150, y: 0 });
  assert.deepEqual(at(boxes, 'b'), { x: 150, y: 50 });
  assert.deepEqual(at(boxes, 'r'), { x: 0, y: 25 });
});

test('une branche garde la place de ses enfants : les branches ne se chevauchent pas', () => {
  const root = newNode('', 'r');
  const a = newNode('', 'a');
  a.children.push(newNode('', 'a1'), newNode('', 'a2'));
  root.children.push(a, newNode('', 'b'));
  const boxes = layout(root, size, gaps);
  assert.equal(boxes.get('a')!.y, 25);
  assert.equal(boxes.get('b')!.y, 100);
});

test('des enfants plus petits se centrent sur un parent plus haut', () => {
  const root = newNode('', 'r');
  root.children.push(newNode('', 'a'));
  const boxes = layout(root, (node) => (node === root ? { width: 100, height: 100 } : size()), gaps);
  assert.equal(boxes.get('r')!.y, 0);
  assert.equal(boxes.get('a')!.y, 30);
});

test('les enfants d’un nœud replié n’ont pas de place', () => {
  const root = newNode('', 'r');
  const a = newNode('', 'a');
  a.children.push(newNode('', 'a1'), newNode('', 'a2'));
  a.collapsed = true;
  root.children.push(a);
  const boxes = layout(root, size, gaps);
  assert.equal(boxes.has('a1'), false);
  assert.equal(boxes.get('a')!.y, 0);
});

test('une branche de gauche pousse vers la gauche, en miroir', () => {
  const root = newNode('', 'r');
  const left = newNode('', 'l');
  left.side = 'left';
  left.children.push(newNode('', 'l1'));
  root.children.push(newNode('', 'a'), left);
  const boxes = layout(root, size, gaps);
  assert.deepEqual(at(boxes, 'a'), { x: 150, y: 0 });
  assert.deepEqual(at(boxes, 'l'), { x: -150, y: 0 });
  assert.deepEqual(at(boxes, 'l1'), { x: -300, y: 0 });
});

test('chaque côté se centre sur la racine sans regarder l’autre', () => {
  const root = newNode('', 'r');
  const left = newNode('', 'l');
  left.side = 'left';
  root.children.push(newNode('', 'a'), newNode('', 'b'), left);
  const boxes = layout(root, size, gaps);
  assert.equal(boxes.get('r')!.y, 25);
  assert.equal(boxes.get('l')!.y, 25);
});

test('un lien part du bord qui fait face à l’enfant', () => {
  const parent = { x: 0, y: 0, width: 100, height: 40 };
  assert.equal(linkPath(parent, { x: 150, y: 50, width: 100, height: 40 }), 'M 100 20 C 125 20, 125 70, 150 70');
  assert.equal(linkPath(parent, { x: -150, y: 0, width: 100, height: 40 }), 'M 0 20 C -25 20, -25 20, -50 20');
});
