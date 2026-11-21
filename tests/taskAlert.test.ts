import assert from 'node:assert/strict';
import { test } from 'node:test';
import { taskAlert } from '../lib/taskAlert.ts';

test('rien à signaler quand rien n’est en retard', () => {
  assert.equal(taskAlert([{ overdue: false }]), null);
  assert.equal(taskAlert([]), null);
});

test('les tâches en retard rendent l’alerte grave, et elles seules comptent', () => {
  assert.deepEqual(taskAlert([{ overdue: true }, { overdue: false }, { overdue: true }]), {
    count: 2,
    detail: '2 en retard',
    severe: true,
  });
});
