import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { GoogleHttpError } from '../lib/google/errors.ts';
import { annotate, createMap, readMap, saveMap } from '../lib/mindmap/store.ts';
import { syncTasks, type Google, type SyncResult } from '../lib/mindmap/taskSync.ts';
import { newNode, type MapNode } from '../lib/mindmap/tree.ts';

const folder = () => fs.mkdtemp(path.join(os.tmpdir(), 'cartes-'));
const UPDATED = '2026-11-21T10:00:00.000Z';
const LATER = '2026-11-21T11:00:00.000Z';
const counts = (result: SyncResult | null) => {
  const { linked: _linked, ...rest } = result!;
  return rest;
};
const hash = (id: string) => createHash('sha256').update(id).digest('hex').slice(0, 16);

function map(...tasks: string[]): MapNode {
  const root = newNode('Voyage', 'root');
  root.children.push(...tasks.map((text) => ({ ...newNode(text, text), task: { done: text === 'faite' } })));
  return root;
}

type Stored = { id: string; title: string; notes?: string; status?: string; updated: string; deleted?: true };

/** Un Google Tasks en mémoire : listes, tâches par liste, et pannes réglables. */
function fakeGoogle(lists: { id: string; title: string }[] = [{ id: 'L1', title: 'Cartes' }]) {
  const tasks: Record<string, Stored[]> = {};
  const calls: string[] = [];
  const patches: Record<string, unknown>[] = [];
  const deleted: Record<string, (Stored & { deleted: true })[]> = {};
  let clock = 0;
  const reads: (string | null)[] = [];
  const faults = { loseAnswerOf: 0, refuseFrom: Infinity, missingList: '', refuseUpdateOf: '' };
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
    if (listId === faults.missingList) throw new GoogleHttpError('liste disparue', 404);
    if (method === 'GET') {
      const since = new URL(url).searchParams.get('updatedMin');
      reads.push(since);
      const all = [...(tasks[listId] ?? []), ...(since ? (deleted[listId] ?? []) : [])];
      return { items: since ? all.filter((task) => task.updated >= since) : all };
    }
    if (method === 'DELETE') {
      const list = tasks[listId] ?? [];
      const index = list.findIndex((task) => task.id === pathname.split('/')[6]);
      if (index < 0) throw new GoogleHttpError('tâche introuvable', 404);
      list.splice(index, 1);
      return undefined;
    }
    if (method === 'PATCH') {
      const found = (tasks[listId] ?? []).find((task) => task.id === pathname.split('/')[6]);
      if (!found) throw new GoogleHttpError('tâche introuvable', 404);
      if (faults.refuseUpdateOf === found.id) throw new GoogleHttpError('Google a lâché', 500);
      patches.push(JSON.parse(String(init.body)));
      return Object.assign(found, JSON.parse(String(init.body)), { updated: LATER });
    }
    posts += 1;
    if (posts >= faults.refuseFrom) throw new Error('Google a lâché');
    const task = { id: `g${posts}`, updated: UPDATED, ...JSON.parse(String(init.body)) };
    (tasks[listId] ??= []).push(task);
    if (posts === faults.loseAnswerOf) throw new Error('réponse perdue');
    return task;
  }) as Google;
  const titles = (listId = 'L1') => (tasks[listId] ?? []).map((task) => task.title);
  /** Une modification faite directement dans Google : la tâche reçoit une date de modification plus récente. */
  const edit = (index: number, changes: Partial<Stored>) =>
    Object.assign(tasks.L1[index], changes, { updated: new Date(Date.UTC(2026, 10, 21, 13, ++clock)).toISOString() });
  const remove = (index: number) => {
    const [task] = tasks.L1.splice(index, 1);
    (deleted.L1 ??= []).push({ ...task, deleted: true, updated: new Date(Date.UTC(2026, 10, 21, 13, ++clock)).toISOString() });
  };
  return { google, calls, patches, faults, tasks, titles, edit, remove, reads };
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
  assert.deepEqual(counts(await syncTasks(id, 'Cartes', fake.google, { dir })), { enabled: false, waiting: 2, lost: 0, pulls: [] });
  assert.deepEqual(fake.calls, []);
  await annotate(id, () => ({ sendTasks: true }), { dir });
  assert.deepEqual(counts(await syncTasks(id, 'Cartes', fake.google, { dir })), { enabled: true, waiting: 0, lost: 0, pulls: [] });
  assert.deepEqual(fake.titles(), ['à faire', 'faite']);
});

test('les nœuds-tâches sont créés dans la liste voulue, avec leur chemin, leur état et leur référence, puis liés', async () => {
  const { dir, id, links } = await sending(map('à faire', 'faite'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.deepEqual(fake.tasks.L1.map(({ title, notes, status }) => ({ title, notes, status })), [
    { title: 'à faire', notes: `Carte : Voyage\n\nRéf. carte : ${id}/${hash('à faire')}`, status: undefined },
    { title: 'faite', notes: `Carte : Voyage\n\nRéf. carte : ${id}/${hash('faite')}`, status: 'completed' },
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
  assert.deepEqual(counts(await syncTasks(id, 'Cartes', fake.google, { dir })), { enabled: true, waiting: 0, lost: 0, pulls: [] });
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

test('une tâche reconnue alors qu’elle est cochée chez Google est reliée sans que la carte la décoche', async () => {
  const { dir, id, links } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  fake.edit(0, { status: 'completed' });
  await annotate(id, () => ({ links: {} }), { dir });
  await syncTasks(id, 'Cartes', fake.google, { dir });
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.deepEqual(fake.patches, []);
  assert.equal(fake.tasks.L1[0].status, 'completed');
  assert.equal((await links()).une.done, false);
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
  assert.deepEqual(counts(await joined), { enabled: true, waiting: 0, lost: 0, pulls: [] });
  await pass;
  assert.deepEqual(fake.titles(), ['une', 'deux']);
});

test('une grosse carte est envoyée par paquets de cinquante', async () => {
  const { dir, id } = await sending(map(...Array.from({ length: 60 }, (_, index) => `t${index}`)));
  const fake = fakeGoogle();
  assert.deepEqual(counts(await syncTasks(id, 'Cartes', fake.google, { dir })), { enabled: true, waiting: 10, lost: 0, pulls: [] });
  assert.deepEqual(counts(await syncTasks(id, 'Cartes', fake.google, { dir })), { enabled: true, waiting: 0, lost: 0, pulls: [] });
  assert.equal(fake.titles().length, 60);
});

test('une carte inconnue ne fait rien', async () => {
  assert.equal(await syncTasks('00000000-0000-4000-8000-000000000000', 'Cartes', fakeGoogle().google, { dir: await folder() }), null);
});

test('la même carte importée deux fois et envoyée en même temps ne crée chaque tâche qu’une fois', async () => {
  const dir = await folder();
  const root = newNode('Voyage', 'root');
  root.children.push({ ...newNode('Billets', '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b'), task: { done: false } });
  const first = (await createMap(root, { dir, sendTasks: true }))!;
  const second = (await createMap(structuredClone(root), { dir, sendTasks: true }))!;
  const fake = fakeGoogle();
  await Promise.all([syncTasks(first.id, 'Cartes', fake.google, { dir }), syncTasks(second.id, 'Cartes', fake.google, { dir })]);
  assert.deepEqual(fake.titles(), ['Billets']);
  const links = await Promise.all([first, second].map(async ({ id }) => Object.values((await readMap(id, { dir }))!.links)[0].taskId));
  assert.deepEqual(links, ['g1', 'g1']);
});

function edited(root: MapNode, changes: Record<string, { text?: string; done?: boolean }>): MapNode {
  const next = structuredClone(root);
  for (const [id, { text, done }] of Object.entries(changes)) {
    const node = next.children.find((child) => child.id === id)!;
    if (text !== undefined) node.text = text;
    if (done !== undefined) node.task = { done };
  }
  return next;
}

test('cocher, décocher ou renommer un nœud lié met sa tâche Google à jour, et le lien retient le nouvel état', async () => {
  const { dir, id, links } = await sending(map('une', 'faite'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  await saveMap(id, edited(map('une', 'faite'), { une: { text: 'Une, renommée', done: true }, faite: { done: false } }), 1, { dir });
  fake.calls.length = 0;
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.deepEqual(fake.calls, ['PATCH /tasks/v1/lists/L1/tasks/g1', 'PATCH /tasks/v1/lists/L1/tasks/g2']);
  assert.deepEqual(fake.tasks.L1.map(({ title, status }) => [title, status]), [['Une, renommée', 'completed'], ['faite', 'needsAction']]);
  assert.deepEqual((await links()).une, { taskId: 'g1', listId: 'L1', title: 'Une, renommée', done: true, updated: LATER });
  fake.calls.length = 0;
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.deepEqual(fake.calls, []);
});

test('renommer n’envoie que le titre, cocher n’envoie que l’état : ce que Google a de plus récent sur l’autre n’est pas écrasé', async () => {
  const { dir, id, links } = await sending(map('une', 'deux'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  fake.edit(0, { status: 'completed' });
  fake.edit(1, { title: 'Deux, retouchée chez Google' });
  await saveMap(id, edited(map('une', 'deux'), { une: { text: 'Une, renommée' }, deux: { done: true } }), 1, { dir });
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.deepEqual(fake.patches, [{ title: 'Une, renommée' }, { status: 'completed' }]);
  assert.deepEqual(fake.tasks.L1.map(({ title, status }) => [title, status]), [['Une, renommée', 'completed'], ['Deux, retouchée chez Google', 'completed']]);
  assert.deepEqual([(await links()).une.done, (await links()).deux.title], [false, 'deux']);
});

test('une tâche supprimée chez Google est notée perdue et signalée : plus d’essai sur elle, les autres sont mises à jour', async () => {
  const { dir, id, links } = await sending(map('une', 'deux'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  fake.remove(0);
  await saveMap(id, edited(map('une', 'deux'), { une: { done: true }, deux: { done: true } }), 1, { dir });
  assert.deepEqual(counts(await syncTasks(id, 'Cartes', fake.google, { dir })), { enabled: true, waiting: 0, lost: 1, pulls: [] });
  assert.equal((await links()).une.lost, true);
  assert.equal((await links()).deux.done, true);
  fake.calls.length = 0;
  assert.deepEqual(counts(await syncTasks(id, 'Cartes', fake.google, { dir })), { enabled: true, waiting: 0, lost: 1, pulls: [] });
  assert.deepEqual(fake.calls, []);
  assert.deepEqual(fake.titles(), ['deux']);
});

test('si Google refuse une mise à jour, les autres passent quand même et celle-là sera retentée', async () => {
  const { dir, id, links } = await sending(map('une', 'deux'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  await saveMap(id, edited(map('une', 'deux'), { une: { done: true }, deux: { done: true } }), 1, { dir });
  fake.faults.refuseUpdateOf = 'g1';
  await assert.rejects(syncTasks(id, 'Cartes', fake.google, { dir }), { message: 'Google a lâché' });
  assert.deepEqual([(await links()).une.done, (await links()).deux.done], [false, true]);
  fake.faults.refuseUpdateOf = '';
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.equal((await links()).une.done, true);
});

test('au-delà de cinquante mises à jour, le reste est annoncé comme en attente et part au passage suivant', async () => {
  const names = Array.from({ length: 60 }, (_, index) => `t${index}`);
  const { dir, id } = await sending(map(...names));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  await syncTasks(id, 'Cartes', fake.google, { dir });
  await saveMap(id, edited(map(...names), Object.fromEntries(names.map((name) => [name, { done: true }]))), 1, { dir });
  assert.deepEqual(counts(await syncTasks(id, 'Cartes', fake.google, { dir })), { enabled: true, waiting: 10, lost: 0, pulls: [] });
  assert.deepEqual(counts(await syncTasks(id, 'Cartes', fake.google, { dir })), { enabled: true, waiting: 0, lost: 0, pulls: [] });
  assert.equal(fake.tasks.L1.every((task) => task.status === 'completed'), true);
});

test('une carte dont l’envoi est éteint ne met rien à jour chez Google', async () => {
  const { dir, id } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  await annotate(id, () => ({ sendTasks: false }), { dir });
  await saveMap(id, edited(map('une'), { une: { done: true } }), 1, { dir });
  fake.calls.length = 0;
  assert.deepEqual(counts(await syncTasks(id, 'Cartes', fake.google, { dir })), { enabled: false, waiting: 0, lost: 0, pulls: [] });
  assert.deepEqual(fake.calls, []);
});

test('un nœud détaché, renommé, puis redevenu tâche retrouve sa tâche et lui envoie son nouveau titre dans la même passe', async () => {
  const { dir, id, links } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir });
  const idea = edited(map('une'), { une: { text: 'Une, renommée' } });
  delete idea.children[0].task;
  await saveMap(id, idea, 1, { dir });
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.equal((await links()).une.detached, true);
  await saveMap(id, edited(map('une'), { une: { text: 'Une, renommée' } }), 2, { dir });
  await syncTasks(id, 'Cartes', fake.google, { dir });
  assert.deepEqual(fake.patches, [{ title: 'Une, renommée' }]);
  assert.deepEqual(fake.titles(), ['Une, renommée']);
  assert.equal('detached' in (await links()).une, false);
});

const minute = (count: number) => new Date(Date.UTC(2026, 10, 21, 12, count));

test('une tâche cochée ou renommée chez Google revient vers la carte, sans rien écrire chez Google', async () => {
  const { dir, id, links } = await sending(map('une', 'deux'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  fake.edit(0, { status: 'completed' });
  fake.edit(1, { title: 'Deux, retouchée chez Google' });
  const result = await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) });
  assert.deepEqual(result?.pulls, [{ id: 'une', done: true }, { id: 'deux', title: 'Deux, retouchée chez Google' }]);
  assert.deepEqual(fake.patches, []);
  assert.deepEqual((await links()).une.incoming, { done: true });
});

test('tant que la carte n’a pas repris le changement, il est redonné à chaque passe, même sans relire Google', async () => {
  const { dir, id } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  fake.edit(0, { status: 'completed' });
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) });
  fake.calls.length = 0;
  const again = await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) });
  assert.deepEqual(again?.pulls, [{ id: 'une', done: true }]);
  assert.deepEqual(fake.calls, []);
});

test('une fois le changement repris et enregistré, plus rien ne circule et le lien retient le nouvel état', async () => {
  const { dir, id, links } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  fake.edit(0, { status: 'completed' });
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) });
  await saveMap(id, edited(map('une'), { une: { done: true } }), 1, { dir });
  fake.calls.length = 0;
  const settled = await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) });
  assert.deepEqual(settled?.pulls, []);
  assert.deepEqual(fake.calls, []);
  assert.deepEqual((await links()).une, { taskId: 'g1', listId: 'L1', title: 'une', done: true, updated: UPDATED });
});

test('si la carte a changé le même champ pendant ce temps, c’est elle qui l’emporte et Google est corrigé', async () => {
  const { dir, id, links } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  fake.edit(0, { title: 'Titre de Google' });
  await saveMap(id, edited(map('une'), { une: { text: 'Titre de la carte' } }), 1, { dir });
  const result = await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) });
  assert.deepEqual(result?.pulls, []);
  assert.deepEqual(fake.patches, [{ title: 'Titre de la carte' }]);
  assert.equal((await links()).une.title, 'Titre de la carte');
});

test('Google n’est relu qu’après un délai : deux passes rapprochées ne le lisent qu’une fois', async () => {
  const { dir, id } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  fake.calls.length = 0;
  await syncTasks(id, 'Cartes', fake.google, { dir, now: new Date(minute(0).getTime() + 5000) });
  assert.deepEqual(fake.calls, []);
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) });
  assert.deepEqual(fake.calls, ['GET /tasks/v1/lists/L1/tasks']);
});

test('une tâche notée perdue puis revue dans la liste est retrouvée', async () => {
  const { dir, id, links } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  await annotate(id, (latest) => ({ links: { une: { ...latest.links.une, lost: true } } }), { dir });
  const result = await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) });
  assert.equal(result?.lost, 0);
  assert.equal('lost' in (await links()).une, false);
});

test('après une première lecture complète, Google n’est relu que pour ce qui a changé, et une tâche supprimée n’y est pas reprise', async () => {
  const { dir, id } = await sending(map('une', 'deux'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) });
  fake.edit(1, { title: 'Deux, retouchée' });
  fake.remove(0);
  const result = await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(2) });
  assert.equal(fake.reads[0], null);
  assert.equal(fake.reads.at(-1), '2026-11-21T09:59:55.000Z');
  assert.deepEqual(result?.pulls, [{ id: 'deux', title: 'Deux, retouchée' }]);
});

test('un titre retouché chez Google avec des espaces en trop revient une fois, normalisé, puis plus rien ne circule', async () => {
  const { dir, id } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  fake.edit(0, { title: '  Une   retouchée ' });
  const first = await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) });
  assert.deepEqual(first?.pulls, [{ id: 'une', title: 'Une retouchée' }]);
  await saveMap(id, edited(map('une'), { une: { text: 'Une retouchée' } }), 1, { dir });
  const settled = await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(2) });
  assert.deepEqual(settled?.pulls, []);
  assert.deepEqual(fake.patches, []);
});

test('repris dans la carte puis changé de nouveau chez Google avant d’être entériné : c’est le changement de Google qui gagne', async () => {
  const { dir, id } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  fake.edit(0, { status: 'completed' });
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) });
  await saveMap(id, edited(map('une'), { une: { done: true } }), 1, { dir });
  fake.edit(0, { status: 'needsAction' });
  const result = await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(2) });
  assert.deepEqual(fake.patches, []);
  assert.deepEqual(result?.pulls, [{ id: 'une', done: false }]);
});

test('une tâche supprimée chez Google alors qu’un changement en attendait la reprise est notée perdue, rien n’est renvoyé', async () => {
  const { dir, id, links } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) });
  fake.edit(0, { status: 'completed' });
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(2) });
  fake.remove(0);
  const result = await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(3) });
  assert.deepEqual(result?.pulls, []);
  assert.equal(result?.lost, 1);
  assert.equal('incoming' in (await links()).une, false);
});

test('ce qui change chez Google pendant qu’un nœud est détaché revient quand il redevient une tâche', async () => {
  const { dir, id } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) });
  const idea = map('une');
  delete idea.children[0].task;
  await saveMap(id, idea, 1, { dir });
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(2) });
  fake.edit(0, { status: 'completed' });
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(3) });
  await saveMap(id, map('une'), 2, { dir });
  const back = await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(4) });
  assert.deepEqual(back?.pulls, [{ id: 'une', done: true }]);
  assert.deepEqual(fake.patches, []);
});

test('une passe qui veut relire Google, arrivée pendant une passe qui ne lit pas, relit bien Google ensuite', async () => {
  const { dir, id } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) });
  fake.edit(0, { status: 'completed' });
  await saveMap(id, edited(map('une'), { une: { text: 'Une, renommée' } }), 1, { dir });
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let first = true;
  const slow = (async (url: string, init?: RequestInit) => {
    if (first && init?.method === 'PATCH') {
      first = false;
      await held;
    }
    return fake.google(url, init);
  }) as Google;
  const quiet = syncTasks(id, 'Cartes', slow, { dir, now: minute(2), read: false });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const editor = syncTasks(id, 'Cartes', slow, { dir, now: minute(2) });
  release();
  await quiet;
  assert.deepEqual((await editor)?.pulls, [{ id: 'une', done: true }]);
});

test('supprimer un nœud avec sa tâche Google : la tâche est supprimée chez Google et le lien oublié', async () => {
  const { dir, id, links } = await sending(map('une', 'deux'));
  const fake = fakeGoogle();
  const first = await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  assert.deepEqual(first?.linked, ['une', 'deux']);
  await saveMap(id, map('deux'), 1, { dir, forget: ['une'] });
  fake.calls.length = 0;
  const after = await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  assert.deepEqual(fake.calls, ['DELETE /tasks/v1/lists/L1/tasks/g1']);
  assert.deepEqual(Object.keys(await links()), ['deux']);
  assert.deepEqual(after?.linked, ['deux']);
});

test('sans ce choix, retirer un nœud ne supprime rien chez Google, même juste après une demande annulée', async () => {
  const { dir, id, links } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  await saveMap(id, map('une'), 1, { dir, forget: ['une'] });
  await saveMap(id, map(), 2, { dir });
  fake.calls.length = 0;
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  assert.deepEqual(fake.calls, []);
  assert.equal((await links()).une.detached, true);
});

test('une tâche à supprimer déjà absente chez Google est oubliée ; un refus de Google la garde pour plus tard sans faire échouer la passe', async () => {
  const { dir, id, links } = await sending(map('une', 'deux'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  await saveMap(id, map(), 1, { dir, forget: ['une', 'deux'] });
  fake.tasks.L1.shift();
  const refusing = (async (url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE' && url.endsWith('/g2')) throw new GoogleHttpError('refusé', 403);
    return fake.google(url, init);
  }) as Google;
  const silenced = console.error;
  console.error = () => {};
  try {
    assert.equal((await syncTasks(id, 'Cartes', refusing, { dir, now: minute(0) }))?.enabled, true);
  } finally {
    console.error = silenced;
  }
  assert.deepEqual(Object.keys(await links()), ['deux']);
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  assert.deepEqual(await links(), {});
});

test('un nœud remis et enregistré pendant les suppressions n’est pas supprimé chez Google', async () => {
  const { dir, id, links } = await sending(map('une', 'deux'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  await saveMap(id, map(), 1, { dir, forget: ['une', 'deux'] });
  let first = true;
  const restoring = (async (url: string, init?: RequestInit) => {
    if (first && init?.method === 'DELETE') {
      first = false;
      await saveMap(id, map('deux'), 2, { dir });
    }
    return fake.google(url, init);
  }) as Google;
  await syncTasks(id, 'Cartes', restoring, { dir, now: minute(0) });
  assert.deepEqual(fake.titles(), ['deux']);
  assert.deepEqual(Object.keys(await links()), ['deux']);
});

test('une tâche suivie aussi par une autre carte (réimport) est seulement détachée, jamais supprimée chez Google', async () => {
  const dir = await folder();
  const root = newNode('Voyage', 'root');
  root.children.push({ ...newNode('Billets', '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b'), task: { done: false } });
  const first = (await createMap(root, { dir, sendTasks: true }))!;
  const second = (await createMap(structuredClone(root), { dir, sendTasks: true }))!;
  const fake = fakeGoogle();
  await syncTasks(first.id, 'Cartes', fake.google, { dir, now: minute(0) });
  await syncTasks(second.id, 'Cartes', fake.google, { dir, now: minute(0) });
  await saveMap(first.id, newNode('Voyage', 'root'), 1, { dir, forget: ['3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b'] });
  fake.calls.length = 0;
  await syncTasks(first.id, 'Cartes', fake.google, { dir, now: minute(0) });
  assert.deepEqual(fake.calls.filter((call) => call.startsWith('DELETE')), []);
  assert.deepEqual(fake.titles(), ['Billets']);
  assert.deepEqual((await readMap(first.id, { dir }))!.links, {});
});

test('si une autre carte est illisible, la suppression chez Google attend : on ne sait pas si elle suit la tâche', async () => {
  const { dir, id, links } = await sending(map('une'));
  const fake = fakeGoogle();
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  await fs.writeFile(path.join(dir, '11111111-1111-4111-8111-111111111111.json'), '{ abîmé');
  await saveMap(id, map(), 1, { dir, forget: ['une'] });
  fake.calls.length = 0;
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  assert.deepEqual(fake.calls.filter((call) => call.startsWith('DELETE')), []);
  assert.equal((await links()).une.doomed, true);
  await fs.rm(path.join(dir, '11111111-1111-4111-8111-111111111111.json'));
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  assert.deepEqual(fake.titles(), []);
});

test('une tâche existante reprise dans la carte reste dans sa liste : elle est suivie, rien n’est créé, ses changements reviennent', async () => {
  const { dir, id, links } = await sending(map('une'));
  const fake = fakeGoogle([
    { id: 'L1', title: 'Cartes' },
    { id: 'L9', title: 'Perso' },
  ]);
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  (fake.tasks.L9 ??= []).push({ id: 'p1', title: 'Rendre les livres', updated: UPDATED });
  const withAdopted = map('une');
  withAdopted.children.push({ ...newNode('Rendre les livres', 'livres'), task: { done: false } });
  await saveMap(id, withAdopted, 1, { dir, adopt: [{ nodeId: 'livres', taskId: 'p1', listId: 'L9', title: 'Rendre les livres' }] });
  assert.deepEqual((await links()).livres, { taskId: 'p1', listId: 'L9', title: 'Rendre les livres', done: false, adopted: true });
  fake.calls.length = 0;
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) });
  assert.deepEqual(fake.calls.filter((call) => call.startsWith('POST')), []);
  assert.deepEqual(fake.titles('L1'), ['une']);
  Object.assign(fake.tasks.L9[0], { status: 'completed', updated: '2026-11-21T14:00:00.000Z' });
  const result = await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(2) });
  assert.deepEqual(result?.pulls, [{ id: 'livres', done: true }]);
});

test('une tâche déjà suivie par la carte, ou un nœud absent, n’est pas reprise', async () => {
  const { dir, id, links } = await sending(map('une'));
  await syncTasks(id, 'Cartes', fakeGoogle().google, { dir, now: minute(0) });
  await saveMap(id, map('une'), 1, {
    dir,
    adopt: [
      { nodeId: 'absent', taskId: 'p1', listId: 'L9', title: 'Absent' },
      { nodeId: 'une', taskId: 'p2', listId: 'L9', title: 'Une' },
    ],
  });
  assert.deepEqual(Object.keys(await links()), ['une']);
  assert.equal((await links()).une.taskId, 'g1');
});

test('une liste supprimée chez Google rend « disparues » les tâches reprises qui y étaient, et la carte ne propose pas de les supprimer', async () => {
  const { dir, id, links } = await sending(map('une'));
  const fake = fakeGoogle([
    { id: 'L1', title: 'Cartes' },
    { id: 'L9', title: 'Perso' },
  ]);
  await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(0) });
  (fake.tasks.L9 ??= []).push({ id: 'p1', title: 'Rendre les livres', updated: UPDATED });
  const withAdopted = map('une');
  withAdopted.children.push({ ...newNode('Rendre les livres', 'livres'), task: { done: false } });
  await saveMap(id, withAdopted, 1, { dir, adopt: [{ nodeId: 'livres', taskId: 'p1', listId: 'L9', title: 'Rendre les livres' }] });
  assert.deepEqual((await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(1) }))?.linked, ['une']);
  fake.faults.missingList = 'L9';
  const result = await syncTasks(id, 'Cartes', fake.google, { dir, now: minute(2) });
  assert.equal(result?.lost, 1);
  assert.equal((await links()).livres.lost, true);
});
