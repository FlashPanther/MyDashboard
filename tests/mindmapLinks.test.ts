import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { lostTasks, markerIn, parseLinks, absorb, reconcile, settleLinks, settleReconciled, taskTitle, tasksToCreate } from '../lib/mindmap/links.ts';
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

const sent = (title: string, done: boolean) => ({ ...link('g'), title, done });
const plan = (links: Parameters<typeof reconcile>[1], remote?: Record<string, { title?: string; done?: boolean }>) =>
  reconcile(map(), links, new Map(Object.entries(remote ?? {}))).map(({ nodeId, push, pull, agreed }) => ({ nodeId, push, pull, agreed }));
const quiet = { push: {}, pull: {}, agreed: {} };

test('sans nouvelle de Google, seul ce qui a changé dans la carte part : le titre, l’état, ou les deux', () => {
  assert.deepEqual(plan({ billets: sent('Billets d’avion', false), passeports: sent('Passeports', false) }), [
    { nodeId: 'billets', ...quiet },
    { nodeId: 'passeports', ...quiet, push: { done: true } },
  ]);
  assert.deepEqual(plan({ billets: sent('Ancien titre', true) }), [{ nodeId: 'billets', ...quiet, push: { title: 'Billets d’avion', done: false } }]);
});

test('ce que Google a changé seul revient vers la carte ; ce que la carte a changé seule part', () => {
  const links = { billets: sent('Billets d’avion', false), passeports: sent('Passeports', false) };
  const remote = { g: { title: 'Billets retouchés chez Google', done: true } };
  assert.deepEqual(plan(links, remote), [
    { nodeId: 'billets', ...quiet, pull: { title: 'Billets retouchés chez Google', done: true } },
    { nodeId: 'passeports', push: {}, pull: { title: 'Billets retouchés chez Google' }, agreed: { done: true } },
  ]);
});

test('le même champ changé des deux côtés : la carte l’emporte ; déjà d’accord : rien ne part, la base suit', () => {
  assert.deepEqual(plan({ passeports: sent('Passeports', false) }, { g: { title: 'Passeports', done: true } }), [
    { nodeId: 'passeports', ...quiet, agreed: { done: true } },
  ]);
  assert.deepEqual(plan({ billets: sent('Ancien titre', false) }, { g: { title: 'Autre titre chez Google', done: false } }), [
    { nodeId: 'billets', ...quiet, push: { title: 'Billets d’avion' } },
  ]);
});

test('ce qui est arrivé de Google reste en attente tant que la carte ne l’a pas repris, puis devient la base', () => {
  const pending = { passeports: { ...sent('Passeports', true), incoming: { done: false } } };
  assert.deepEqual(plan(pending), [{ nodeId: 'passeports', ...quiet, pull: { done: false } }]);
  const waiting = settleReconciled(pending, reconcile(map(), pending));
  assert.deepEqual(waiting.passeports.incoming, { done: false });

  const root = map();
  root.children[0].children[1].task = { done: false };
  const taken = reconcile(root, pending);
  assert.deepEqual(taken.map(({ push, pull, agreed }) => ({ push, pull, agreed })), [{ ...quiet, agreed: { done: false } }]);
  assert.deepEqual(settleReconciled(pending, taken).passeports, sent('Passeports', false));
});

test('un lien détaché, perdu, ou sans état connu n’est jamais rapproché ; un lien perdu revu chez Google est retrouvé', () => {
  const changed = { ...link('g'), title: 'Autre', done: true };
  assert.deepEqual(plan({ billets: { ...changed, detached: true } }), []);
  assert.deepEqual(plan({ billets: { ...changed, lost: true } }), []);
  assert.deepEqual(plan({ billets: link('g') }), []);
  assert.equal(lostTasks(map(), { billets: { ...changed, lost: true }, cadeau: { ...changed, lost: true } }), 1);
  const none = new Set<string>();
  assert.deepEqual(absorb({ billets: { ...changed, lost: true } }, new Map([['g', {}]]), none), { billets: changed });
  assert.deepEqual(absorb({ billets: { ...changed, lost: true } }, new Map([['autre', {}]]), none), { billets: { ...changed, lost: true } });
});

test('un titre lu chez Google est normalisé comme la carte l’écrit : pas d’aller-retour pour des espaces ou un retour à la ligne', () => {
  assert.equal(taskTitle('  Billets\n d’avion  '), 'Billets d’avion');
  assert.equal(taskTitle('x'.repeat(1500)).length, 1024);
  const links = { billets: sent('Billets d’avion', false) };
  assert.deepEqual(plan(links, { g: { title: taskTitle('  Billets  d’avion ') } }), [{ nodeId: 'billets', ...quiet }]);
});

test('la lecture de Google marque perdue une tâche supprimée en oubliant ce qui en était arrivé, et garde en attente ce qui change sur un nœud détaché', () => {
  const base = { ...link('g'), title: 'Billets', done: false };
  assert.deepEqual(absorb({ billets: { ...base, incoming: { done: true } } }, new Map(), new Set(['g'])), { billets: { ...base, lost: true } });
  assert.deepEqual(absorb({ billets: { ...base, detached: true } }, new Map([['g', { title: 'Billets', done: true }]]), new Set()), {
    billets: { ...base, detached: true, incoming: { done: true } },
  });
});

test('une carte qui montre ce que Google avait envoyé laisse Google décider : un changement plus récent de Google revient, rien ne repart', () => {
  const pending = { passeports: { ...sent('Passeports', false), incoming: { done: true } } };
  assert.deepEqual(plan(pending, { g: { title: 'Passeports', done: false } }), [{ nodeId: 'passeports', ...quiet, pull: { done: false } }]);
});

test('sur un nœud détaché, un changement de Google annulé chez Google avant le retour du nœud n’est plus en attente', () => {
  const base = { ...link('g'), title: 'Billets', done: false, detached: true as const };
  assert.deepEqual(absorb({ billets: { ...base, incoming: { title: 'Autre' } } }, new Map([['g', { title: 'Billets', done: false }]]), new Set()), {
    billets: base,
  });
});
