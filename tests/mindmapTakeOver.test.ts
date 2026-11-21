import assert from 'node:assert/strict';
import { test } from 'node:test';
import { takeOverMap } from '../lib/mindmap/takeOver.ts';

const tasks = [
  { id: 'p1', title: 'Rendre les livres', list: 'Perso', listId: 'L9' },
  { id: 'p2', title: 'Déjà dans une carte', list: 'Perso', listId: 'L9' },
  { id: 'w1', title: 'Relancer le devis', list: 'Travail', listId: 'L2' },
  { id: 'e1', title: '   ', list: 'Travail', listId: 'L2' },
];

function ids() {
  let count = 0;
  return () => `n${++count}`;
}

test('les tâches libres deviennent une carte : une branche par liste, un nœud-tâche par tâche, chacun avec son origine', () => {
  const root = takeOverMap(tasks, new Set(['p2']), ids())!;
  assert.equal(root.text, 'Mes tâches Google');
  assert.deepEqual(
    root.children.map((branch) => [branch.text, branch.children.map((node) => [node.text, node.task, node.from])]),
    [
      ['Perso', [['Rendre les livres', { done: false }, { taskId: 'p1', listId: 'L9' }]]],
      ['Travail', [['Relancer le devis', { done: false }, { taskId: 'w1', listId: 'L2' }]]],
    ],
  );
  assert.equal(new Set(root.children.map((branch) => branch.colour)).size, 2);
});

test('sans tâche libre, il n’y a pas de carte à créer', () => {
  assert.equal(takeOverMap(tasks, new Set(['p1', 'p2', 'w1'])), null);
  assert.equal(takeOverMap([], new Set()), null);
});
