import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  childrenOn,
  countDescendants,
  newNode,
  parse,
  serialize,
  toggleCollapsed,
  visibleNodes,
  type MapNode,
} from '../lib/mindmap/tree.ts';

function tree() {
  const root = newNode('root', 'root');
  const a = newNode('a', 'a');
  const b = newNode('b', 'b');
  a.children.push(newNode('a1', 'a1'));
  b.children.push(newNode('b1', 'b1'));
  a.colour = 0;
  b.colour = 1;
  root.children.push(a, b);
  return { root, a, b };
}

const texts = (root: MapNode) => visibleNodes(root).map((entry) => entry.node.text);

test('un nœud replié cache toute sa branche', () => {
  const { root } = tree();
  assert.deepEqual(texts(toggleCollapsed(root, 'a')), ['root', 'a', 'b', 'b1']);
});

test('replier ne touche pas à la carte d’origine, et déplier la retrouve', () => {
  const { root } = tree();
  const folded = toggleCollapsed(root, 'a');
  assert.deepEqual(texts(root), ['root', 'a', 'a1', 'b', 'b1']);
  assert.deepEqual(toggleCollapsed(folded, 'a'), root);
});

test('une feuille ne se replie pas', () => {
  const { root } = tree();
  assert.deepEqual(toggleCollapsed(root, 'a1'), root);
});

test('chaque nœud visible porte sa profondeur, la couleur et le côté de sa branche', () => {
  const { root, b } = tree();
  b.side = 'left';
  assert.deepEqual(
    visibleNodes(root).map(({ node, depth, colour, side }) => [node.text, depth, colour, side]),
    [
      ['root', 0, -1, 'right'],
      ['a', 1, 0, 'right'],
      ['a1', 2, 0, 'right'],
      ['b', 1, 1, 'left'],
      ['b1', 2, 1, 'left'],
    ],
  );
});

test('la racine répartit ses branches entre la droite et la gauche', () => {
  const { root, a, b } = tree();
  b.side = 'left';
  assert.deepEqual(childrenOn(root, root, 'right'), [a]);
  assert.deepEqual(childrenOn(root, root, 'left'), [b]);
  assert.deepEqual(childrenOn(root, a, 'left'), a.children);
});

test('le compte des descendants couvre tous les niveaux', () => {
  assert.equal(countDescendants(tree().root), 4);
});

test('une carte exportée puis relue est identique', () => {
  const { root, a, b } = tree();
  a.collapsed = true;
  b.side = 'left';
  assert.deepEqual(parse(serialize(root)), root);
});

test('un fichier qui n’est pas une carte est refusé', () => {
  assert.throws(() => parse('{"hello":1}'));
  assert.throws(() => parse('{"root":{"text":"x"}}'));
  assert.throws(() => parse('pas du json'));
});

test('la lecture nettoie les textes et retire les feuilles vides', () => {
  const empty = { text: ' ', children: [] };
  const root = parse(
    JSON.stringify({ root: { text: ' idée \n', children: [empty, { text: '', children: [empty, { text: ' gardé ', children: [] }] }] } }),
  );
  assert.equal(root.text, 'idée');
  assert.equal(root.children.length, 1);
  assert.deepEqual(root.children[0].children.map((child) => child.text), ['gardé']);
});

test('la lecture donne un identifiant neuf aux nœuds qui n’en ont pas ou le partagent', () => {
  const root = parse(
    JSON.stringify({ root: { id: 'x', text: 'r', children: [{ id: 'x', text: 'c', children: [] }, { text: 'd', children: [] }] } }),
  );
  const ids = [root.id, ...root.children.map((child) => child.id)];
  assert.equal(new Set(ids).size, 3);
  assert.ok(ids.every((id) => id !== ''));
});

test('la lecture colore les branches sans couleur et sépare celles qui la partagent', () => {
  const child = (text: string, colour?: number) => ({ text, children: [], colour });
  const root = parse(JSON.stringify({ root: { text: 'r', children: [child('a'), child('b', 0), child('c', 0), child('d', -2)] } }));
  assert.deepEqual(root.children.map((node) => node.colour), [1, 0, 2, 3]);
});

test('la lecture ne garde couleur et côté que sur les branches de premier niveau', () => {
  const deep = { text: 'deep', side: 'left', colour: 5, children: [] };
  const root = parse(
    JSON.stringify({ root: { text: 'r', side: 'left', colour: 3, children: [{ text: 'a', side: 'up', children: [deep] }, { text: 'b', side: 'left', children: [] }] } }),
  );
  assert.equal(root.side, undefined);
  assert.equal(root.colour, undefined);
  assert.equal(root.children[0].side, undefined);
  assert.equal(root.children[0].children[0].side, undefined);
  assert.equal(root.children[0].children[0].colour, undefined);
  assert.equal(root.children[1].side, 'left');
});

test('un nœud marqué replié mais sans enfant est lu déplié', () => {
  const root = parse(JSON.stringify({ root: { text: 'r', children: [{ text: 'a', collapsed: true, children: [] }] } }));
  assert.equal(root.children[0].collapsed, false);
});
