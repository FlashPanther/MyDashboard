import assert from 'node:assert/strict';
import { test } from 'node:test';
import { branches } from '../lib/taskMap.ts';
import type { TaskItem } from '../app/api/tasks/route.ts';

function task(id: string, listId: string, extra: Partial<TaskItem> = {}): TaskItem {
  return {
    id,
    title: id,
    label: id,
    tags: [],
    due: null,
    notes: null,
    list: listId,
    listId,
    overdue: false,
    dueToday: false,
    url: '',
    updated: null,
    ...extra,
  };
}

const lists = [
  { id: 'a', title: 'A' },
  { id: 'b', title: 'B' },
  { id: 'c', title: 'C' },
];

test('chaque liste devient une branche, même vide', () => {
  const result = branches(lists, [task('t1', 'a')]);
  assert.deepEqual(
    result.map((branch) => [branch.title, branch.tasks.length]),
    [['A', 1], ['B', 0], ['C', 0]],
  );
});

test('les tâches #plustard sont mises à part', () => {
  const [branch] = branches(lists, [task('t1', 'a', { tags: ['plustard'] }), task('t2', 'a')]);
  assert.deepEqual(branch.tasks.map((t) => t.id), ['t2']);
  assert.deepEqual(branch.later.map((t) => t.id), ['t1']);
});

test('les listes avec du retard ou du travail du jour passent devant', () => {
  const result = branches(lists, [
    task('t1', 'a'),
    task('t2', 'a'),
    task('t3', 'c', { overdue: true }),
    task('t4', 'b', { dueToday: true }),
    task('t5', 'b'),
  ]);
  assert.deepEqual(result.map((branch) => branch.title), ['B', 'C', 'A']);
  assert.equal(result[0].pressing, 1);
});

test('à égalité, la liste la plus chargée passe devant, puis l’ordre de Google', () => {
  const result = branches(lists, [task('t1', 'c'), task('t2', 'c'), task('t3', 'b')]);
  assert.deepEqual(result.map((branch) => branch.title), ['C', 'B', 'A']);
});

test('une tâche #plustard en retard ou du jour reste visible et compte', () => {
  const [branch] = branches(lists, [task('t1', 'a', { tags: ['plustard'], overdue: true })]);
  assert.deepEqual(branch.tasks.map((t) => t.id), ['t1']);
  assert.equal(branch.later.length, 0);
  assert.equal(branch.pressing, 1);
});

test('sans keepEmpty, les listes sans tâche disparaissent', () => {
  const result = branches(lists, [task('t1', 'b', { tags: ['plustard'] })], { keepEmpty: false });
  assert.deepEqual(result.map((branch) => branch.title), ['B']);
});
