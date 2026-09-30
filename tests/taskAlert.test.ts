import assert from 'node:assert/strict';
import { test } from 'node:test';
import { taskAlert } from '../lib/taskAlert.ts';

test('rien à signaler quand tout est à jour et étiqueté', () => {
  assert.equal(taskAlert([{ overdue: false, tags: ['maison'] }]), null);
});

test('une tâche en retard rend l’alerte grave', () => {
  assert.deepEqual(taskAlert([{ overdue: true, tags: ['maison'] }]), {
    count: 1,
    detail: '1 en retard',
    severe: true,
  });
});

test('une tâche sans étiquette avertit sans gravité', () => {
  assert.deepEqual(taskAlert([{ overdue: false, tags: [] }]), {
    count: 1,
    detail: '1 sans #étiquette',
    severe: false,
  });
});

test('une tâche en retard et sans étiquette ne compte qu’une fois', () => {
  assert.deepEqual(
    taskAlert([
      { overdue: true, tags: [] },
      { overdue: false, tags: [] },
    ]),
    { count: 2, detail: '1 en retard · 2 sans #étiquette', severe: true },
  );
});
