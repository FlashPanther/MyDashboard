import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createMap, readMap } from '../lib/mindmap/store.ts';
import { syncAllMaps } from '../lib/mindmap/taskRounds.ts';
import type { Google } from '../lib/mindmap/taskSync.ts';
import { newNode, type MapNode } from '../lib/mindmap/tree.ts';

const folder = () => fs.mkdtemp(path.join(os.tmpdir(), 'cartes-'));

function map(task: string): MapNode {
  const root = newNode('Carte', 'root');
  root.children.push({ ...newNode(task, task), task: { done: false } });
  return root;
}

function fakeGoogle(failFor = '') {
  const created: string[] = [];
  const reads: string[] = [];
  let count = 0;
  const google = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    if (method === 'GET') reads.push(new URL(url).pathname);
    if (method === 'GET') return { items: url.includes('/users/@me/lists') ? [{ id: 'L1', title: 'Cartes' }] : [] };
    const { title } = JSON.parse(String(init.body));
    if (title === failFor) throw new Error('Google a lâché');
    created.push(title);
    return { id: `g${++count}`, updated: '2026-11-21T10:00:00.000Z' };
  }) as Google;
  return { google, created, reads };
}

test('un tour envoie les tâches de chaque carte qui le demande, ouverte ou non, et ignore les autres', async () => {
  const dir = await folder();
  const sent = (await createMap(map('envoyée'), { dir, sendTasks: true }))!;
  await createMap(map('gardée'), { dir });
  const fake = fakeGoogle();
  await syncAllMaps('Cartes', fake.google, { dir });
  assert.deepEqual(fake.created, ['envoyée']);
  assert.deepEqual(Object.keys((await readMap(sent.id, { dir }))!.links), ['envoyée']);
});

test('une carte en échec n’empêche pas les autres de passer', async () => {
  const dir = await folder();
  await createMap(map('cassée'), { dir, sendTasks: true });
  await createMap(map('saine'), { dir, sendTasks: true });
  const fake = fakeGoogle('cassée');
  const failures = await syncAllMaps('Cartes', fake.google, { dir });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /Google a lâché/);
  assert.deepEqual(fake.created, ['saine']);
});

test('sans rien à créer, un tour ne lit pas Google : les changements de Google attendent l’ouverture de la carte', async () => {
  const dir = await folder();
  await createMap(map('envoyée'), { dir, sendTasks: true });
  const fake = fakeGoogle();
  await syncAllMaps('Cartes', fake.google, { dir });
  fake.reads.length = 0;
  await syncAllMaps('Cartes', fake.google, { dir });
  assert.deepEqual(fake.reads, []);
});
