import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { lostTasks, markerIn, parseLinks, settleLinks, tasksToCreate, tasksToUpdate } from '../lib/mindmap/links.ts';
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

const ref: Record<string, string> = {
  billets: createHash('sha256').update('billets').digest('hex').slice(0, 16),
  passeports: createHash('sha256').update('passeports').digest('hex').slice(0, 16),
};
const notes = (id: string) => `Carte : Voyage au Japon › Avant de partir\n\nRéf. carte : carte-1/${ref[id]}`;

test('chaque nœud-tâche sans lien est à créer, avec son chemin, son état et une référence pour le retrouver', () => {
  assert.deepEqual(tasksToCreate('carte-1', map(), {}), [
    { nodeId: 'billets', marker: `carte-1/${ref.billets}`, title: 'Billets d’avion', notes: notes('billets'), done: false },
    { nodeId: 'passeports', marker: `carte-1/${ref.passeports}`, title: 'Passeports', notes: notes('passeports'), done: true },
  ]);
});

test('la référence d’un nœud à identifiant unique ne dépend pas de la carte : une carte réimportée retrouve ses tâches', () => {
  const root = newNode('Carte', 'root');
  const id = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b';
  root.children.push({ ...newNode('Tâche', id), task: { done: false } });
  assert.equal(tasksToCreate('carte-1', root, {})[0].marker, id);
  assert.equal(tasksToCreate('carte-2', root, {})[0].marker, id);
});

test('la référence se relit dans le détail d’une tâche Google, même si du texte a été ajouté autour', () => {
  const [task] = tasksToCreate('carte-1', map(), {});
  assert.equal(markerIn(task.notes), task.marker);
  assert.equal(markerIn(`Note perso\n${task.notes}\nautre ligne`), task.marker);
  assert.equal(markerIn('Une tâche ordinaire'), null);
  assert.equal(markerIn(undefined), null);
});

test('une tâche déjà liée n’est pas recréée, même détachée ; une idée n’est jamais envoyée', () => {
  const links = { billets: link('g1'), passeports: { ...link('g2'), detached: true as const } };
  assert.deepEqual(tasksToCreate('carte-1', map(), links), []);
});

test('une tâche sans texte attend ; un titre ou un chemin trop longs sont coupés sous les limites de Google', () => {
  const root = newNode('r'.repeat(9000), 'root');
  root.children.push({ ...newNode('   ', 'vide'), task: { done: false } }, { ...newNode('x'.repeat(1500), 'long'), task: { done: false } });
  const [task, ...others] = tasksToCreate('carte-1', root, {});
  assert.deepEqual(others, []);
  assert.equal(task.title.length, 1024);
  assert.equal(task.notes.length < 8192, true);
  assert.equal(markerIn(task.notes), task.marker);
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
  assert.deepEqual(tasksToCreate('carte-1', map(), detached).map((task) => task.nodeId), ['passeports']);
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

test('un identifiant fait main, même bizarre ou immense, donne une référence courte, relisible et sans collision', () => {
  const root = newNode('Carte', 'root');
  const ids = ['a', 'a ', 'x'.repeat(8200), 'avec\nretour'];
  root.children.push(...ids.map((id) => ({ ...newNode('Tâche', id), task: { done: false } })));
  const tasks = tasksToCreate('carte-1', root, {});
  assert.equal(new Set(tasks.map((task) => task.marker)).size, ids.length);
  for (const task of tasks) {
    assert.equal(markerIn(task.notes), task.marker);
    assert.equal(task.notes.length < 8192, true);
  }
});

test('une tâche liée n’est à mettre à jour que sur ce qui a changé dans la carte : le titre, l’état, ou les deux', () => {
  const sent = (title: string, done: boolean) => ({ ...link('g'), title, done });
  const target = { taskId: 'g', listId: 'liste' };
  assert.deepEqual(tasksToUpdate(map(), { billets: sent('Billets d’avion', false), passeports: sent('Passeports', false) }), [
    { nodeId: 'passeports', ...target, done: true },
  ]);
  assert.deepEqual(tasksToUpdate(map(), { billets: sent('Ancien titre', false) }), [{ nodeId: 'billets', ...target, title: 'Billets d’avion' }]);
  assert.deepEqual(tasksToUpdate(map(), { billets: sent('Ancien titre', true) }), [
    { nodeId: 'billets', ...target, title: 'Billets d’avion', done: false },
  ]);
});

test('un lien détaché, perdu, ou sans état connu n’est jamais mis à jour ; les tâches perdues se comptent', () => {
  const changed = { ...link('g'), title: 'Autre', done: true };
  assert.deepEqual(tasksToUpdate(map(), { billets: { ...changed, detached: true } }), []);
  assert.deepEqual(tasksToUpdate(map(), { billets: { ...changed, lost: true } }), []);
  assert.deepEqual(tasksToUpdate(map(), { billets: link('g') }), []);
  assert.equal(lostTasks(map(), { billets: { ...changed, lost: true }, cadeau: { ...changed, lost: true } }), 1);
});
