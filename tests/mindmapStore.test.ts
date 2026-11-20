import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MAX_BODY, parseMapBody } from '../lib/mindmap/request.ts';
import { createMap, listMaps, readMap, saveMap, trashMap } from '../lib/mindmap/store.ts';
import { newNode } from '../lib/mindmap/tree.ts';

const folder = () => fs.mkdtemp(path.join(os.tmpdir(), 'cartes-'));
const at = (minute: number) => new Date(Date.UTC(2026, 10, 20, 9, minute));

function map(title: string) {
  const root = newNode(title, 'root');
  root.children.push({ ...newNode('à faire', 'a'), task: { done: false } });
  return root;
}

test('une carte créée se relit telle quelle, tâches comprises', async () => {
  const dir = await folder();
  const created = await createMap(map('Voyage'), at(0), dir);
  const read = await readMap(created.id, dir);
  assert.equal(read?.revision, 1);
  assert.equal(read?.root.text, 'Voyage');
  assert.deepEqual(read?.root.children[0].task, { done: false });
});

test('la liste donne le titre de chaque carte, la plus récemment modifiée d’abord', async () => {
  const dir = await folder();
  assert.deepEqual(await listMaps(dir), []);
  const first = await createMap(map('Ancienne'), at(0), dir);
  await createMap(map('Récente'), at(5), dir);
  assert.deepEqual((await listMaps(dir)).map((entry) => entry.title), ['Récente', 'Ancienne']);
  await saveMap(first.id, map('Ancienne revue'), 1, at(9), dir);
  assert.deepEqual((await listMaps(dir)).map((entry) => entry.title), ['Ancienne revue', 'Récente']);
});

test('enregistrer avance la révision ; une révision dépassée est refusée et rend la carte actuelle', async () => {
  const dir = await folder();
  const { id } = await createMap(map('Voyage'), at(0), dir);
  const saved = await saveMap(id, map('Voyage au Japon'), 1, at(1), dir);
  assert.equal('saved' in saved && saved.saved.revision, 2);
  const late = await saveMap(id, map('Écrit depuis un autre appareil'), 1, at(2), dir);
  assert.equal('conflict' in late && late.conflict.root.text, 'Voyage au Japon');
  assert.equal((await readMap(id, dir))?.root.text, 'Voyage au Japon');
});

test('deux enregistrements simultanés de la même révision : un seul passe', async () => {
  const dir = await folder();
  const { id } = await createMap(map('Voyage'), at(0), dir);
  const results = await Promise.all([saveMap(id, map('A'), 1, at(1), dir), saveMap(id, map('B'), 1, at(1), dir)]);
  assert.equal(results.filter((result) => 'saved' in result).length, 1);
  assert.equal(results.filter((result) => 'conflict' in result).length, 1);
});

test('une carte inconnue ou un identifiant qui sort du dossier ne lit ni n’écrit rien', async () => {
  const dir = await folder();
  await fs.writeFile(path.join(dir, 'secret.json'), JSON.stringify({ root: map('Secret') }));
  assert.equal(await readMap('../secret', dir), null);
  assert.equal(await readMap('secret', dir), null);
  assert.deepEqual(await saveMap('00000000-0000-4000-8000-000000000000', map('x'), 1, at(0), dir), { missing: true });
  assert.equal(await trashMap('../secret', dir), false);
  assert.deepEqual(await listMaps(dir), []);
});

test('un fichier abîmé est ignoré par la liste au lieu de tout bloquer', async () => {
  const dir = await folder();
  await createMap(map('Saine'), at(0), dir);
  await fs.writeFile(path.join(dir, '11111111-1111-4111-8111-111111111111.json'), '{ pas du json');
  assert.deepEqual((await listMaps(dir)).map((entry) => entry.title), ['Saine']);
});

test('supprimer met la carte à la corbeille : elle quitte la liste mais son fichier reste', async () => {
  const dir = await folder();
  const { id } = await createMap(map('Voyage'), at(0), dir);
  assert.equal(await trashMap(id, dir), true);
  assert.deepEqual(await listMaps(dir), []);
  assert.equal(await readMap(id, dir), null);
  assert.equal((await fs.readdir(path.join(dir, 'corbeille'))).length, 1);
  assert.equal(await trashMap(id, dir), false);
});

test('le corps d’une requête est lu comme une carte, avec sa révision ; le reste est refusé', () => {
  const body = parseMapBody(JSON.stringify({ root: { text: ' Voyage ', children: [] }, revision: 3 }));
  assert.equal(body?.root.text, 'Voyage');
  assert.equal(body?.revision, 3);
  assert.equal(parseMapBody(JSON.stringify({ root: { text: 'x', children: [] }, revision: '3' }))?.revision, null);
  assert.equal(parseMapBody('{"root":{"text":"x"}}'), null);
  assert.equal(parseMapBody('pas du json'), null);
  assert.equal(parseMapBody(JSON.stringify({ root: { text: 'x'.repeat(MAX_BODY), children: [] } })), null);
});
