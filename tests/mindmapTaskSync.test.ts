import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createMap, readMap, saveMap } from '../lib/mindmap/store.ts';
import { syncTasks, type Google } from '../lib/mindmap/taskSync.ts';
import { newNode, type MapNode } from '../lib/mindmap/tree.ts';

const folder = () => fs.mkdtemp(path.join(os.tmpdir(), 'cartes-'));

function map(...tasks: string[]): MapNode {
  const root = newNode('Voyage', 'root');
  root.children.push(...tasks.map((text) => ({ ...newNode(text, text), task: { done: text === 'faite' } })));
  return root;
}

function fakeGoogle(lists: { id: string; title: string }[] = [], failAt = Infinity) {
  const calls: { method: string; path: string; body: Record<string, unknown> | null }[] = [];
  let created = 0;
  const google = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const { pathname } = new URL(url);
    calls.push({ method, path: pathname, body: init.body ? JSON.parse(String(init.body)) : null });
    if (method === 'GET') return { items: lists };
    if (pathname.endsWith('/users/@me/lists')) return { id: 'liste-neuve' };
    if (++created > failAt) throw new Error('Google a lâché');
    return { id: `g${created}` };
  }) as Google;
  return { google, calls, posts: () => calls.filter((call) => call.method === 'POST' && call.path.endsWith('/tasks')) };
}

test('les nœuds-tâches sont créés dans la liste voulue, avec leur chemin et leur état, puis liés', async () => {
  const dir = await folder();
  const { id } = (await createMap(map('à faire', 'faite'), { dir }))!;
  const { google, posts } = fakeGoogle([{ id: 'L1', title: 'Cartes' }]);
  assert.deepEqual(await syncTasks(id, 'Cartes', google, dir), { created: 2, detached: 0, waiting: 0 });
  assert.deepEqual(posts().map((call) => [call.path, call.body]), [
    ['/tasks/v1/lists/L1/tasks', { title: 'à faire', notes: 'Carte : Voyage' }],
    ['/tasks/v1/lists/L1/tasks', { title: 'faite', notes: 'Carte : Voyage', status: 'completed' }],
  ]);
  assert.deepEqual((await readMap(id, { dir }))?.links, {
    'à faire': { taskId: 'g1', listId: 'L1' },
    faite: { taskId: 'g2', listId: 'L1' },
  });
});

test('relancer ne recrée rien et n’interroge même pas Google', async () => {
  const dir = await folder();
  const { id } = (await createMap(map('à faire'), { dir }))!;
  await syncTasks(id, 'Cartes', fakeGoogle().google, dir);
  const again = fakeGoogle();
  assert.deepEqual(await syncTasks(id, 'Cartes', again.google, dir), { created: 0, detached: 0, waiting: 0 });
  assert.equal(again.calls.length, 0);
});

test('la liste est créée si elle n’existe pas', async () => {
  const dir = await folder();
  const { id } = (await createMap(map('à faire'), { dir }))!;
  const { google, posts } = fakeGoogle([{ id: 'autre', title: 'Courses' }]);
  await syncTasks(id, 'Cartes', google, dir);
  assert.equal(posts()[0].path, '/tasks/v1/lists/liste-neuve/tasks');
});

test('enregistrer la carte garde les liens ; retirer un nœud-tâche détache sans rien supprimer chez Google', async () => {
  const dir = await folder();
  const { id } = (await createMap(map('à faire', 'faite'), { dir }))!;
  await syncTasks(id, 'Cartes', fakeGoogle().google, dir);
  await saveMap(id, map('à faire'), 1, { dir });
  assert.deepEqual(Object.keys((await readMap(id, { dir }))!.links), ['à faire', 'faite']);
  const later = fakeGoogle();
  assert.deepEqual(await syncTasks(id, 'Cartes', later.google, dir), { created: 0, detached: 1, waiting: 0 });
  assert.equal(later.calls.length, 0);
  const stored = (await readMap(id, { dir }))!;
  assert.deepEqual(Object.keys(stored.links), ['à faire']);
  assert.equal(stored.revision, 2);
});

test('si Google lâche en route, les tâches déjà créées restent liées et ne seront pas créées deux fois', async () => {
  const dir = await folder();
  const { id } = (await createMap(map('une', 'deux', 'trois'), { dir }))!;
  await assert.rejects(syncTasks(id, 'Cartes', fakeGoogle([], 1).google, dir), { message: 'Google a lâché' });
  assert.deepEqual(Object.keys((await readMap(id, { dir }))!.links), ['une']);
  const retry = fakeGoogle();
  assert.equal((await syncTasks(id, 'Cartes', retry.google, dir))?.created, 2);
  assert.deepEqual(retry.posts().map((call) => call.body?.title), ['deux', 'trois']);
});

test('deux demandes simultanées pour la même carte ne créent chaque tâche qu’une fois', async () => {
  const dir = await folder();
  const { id } = (await createMap(map('à faire'), { dir }))!;
  const { google, posts } = fakeGoogle();
  await Promise.all([syncTasks(id, 'Cartes', google, dir), syncTasks(id, 'Cartes', google, dir)]);
  assert.equal(posts().length, 1);
});

test('une grosse carte est envoyée par paquets de cinquante', async () => {
  const dir = await folder();
  const { id } = (await createMap(map(...Array.from({ length: 60 }, (_, index) => `t${index}`)), { dir }))!;
  const { google } = fakeGoogle();
  assert.deepEqual(await syncTasks(id, 'Cartes', google, dir), { created: 50, detached: 0, waiting: 10 });
  assert.deepEqual(await syncTasks(id, 'Cartes', google, dir), { created: 10, detached: 0, waiting: 0 });
});

test('une carte inconnue ne fait rien', async () => {
  assert.equal(await syncTasks('00000000-0000-4000-8000-000000000000', 'Cartes', fakeGoogle().google, await folder()), null);
});
