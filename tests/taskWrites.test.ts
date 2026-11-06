import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newTaskRequest, parseTaskChange, taskChangeRequest } from '../lib/google/taskWrites.ts';

const API = 'https://tasks.googleapis.com/tasks/v1';

test('une nouvelle tâche part dans la liste choisie', () => {
  const { url, init } = newTaskRequest('Acheter du pain', 'liste1');
  assert.equal(url, `${API}/lists/liste1/tasks`);
  assert.equal(init.method, 'POST');
  assert.equal(init.body, JSON.stringify({ title: 'Acheter du pain' }));
});

test('sans liste choisie, la nouvelle tâche part dans la liste par défaut', () => {
  assert.equal(newTaskRequest('Pain', undefined).url, `${API}/lists/%40default/tasks`);
});

test('terminer une tâche passe son statut à completed', () => {
  const { url, init } = taskChangeRequest('t1', { listId: 'l1', done: true });
  assert.equal(url, `${API}/lists/l1/tasks/t1`);
  assert.equal(init.method, 'PATCH');
  assert.equal(init.body, JSON.stringify({ status: 'completed' }));
});

test('déplacer une tâche vise la liste de destination', () => {
  const { url, init } = taskChangeRequest('t1', { listId: 'l1', moveTo: 'l2' });
  assert.equal(url, `${API}/lists/l1/tasks/t1/move?destinationTasklist=l2`);
  assert.equal(init.method, 'POST');
});

test('un identifiant ne peut pas sortir de son segment d’adresse', () => {
  const { url } = taskChangeRequest('../../users/@me/lists', { listId: 'l/../x', done: true });
  assert.equal(url, `${API}/lists/l%2F..%2Fx/tasks/..%2F..%2Fusers%2F%40me%2Flists`);
});

test('un changement valide est reconnu', () => {
  assert.deepEqual(parseTaskChange({ listId: 'l1', done: true }), { listId: 'l1', done: true });
  assert.deepEqual(parseTaskChange({ listId: 'l1', moveTo: 'l2' }), { listId: 'l1', moveTo: 'l2' });
});

test('un changement incomplet ou ambigu est refusé', () => {
  for (const body of [
    null,
    {},
    { done: true },
    { listId: 'l1' },
    { listId: 'l1', done: false },
    { listId: 'l1', moveTo: ' ' },
    { listId: 'l1', moveTo: 42 },
    { listId: 'l1', done: true, moveTo: 'l2' },
  ]) {
    assert.equal(parseTaskChange(body), null, JSON.stringify(body));
  }
});
