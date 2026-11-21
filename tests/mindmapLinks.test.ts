import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLinks, settleLinks, tasksToCreate } from '../lib/mindmap/links.ts';
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
  assert.deepEqual(tasksToCreate(map(), {}), [
    { nodeId: 'billets', title: 'Billets d’avion', notes: 'Carte : Voyage au Japon › Avant de partir', done: false },
    { nodeId: 'passeports', title: 'Passeports', notes: 'Carte : Voyage au Japon › Avant de partir', done: true },
  ]);
});

test('une tâche déjà liée n’est pas recréée, même détachée ; une idée n’est jamais envoyée', () => {
  const links = { billets: link('g1'), passeports: { ...link('g2'), detached: true as const } };
  assert.deepEqual(tasksToCreate(map(), links), []);
});

test('une tâche sans texte attend, un titre trop long est coupé à la limite de Google', () => {
  const root = newNode('Carte', 'root');
  root.children.push({ ...newNode('   ', 'vide'), task: { done: false } }, { ...newNode('x'.repeat(1500), 'long'), task: { done: false } });
  assert.deepEqual(tasksToCreate(root, {}).map((task) => [task.nodeId, task.title.length]), [['long', 1024]]);
});

test('un lien dont le nœud a disparu ou n’est plus une tâche est marqué détaché, pas effacé', () => {
  const settled = settleLinks(map(), { billets: link('g1'), cadeau: link('g2'), disparu: link('g3') });
  assert.deepEqual(settled, {
    billets: link('g1'),
    cadeau: { ...link('g2'), detached: true },
    disparu: { ...link('g3'), detached: true },
  });
});

test('un nœud qui redevient une tâche retrouve sa tâche Google au lieu d’en créer une seconde', () => {
  const detached = { billets: { ...link('g1'), detached: true as const } };
  assert.deepEqual(settleLinks(map(), detached), { billets: link('g1') });
  assert.deepEqual(tasksToCreate(map(), detached).map((task) => task.nodeId), ['passeports']);
});

test('vider le titre d’une tâche ne la détache pas', () => {
  const root = newNode('Carte', 'root');
  root.children.push({ ...newNode('', 'vide'), task: { done: false } });
  assert.deepEqual(settleLinks(root, { vide: link('g1') }), { vide: link('g1') });
});

test('les liens lus dans un fichier sont filtrés : seuls les liens complets sont gardés, avec leur base', () => {
  const full = { ...link('g1'), detached: true, title: 'Billets', done: false, updated: '2026-11-21T10:00:00.000Z' };
  assert.deepEqual(parseLinks({ a: full, b: { taskId: 'g2' }, c: 'x', d: null, e: { ...link('g5'), detached: 'oui', done: 1 } }), {
    a: full,
    e: link('g5'),
  });
  assert.deepEqual(parseLinks(null), {});
});
