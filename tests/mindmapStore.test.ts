import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MAX_BODY, readMapBody } from '../lib/mindmap/request.ts';
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
  const created = await createMap(map('Voyage'), { now: at(0), dir });
  const read = await readMap(created.id, { dir });
  assert.equal(read?.revision, 1);
  assert.equal(read?.root.text, 'Voyage');
  assert.deepEqual(read?.root.children[0].task, { done: false });
});

test('la liste donne le titre de chaque carte, la plus récemment modifiée d’abord', async () => {
  const dir = await folder();
  assert.deepEqual(await listMaps({ dir }), []);
  const first = await createMap(map('Ancienne'), { now: at(0), dir });
  await createMap(map('Récente'), { now: at(5), dir });
  assert.deepEqual((await listMaps({ dir })).map((entry) => entry.title), ['Récente', 'Ancienne']);
  await saveMap(first.id, map('Ancienne revue'), 1, { now: at(9), dir });
  assert.deepEqual((await listMaps({ dir })).map((entry) => entry.title), ['Ancienne revue', 'Récente']);
});

test('enregistrer avance la révision ; une révision dépassée est refusée et rend la carte actuelle', async () => {
  const dir = await folder();
  const { id } = await createMap(map('Voyage'), { now: at(0), dir });
  const saved = await saveMap(id, map('Voyage au Japon'), 1, { now: at(1), dir });
  assert.equal(saved?.saved, true);
  assert.equal(saved?.map.revision, 2);
  const late = await saveMap(id, map('Écrit depuis un autre appareil'), 1, { now: at(2), dir });
  assert.equal(late?.saved, false);
  assert.equal(late?.map.root.text, 'Voyage au Japon');
  assert.equal((await readMap(id, { dir }))?.root.text, 'Voyage au Japon');
});

test('deux enregistrements simultanés de la même révision : un seul passe', async () => {
  const dir = await folder();
  const { id } = await createMap(map('Voyage'), { now: at(0), dir });
  const results = await Promise.all([saveMap(id, map('A'), 1, { now: at(1), dir }), saveMap(id, map('B'), 1, { now: at(1), dir })]);
  assert.deepEqual(results.map((result) => result?.saved).sort(), [false, true]);
});

test('une carte inconnue ou un identifiant qui sort du dossier ne lit ni n’écrit rien', async () => {
  const dir = await folder();
  await fs.writeFile(path.join(dir, 'secret.json'), JSON.stringify({ root: map('Secret') }));
  assert.equal(await readMap('../secret', { dir }), null);
  assert.equal(await readMap('secret', { dir }), null);
  assert.equal(await saveMap('00000000-0000-4000-8000-000000000000', map('x'), 1, { now: at(0), dir }), null);
  assert.equal(await trashMap('../secret', { dir }), false);
  assert.deepEqual(await listMaps({ dir }), []);
});

test('un fichier abîmé est ignoré par la liste au lieu de tout bloquer', async () => {
  const dir = await folder();
  await createMap(map('Saine'), { now: at(0), dir });
  await fs.writeFile(path.join(dir, '11111111-1111-4111-8111-111111111111.json'), '{ pas du json');
  assert.deepEqual((await listMaps({ dir })).map((entry) => entry.title), ['Saine']);
});

test('supprimer met la carte à la corbeille : elle quitte la liste mais son fichier reste', async () => {
  const dir = await folder();
  const { id } = await createMap(map('Voyage'), { now: at(0), dir });
  assert.equal(await trashMap(id, { dir }), true);
  assert.deepEqual(await listMaps({ dir }), []);
  assert.equal(await readMap(id, { dir }), null);
  assert.equal((await fs.readdir(path.join(dir, 'corbeille'))).length, 1);
  assert.equal(await trashMap(id, { dir }), false);
});

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('http://tableau.test/api/cartes', { method: 'POST', body, headers });
const node = (id: unknown, children: unknown[] = []) => ({ id, text: 'x', children });

test('le corps d’une requête est lu comme une carte, avec sa révision', async () => {
  const body = await readMapBody(post(JSON.stringify({ root: { id: 'r', text: ' Voyage ', children: [] }, revision: 3 })));
  assert.equal('root' in body && body.root.text, 'Voyage');
  assert.equal('root' in body && body.root.id, 'r');
  assert.equal('root' in body && body.revision, 3);
  const loose = await readMapBody(post(JSON.stringify({ root: node('r'), revision: '3' })));
  assert.equal('root' in loose && loose.revision, null);
});

test('une carte sans identifiant, aux identifiants en double ou illisible est refusée plutôt que réparée', async () => {
  for (const root of [node(undefined), node('r', [node('a'), node('a')]), node('r', [node('')]), { id: 'r', text: 'x' }]) {
    assert.deepEqual(await readMapBody(post(JSON.stringify({ root }))), { status: 400, error: 'Carte invalide' });
  }
  assert.equal('error' in (await readMapBody(post('pas du json'))), true);
  assert.equal('error' in (await readMapBody(post('{"hello":1}'))), true);
});

test('une requête trop volumineuse est refusée, annoncée ou non par son en-tête', async () => {
  const huge = JSON.stringify({ root: { id: 'r', text: 'é'.repeat(MAX_BODY / 2 + 1), children: [] } });
  assert.equal((await readMapBody(post(huge)) as { status: number }).status, 413);
  assert.equal((await readMapBody(post('{}', { 'content-length': String(MAX_BODY + 1) })) as { status: number }).status, 413);
});
