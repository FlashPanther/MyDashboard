import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyPlan, parseLinks, planTasks } from '../lib/mindmap/links.ts';
import { newNode, type MapNode } from '../lib/mindmap/tree.ts';

function map(): MapNode {
  const root = newNode('Voyage au Japon', 'root');
  const before = newNode('Avant de partir', 'avant');
  before.children.push(
    { ...newNode('Billets\nd’avion', 'billets'), task: { done: false } },
    { ...newNode('Passeports', 'passeports'), task: { done: true } },
    newNode('Idée de cadeau', 'cadeau'),
  );
  root.children.push(before);
  return root;
}

const link = (taskId: string) => ({ taskId, listId: 'liste' });

test('chaque nœud-tâche sans lien est à créer, avec son chemin dans la carte et son état', () => {
  assert.deepEqual(planTasks(map(), {}), {
    create: [
      { nodeId: 'billets', title: 'Billets d’avion', notes: 'Carte : Voyage au Japon › Avant de partir', done: false },
      { nodeId: 'passeports', title: 'Passeports', notes: 'Carte : Voyage au Japon › Avant de partir', done: true },
    ],
    detach: [],
  });
});

test('une tâche déjà liée n’est pas recréée, une idée n’est jamais envoyée', () => {
  const plan = planTasks(map(), { billets: link('g1') });
  assert.deepEqual(plan.create.map((task) => task.nodeId), ['passeports']);
});

test('un lien dont le nœud a disparu ou n’est plus une tâche est détaché', () => {
  const plan = planTasks(map(), { billets: link('g1'), cadeau: link('g2'), disparu: link('g3') });
  assert.deepEqual(plan.detach, ['cadeau', 'disparu']);
});

test('une tâche sans texte attend, un titre trop long est coupé à la limite de Google', () => {
  const root = newNode('Carte', 'root');
  root.children.push({ ...newNode('   ', 'vide'), task: { done: false } }, { ...newNode('x'.repeat(1500), 'long'), task: { done: false } });
  const plan = planTasks(root, {});
  assert.deepEqual(plan.create.map((task) => [task.nodeId, task.title.length]), [['long', 1024]]);
});

test('appliquer le plan ajoute les liens créés et retire les détachés', () => {
  assert.deepEqual(applyPlan({ a: link('g1'), b: link('g2') }, { c: link('g3') }, ['a']), { b: link('g2'), c: link('g3') });
});

test('les liens lus dans un fichier sont filtrés : seuls les liens complets sont gardés', () => {
  assert.deepEqual(parseLinks({ a: link('g1'), b: { taskId: 'g2' }, c: 'x', d: null }), { a: link('g1') });
  assert.deepEqual(parseLinks(null), {});
  assert.deepEqual(parseLinks('x'), {});
});
