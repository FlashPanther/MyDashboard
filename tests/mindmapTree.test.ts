import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  branchesOn,
  countDescendants,
  foldBranch,
  newNode,
  parse,
  serialize,
  toggleCollapsed,
  toggleDone,
  toggleTask,
  visibleNodes,
  withinLimits,
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

test('replier une feuille ou un nœud inconnu rend la même carte, pas une copie', () => {
  const { root } = tree();
  assert.equal(toggleCollapsed(root, 'a1'), root);
  assert.equal(toggleCollapsed(root, 'inconnu'), root);
});

test('replier ne recopie que le chemin modifié', () => {
  const { root, b } = tree();
  assert.equal(toggleCollapsed(root, 'a').children[1], b);
});

test('chaque nœud visible porte sa profondeur, la couleur et le côté de sa branche', () => {
  const { root, b } = tree();
  b.side = 'left';
  assert.deepEqual(
    visibleNodes(root).map(({ node, depth, colour, side }) => [node.text, depth, colour, side]),
    [
      ['root', 0, 0, 'right'],
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
  assert.deepEqual(branchesOn(root, 'right'), [a]);
  assert.deepEqual(branchesOn(root, 'left'), [b]);
});

test('une racine repliée n’a de branche d’aucun côté', () => {
  const { root } = tree();
  root.collapsed = true;
  assert.deepEqual(branchesOn(root, 'right'), []);
});

test('chaque nœud visible connaît son parent', () => {
  const { root } = tree();
  assert.deepEqual(
    visibleNodes(root).map((entry) => entry.parentId),
    [null, 'root', 'a', 'root', 'b'],
  );
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

test('une carte trop profonde ou trop grande est refusée à la lecture', () => {
  let chain: unknown = { text: 'fond', children: [] };
  for (let level = 0; level < 200; level++) chain = { text: 'x', children: [chain] };
  assert.throws(() => parse(JSON.stringify({ root: chain })), /trop grande/);

  const wide = { text: 'r', children: Array.from({ length: 6000 }, () => ({ text: 'x', children: [] })) };
  assert.throws(() => parse(JSON.stringify({ root: wide })), /trop grande/);
});

test('une carte de quelques centaines de nœuds sur dix niveaux est acceptée', () => {
  let chain: unknown = { text: 'fond', children: [] };
  for (let level = 0; level < 10; level++) {
    chain = { text: 'x', children: [chain, ...Array.from({ length: 40 }, () => ({ text: 'y', children: [] }))] };
  }
  assert.equal(parse(JSON.stringify({ root: chain })).text, 'x');
});

test('toute carte dans les limites se relit après export', () => {
  let chain = newNode('fond');
  for (let level = 0; level < 100; level++) chain = { ...newNode('x'), children: [chain] };
  assert.equal(withinLimits(chain), true);
  assert.equal(parse(serialize(chain)).text, 'x');
  assert.equal(withinLimits({ ...newNode('y'), children: [chain] }), false);
});

function deep() {
  const { root, a } = tree();
  a.children[0].children.push(newNode('a11', 'a11'));
  return root;
}

test('replier toute une branche replie chacun de ses niveaux et rien d’autre', () => {
  const folded = foldBranch(deep(), 'a', true);
  assert.deepEqual(texts(folded), ['root', 'a', 'b', 'b1']);
  assert.deepEqual(texts(toggleCollapsed(folded, 'a')), ['root', 'a', 'a1', 'b', 'b1']);
});

test('déplier toute une branche rouvre chacun de ses niveaux', () => {
  const root = deep();
  const reopened = foldBranch(foldBranch(root, 'a', true), 'a', false);
  assert.deepEqual(reopened, root);
  assert.deepEqual(texts(foldBranch(foldBranch(root, 'root', true), 'root', false)), ['root', 'a', 'a1', 'a11', 'b', 'b1']);
});

test('une feuille n’est jamais marquée repliée, et replier sans effet rend la même carte', () => {
  const root = deep();
  const folded = foldBranch(root, 'a', true);
  assert.equal(folded.children[0].children[0].children[0].collapsed, false);
  assert.equal(foldBranch(folded, 'a', true), folded);
  assert.equal(foldBranch(root, 'a', false), root);
  assert.equal(foldBranch(root, 'a11', true), root);
  assert.equal(foldBranch(root, 'inconnu', true), root);
});

test('marquer un nœud en fait une tâche à faire, le marquer de nouveau le rend à l’état d’idée', () => {
  const { root } = tree();
  const marked = toggleTask(root, ['a1']);
  assert.equal(marked.children[0].children[0].task, 'todo');
  assert.equal(root.children[0].children[0].task, undefined);
  assert.equal(toggleTask(marked, ['a1']).children[0].children[0].task, undefined);
});

test('la racine ne devient jamais une tâche', () => {
  const { root } = tree();
  assert.equal(toggleTask(root, ['root']), root);
  assert.equal(toggleTask(root, ['root', 'a']).task, undefined);
});

test('marquer un groupe mixte complète les tâches sans toucher à celles déjà cochées', () => {
  const { root } = tree();
  const mixed = toggleTask(toggleDone(toggleTask(root, ['a']), ['a']), ['a', 'b']);
  assert.deepEqual(mixed.children.map((node) => node.task), ['done', 'todo']);
  assert.deepEqual(toggleTask(mixed, ['a', 'b']).children.map((node) => node.task), [undefined, undefined]);
});

test('cocher ne touche que les tâches, et décoche quand tout est déjà fait', () => {
  const { root } = tree();
  assert.equal(toggleDone(root, ['a']), root);
  const done = toggleDone(toggleTask(root, ['a']), ['a', 'b']);
  assert.deepEqual(done.children.map((node) => node.task), ['done', undefined]);
  assert.equal(toggleDone(done, ['a']).children[0].task, 'todo');
});

test('une tâche survit à l’enregistrement, une valeur inconnue ou sur la racine est ignorée', () => {
  const { root } = tree();
  const saved = toggleDone(toggleTask(root, ['a', 'b1']), ['a']);
  assert.deepEqual(parse(serialize(saved)), saved);
  const odd = parse(
    JSON.stringify({ root: { text: 'r', task: 'done', children: [{ text: 'x', task: 'plus tard', children: [] }] } }),
  );
  assert.equal(odd.task, undefined);
  assert.equal(odd.children[0].task, undefined);
});
