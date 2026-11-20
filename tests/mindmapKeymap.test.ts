import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandFor, type KeyPress } from '../lib/mindmap/keymap.ts';

function press(key: string, modifiers: Partial<KeyPress> = {}): KeyPress {
  return { key, code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers };
}

test('pendant la saisie, les raccourcis de Whimsical créent enfant, frère, frère au-dessus et parent', () => {
  assert.equal(commandFor(press('Tab'), 'editing'), 'child');
  assert.equal(commandFor(press('Enter'), 'editing'), 'sibling');
  assert.equal(commandFor(press('Enter', { ctrlKey: true }), 'editing'), 'siblingAbove');
  assert.equal(commandFor(press('Enter', { metaKey: true }), 'editing'), 'siblingAbove');
  assert.equal(commandFor(press('Enter', { altKey: true }), 'editing'), 'parent');
  assert.equal(commandFor(press('/', { ctrlKey: true }), 'editing'), 'toggle');
});

test('sur un nœud sélectionné, Entrée ouvre sa saisie et les autres raccourcis créent', () => {
  assert.equal(commandFor(press('Enter'), 'selected'), 'edit');
  assert.equal(commandFor(press('Tab'), 'selected'), 'child');
  assert.equal(commandFor(press('Enter', { ctrlKey: true }), 'selected'), 'siblingAbove');
  assert.equal(commandFor(press('Enter', { altKey: true }), 'selected'), 'parent');
});

test('Maj+Tab revient au parent, sauf quand rien n’est sélectionné', () => {
  assert.equal(commandFor(press('Tab', { shiftKey: true }), 'selected'), 'toParent');
  assert.equal(commandFor(press('Tab', { shiftKey: true }), 'editing'), 'toParent');
  assert.equal(commandFor(press('Tab', { shiftKey: true }), 'idle'), null);
});

test('Maj+Entrée est laissé au navigateur pour le saut de ligne', () => {
  assert.equal(commandFor(press('Enter', { shiftKey: true }), 'editing'), null);
});

test('replier répond aussi à la touche placée là où est le « / » américain', () => {
  assert.equal(commandFor(press('!', { ctrlKey: true, code: 'Slash' }), 'selected'), 'toggle');
});

test('pendant la saisie, les touches de texte restent au navigateur', () => {
  for (const key of ['a', 'Backspace', 'ArrowLeft', '1']) assert.equal(commandFor(press(key), 'editing'), null);
  assert.equal(commandFor(press('z', { ctrlKey: true }), 'editing'), null);
});

test('Échap finit la saisie, puis désélectionne', () => {
  assert.equal(commandFor(press('Escape'), 'editing'), 'stop');
  assert.equal(commandFor(press('Escape'), 'selected'), 'deselect');
});

test('flèches, Suppr et F2 agissent sur le nœud sélectionné', () => {
  assert.equal(commandFor(press('ArrowLeft'), 'selected'), 'left');
  assert.equal(commandFor(press('ArrowDown'), 'idle'), 'down');
  assert.equal(commandFor(press('Delete'), 'selected'), 'delete');
  assert.equal(commandFor(press('Backspace'), 'selected'), 'delete');
  assert.equal(commandFor(press('F2'), 'selected'), 'edit');
});

test('une touche imprimable lance la saisie en remplaçant le texte', () => {
  assert.equal(commandFor(press('a'), 'selected'), 'type');
  assert.equal(commandFor(press('É', { shiftKey: true }), 'selected'), 'type');
  assert.equal(commandFor(press('@', { ctrlKey: true, altKey: true }), 'selected'), 'type');
  assert.equal(commandFor(press(' '), 'selected'), null);
  assert.equal(commandFor(press('Shift', { shiftKey: true }), 'selected'), null);
});

test('annuler, rétablir et zoomer', () => {
  assert.equal(commandFor(press('z', { ctrlKey: true }), 'selected'), 'undo');
  assert.equal(commandFor(press('Z', { ctrlKey: true, shiftKey: true }), 'selected'), 'redo');
  assert.equal(commandFor(press('y', { ctrlKey: true }), 'idle'), 'redo');
  assert.equal(commandFor(press('='), 'selected'), 'zoomIn');
  assert.equal(commandFor(press('-'), 'selected'), 'zoomOut');
  assert.equal(commandFor(press('0'), 'idle'), 'zoomReset');
  assert.equal(commandFor(press('1'), 'idle'), 'zoomFit');
});

test('les raccourcis du navigateur ne sont pas pris', () => {
  assert.equal(commandFor(press('r', { ctrlKey: true }), 'selected'), null);
  assert.equal(commandFor(press('Tab', { ctrlKey: true }), 'selected'), null);
  assert.equal(commandFor(press('ArrowLeft', { altKey: true }), 'selected'), null);
});

test('sans sélection, seuls créer un enfant et se déplacer répondent', () => {
  assert.equal(commandFor(press('Tab'), 'idle'), 'child');
  assert.equal(commandFor(press('Enter'), 'idle'), null);
  assert.equal(commandFor(press('Delete'), 'idle'), null);
  assert.equal(commandFor(press('a'), 'idle'), null);
});

test('à plusieurs, seuls supprimer, désélectionner, se déplacer, annuler et zoomer répondent', () => {
  assert.equal(commandFor(press('Delete'), 'multiple'), 'delete');
  assert.equal(commandFor(press('Escape'), 'multiple'), 'deselect');
  assert.equal(commandFor(press('ArrowDown'), 'multiple'), 'down');
  assert.equal(commandFor(press('z', { ctrlKey: true }), 'multiple'), 'undo');
  assert.equal(commandFor(press('='), 'multiple'), 'zoomIn');
  for (const key of ['Tab', 'Enter', 'a', 'F2']) assert.equal(commandFor(press(key), 'multiple'), null);
  assert.equal(commandFor(press('@', { ctrlKey: true, altKey: true }), 'multiple'), null);
  assert.equal(commandFor(press('/', { ctrlKey: true }), 'multiple'), null);
});
