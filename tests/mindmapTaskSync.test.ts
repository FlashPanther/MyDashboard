import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { annotate, createMap, readMap, saveMap } from '../lib/mindmap/store.ts';
import { syncTasks, type Google } from '../lib/mindmap/taskSync.ts';
import { newNode, type MapNode } from '../lib/mindmap/tree.ts';

const folder = () => fs.mkdtemp(path.join(os.tmpdir(), 'cartes-'));
const UPDATED = '2026-11-21T10:00:00.000Z';

function map(...tasks: string[]): MapNode {
  const root = newNode('Voyage', 'root');
  root.children.push(...tasks.map((text) => ({ ...newNode(text, text), task: { done: text === 'faite' } })));
  return root;
}

type Stored = { id: string; title: string; notes?: string; status?: string; updated: string };

/** Un Google Tasks en mémoire : listes, tâches par liste, et pannes réglables. */
function fakeGoogle(lists: { id: string; title: string }[] = [{ id: 'L1', title: 'Cartes' }]) {
  const tasks: Record<string, Stored[]> = {};
  const calls: string[] = [];
  const faults = { loseAnswerOf: 0, refuseFrom: Infinity, missingList: '' };
  let posts = 0;
  const google = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const { pathname } = new URL(url);
    calls.push(`${method} ${pathname}`);
    if (pathname.endsWith('/users/@me/lists')) {
      if (method === 'GET') return { items: lists };
      lists.push({ id: 'liste-neuve', title: JSON.parse(String(init.body)).title });
      return { id: 'liste-neuve' };
    }
    const listId = pathname.split('/')[4];
    if (listId === faults.missingList) throw new Error('liste disparue');
    if (method === 'GET') return { items: tasks[listId] ?? [] };
    posts += 1;
    if (posts >= faults.refuseFrom) throw new Error('Google a lâché');
    const task = { id: `g${posts}`, updated: UPDATED, ...JSON.parse(String(init.body)) };
    (tasks[listId] ??= []).push(task);
    if (posts === faults.loseAnswerOf) throw new Error('réponse perdue');
    return task;
  }) as Google;
  const titles = (listId = 'L1') => (tasks[listId] ?? []).map((task) => task.title);
  return { google, calls, faults, tasks, titles };
}

async function sending(root: MapNode) {
  const dir = await folder();
  const { id } = (await createMap(root, { dir, sendTasks: true }))!;
  return { dir, id, links: async () => (await readMap(id, { dir }))!.links };
}

test('une carte dont l’envoi n’est pas activé n’envoie rien : elle dit seulement combien de tâches attendent', async () => {
  const dir = await folder();
  const { id } = (await createMap(map('à faire', 'faite'), { dir }))!;
  const fake = fakeGoogle();
  assert.deepEqual(await syncTasks(id, 'Cartes', fake.google, { dir }), { enabled: false, waiting: 2 });
  assert.deepEqual(fake.calls, []);
  await annotate(id, () => ({ sendTasks: true }), { dir });
  assert.deepEqual(await syncTasks(id, 'Cartes', fake.google, { dir }), { enabled: true, waiting: 0 });
  assert.deepEqual(fake.titles(), ['à faire', 'faite']);
});

test('les nœuds-tâches sont créés dans la liste voulue, avec leur chemin, leur état et leur référence, puis liés', async () => {
  const { dir, id, links } = await sending(map('à faire', 'faite'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.deepEqual(fake.tasks.L1.map(({ title, notes, status }) => ({ title, notes, status })), [
    { title: 'à faire', notes: `Carte : Voyage\n\nRéf. carte : ${id}/à faire`, status: undefined },
    { title: 'faite', notes: `Carte : Voyage\n\nRéf. carte : ${id}/faite`, status: 'completed' },
  ]);
  assert.deepEqual(await links(), {
    'à faire': { taskId: 'g1', listId: 'L1', title: 'à faire', done: false, updated: UPDATED },
    faite: { taskId: 'g2', listId: 'L1', title: 'faite', done: true, updated: UPDATED },
  });
});

test('relancer ne recrée rien et n’interroge même pas Google', async () => {
  const { dir, id } = await sending(map('à faire'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  fake.calls.length = 0;
  assert.deepEqual(await syncTasks(id, 'Cartes', fake.google, { dir }), { enabled: true, waiting: 0 });
  assert.deepEqual(fake.calls, []);
});

test('la liste est créée si elle n’existe pas', async () => {
  const { dir, id } = await sending(map('à faire'));
  const fake = fakeGoogle([{ id: 'autre', title: 'Courses' }]);
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.deepEqual(fake.titles('liste-neuve'), ['à faire']);
});

test('une création dont la réponse s’est perdue est reconnue au passage suivant, pas recréée', async () => {
  const { dir, id, links } = await sending(map('une', 'deux'));
  const fake = fakeGoogle();
  fake.faults.loseAnswerOf = 1;
  await assert.rejects(syncTasks(id, 'Cartes', fake.google, { dir }), { message: 'réponse perdue' });
  assert.deepEqual(await links(), {});
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.deepEqual(fake.titles(), ['une', 'deux']);
  assert.deepEqual(Object.values(await links()).map((link) => link.taskId), ['g1', 'g2']);
});

test('si Google lâche en route, chaque tâche déjà créée garde son lien et le reste part au passage suivant', async () => {
  const { dir, id, links } = await sending(map('une', 'deux', 'trois'));
  const fake = fakeGoogle();
  fake.faults.refuseFrom = 2;
  await assert.rejects(syncTasks(id, 'Cartes', fake.google, { dir }), { message: 'Google a lâché' });
  assert.deepEqual(Object.keys(await links()), ['une']);
  fake.faults.refuseFrom = Infinity;
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.deepEqual(fake.titles(), ['une', 'deux', 'trois']);
});

test('des liens perdus (fichier restauré, écriture ratée) se reconstituent sans rien recréer chez Google', async () => {
  const { dir, id, links } = await sending(map('une', 'deux'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  await annotate(id, () => ({ links: {} }), { dir });
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.deepEqual(fake.titles(), ['une', 'deux']);
  assert.deepEqual(Object.values(await links()).map((link) => link.taskId), ['g1', 'g2']);
});

test('une tâche cochée chez Google entre-temps est reliée avec son état du moment', async () => {
  const { dir, id, links } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  fake.tasks.L1[0].status = 'completed';
  await annotate(id, () => ({ links: {} }), { dir });
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.equal((await links()).une.done, true);
});

test('enregistrer la carte garde les liens ; retirer un nœud-tâche le détache sans rien toucher chez Google', async () => {
  const { dir, id } = await sending(map('à faire', 'faite'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  await saveMap(id, map('à faire'), 1, { dir });
  assert.deepEqual(Object.keys((await readMap(id, { dir }))!.links), ['à faire', 'faite']);
  fake.calls.length = 0;
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.deepEqual(fake.calls, []);
  const stored = (await readMap(id, { dir }))!;
  assert.equal(stored.links.faite.detached, true);
  assert.equal(stored.links['à faire'].detached, undefined);
  assert.equal(stored.revision, 2);
  assert.equal(stored.sendTasks, true);
});

test('un nœud-tâche retiré puis remis retrouve sa tâche : rien n’est recréé chez Google', async () => {
  const { dir, id, links } = await sending(map('à faire'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  await saveMap(id, map(), 1, { dir });
  await syncTasks(id, 'Cartes', fake.google, { dir });
  await saveMap(id, map('à faire'), 2, { dir });
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.deepEqual(fake.titles(), ['à faire']);
  assert.equal('detached' in (await links())['à faire'], false);
});

test('la liste déjà utilisée par la carte est reprise sans rechercher son titre ; disparue, elle est recherchée', async () => {
  const { dir, id, links } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  await saveMap(id, map('une', 'deux'), 1, { dir });
  fake.calls.length = 0;
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.deepEqual(fake.calls, ['GET /tasks/v1/lists/L1/tasks', 'POST /tasks/v1/lists/L1/tasks']);

  await saveMap(id, map('une', 'deux', 'trois'), 2, { dir });
  const moved = fakeGoogle([{ id: 'L2', title: 'Cartes' }]);
  moved.faults.missingList = 'L1';
  await syncTasks(id, 'Cartes', moved.google, { dir });
  assert.deepEqual(moved.calls, ['GET /tasks/v1/lists/L1/tasks', 'GET /tasks/v1/users/@me/lists', 'GET /tasks/v1/lists/L2/tasks', 'POST /tasks/v1/lists/L2/tasks']);
  assert.equal((await links()).trois.listId, 'L2');
});

test('deux demandes simultanées ne créent chaque tâche qu’une fois', async () => {
  const { dir, id } = await sending(map('à faire'));
  const fake = fakeGoogle();
  await Promise.all([syncTasks(id, 'Cartes', fake.google, { dir }), syncTasks(id, 'Cartes', fake.google, { dir })]);
  assert.deepEqual(fake.titles(), ['à faire']);
});

test('une tâche ajoutée pendant une passe part dans la passe suivante, sans attendre un nouvel enregistrement', async () => {
  const { dir, id } = await sending(map('une'));
  const fake = fakeGoogle();
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let first = true;
  const slow = (async (url: string, init?: RequestInit) => {
    if (first && init?.method === 'POST') {
      first = false;
      await held;
    }
    return fake.google(url, init);
  }) as Google;
  const pass = syncTasks(id, 'Cartes', slow, { dir });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await saveMap(id, map('une', 'deux'), 1, { dir });
  const joined = syncTasks(id, 'Cartes', slow, { dir });
  release();
  assert.deepEqual(await joined, { enabled: true, waiting: 0 });
  await pass;
  assert.deepEqual(fake.titles(), ['une', 'deux']);
});

test('une grosse carte est envoyée par paquets de cinquante', async () => {
  const { dir, id } = await sending(map(...Array.from({ length: 60 }, (_, index) => `t${index}`)));
  const fake = fakeGoogle();
  assert.deepEqual(await syncTasks(id, 'Cartes', fake.google, { dir }), { enabled: true, waiting: 10 });
  assert.deepEqual(await syncTasks(id, 'Cartes', fake.google, { dir }), { enabled: true, waiting: 0 });
  assert.equal(fake.titles().length, 60);
});

test('une carte inconnue ne fait rien', async () => {
  assert.equal(await syncTasks('00000000-0000-4000-8000-000000000000', 'Cartes', fakeGoogle().google, { dir: await folder() }), null);
});
