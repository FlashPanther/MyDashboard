import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialState, reduce, type EditorState } from '../lib/mindmap/editor.ts';
import type { Command } from '../lib/mindmap/keymap.ts';
import { newNode, type MapNode } from '../lib/mindmap/tree.ts';

let counter = 0;

function run(state: EditorState, command: Command, draft = '', key = ''): EditorState {
  return reduce(state, { type: 'command', command, draft, key, newId: `n${++counter}` });
}

function outline(node: MapNode): string {
  const label = (node.text || '∅') + (node.collapsed ? '[+]' : '');
  return node.children.length ? `${label}(${node.children.map(outline).join(' ')})` : label;
}

function selectedText(state: EditorState): string | null {
  const find = (node: MapNode): MapNode | null =>
    node.id === state.selected ? node : node.children.map(find).find(Boolean) ?? null;
  return state.selected ? (find(state.root)?.text ?? 'introuvable') : null;
}

function start(): EditorState {
  return initialState(newNode('Idée', 'root'));
}

function typed(state: EditorState, ...steps: [Command, string?][]): EditorState {
  return steps.reduce((current, [command, draft]) => run(current, command, draft ?? ''), state);
}

function sample(): EditorState {
  return typed(start(), ['child'], ['child', 'A'], ['sibling', 'A1'], ['stop', 'A2'], ['left'], ['edit'], ['sibling', 'A'], ['stop', 'B']);
}

test('Tab crée un enfant et ouvre sa saisie', () => {
  const state = run(start(), 'child');
  assert.equal(outline(state.root), 'Idée(∅)');
  assert.equal(state.editing?.id, state.selected);
});

test('enchaîner Tab, texte, Entrée, texte construit la carte', () => {
  const state = sample();
  assert.equal(outline(state.root), 'Idée(A(A1 A2) B)');
  assert.equal(selectedText(state), 'B');
  assert.equal(state.editing, null);
});

test('créer puis nommer un nœud ne fait qu’une étape d’annulation', () => {
  const state = typed(start(), ['child'], ['stop', 'A']);
  assert.equal(state.past.length, 1);
  assert.equal(outline(run(state, 'undo').root), 'Idée');
});

test('un nœud laissé vide disparaît sans laisser de trace dans l’historique', () => {
  const state = typed(start(), ['child'], ['stop', '   ']);
  assert.equal(outline(state.root), 'Idée');
  assert.equal(state.past.length, 0);
  assert.equal(selectedText(state), 'Idée');
});

test('tant qu’un nœud est vide, Tab et Entrée n’en créent pas d’autre', () => {
  const editing = run(start(), 'child');
  for (const command of ['child', 'sibling', 'siblingAbove', 'parent'] as const) {
    assert.equal(run(editing, command, ' '), editing);
  }
});

test('sur un nœud vide seulement sélectionné, Tab ouvre sa saisie', () => {
  const state = run(initialState(newNode('', 'root')), 'child');
  assert.equal(state.editing?.id, 'root');
  assert.equal(outline(state.root), '∅');
});

test('Entrée sur un nœud sélectionné l’édite, une seconde Entrée crée le frère', () => {
  const selected = typed(start(), ['child'], ['stop', 'A']);
  const editing = run(selected, 'edit');
  assert.equal(editing.editing?.id, selected.selected);
  assert.equal(editing.editing?.initial, null);
  assert.equal(outline(run(editing, 'sibling', 'A').root), 'Idée(A ∅)');
});

test('éditer sans rien changer ne crée pas d’étape d’annulation', () => {
  const selected = typed(start(), ['child'], ['stop', 'A']);
  assert.equal(typed(selected, ['edit'], ['stop', 'A']).past.length, 1);
});

test('taper sur un nœud sélectionné remplace son texte', () => {
  const selected = typed(start(), ['child'], ['stop', 'A']);
  const editing = run(selected, 'type', '', 'x');
  assert.equal(editing.editing?.initial, 'x');
  const done = run(editing, 'stop', 'xyz');
  assert.equal(outline(done.root), 'Idée(xyz)');
  assert.equal(outline(run(done, 'undo').root), 'Idée(A)');
});

test('Entrée sur la racine en saisie crée un enfant, faute de frère possible', () => {
  const state = typed(start(), ['edit'], ['sibling', 'Idée']);
  assert.equal(outline(state.root), 'Idée(∅)');
});

test('Ctrl+Entrée crée au-dessus, Alt+Entrée insère un parent', () => {
  const state = typed(start(), ['child'], ['stop', 'A'], ['siblingAbove'], ['stop', 'Z'], ['down'], ['parent'], ['stop', 'P']);
  assert.equal(outline(state.root), 'Idée(Z P(A))');
});

test('Maj+Tab revient au parent et retire le nœud quitté s’il est vide', () => {
  const state = typed(start(), ['child'], ['child', 'A'], ['toParent', '']);
  assert.equal(outline(state.root), 'Idée(A)');
  assert.equal(selectedText(state), 'A');
  assert.equal(state.past.length, 1);
  assert.equal(outline(run(state, 'undo').root), 'Idée');
});

test('Maj+Tab garde un nœud qui a du texte, et ne fait rien sur la racine', () => {
  const state = typed(start(), ['child'], ['child', 'A'], ['toParent', 'A1']);
  assert.equal(outline(state.root), 'Idée(A(A1))');
  assert.equal(selectedText(state), 'A');
  const top = run(run(state, 'toParent'), 'toParent');
  assert.equal(selectedText(top), 'Idée');
});

test('Suppr retire la branche et sélectionne le frère suivant, sinon le précédent, sinon le parent', () => {
  let state = typed(sample(), ['left'], ['right']);
  assert.equal(selectedText(state), 'A');
  state = run(state, 'delete');
  assert.equal(outline(state.root), 'Idée(B)');
  assert.equal(selectedText(state), 'B');
  state = run(state, 'delete');
  assert.equal(selectedText(state), 'Idée');
  assert.deepEqual(run(state, 'delete'), state);
});

test('les flèches suivent la carte, et sélectionnent la racine quand rien ne l’est', () => {
  let state = reduce(sample(), { type: 'select', id: null });
  state = run(state, 'down');
  assert.equal(selectedText(state), 'Idée');
  state = run(state, 'right');
  assert.equal(selectedText(state), 'A');
  state = run(state, 'right');
  assert.equal(selectedText(state), 'A1');
  state = run(state, 'down');
  assert.equal(selectedText(state), 'A2');
  state = run(state, 'down');
  assert.equal(selectedText(state), 'A2');
  state = run(run(state, 'left'), 'down');
  assert.equal(selectedText(state), 'B');
});

test('replier s’annule comme le reste', () => {
  let state = typed(sample(), ['up']);
  state = run(state, 'toggle');
  assert.equal(outline(state.root), 'Idée(A[+](A1 A2) B)');
  assert.equal(outline(run(state, 'undo').root), 'Idée(A(A1 A2) B)');
  assert.equal(run(typed(sample()), 'toggle').past.length, sample().past.length);
});

test('annuler puis rétablir retrouve la carte et la sélection', () => {
  const state = sample();
  const undone = run(state, 'undo');
  assert.equal(outline(undone.root), 'Idée(A(A1 A2))');
  const redone = run(undone, 'redo');
  assert.equal(outline(redone.root), outline(state.root));
  assert.equal(selectedText(redone), 'B');
  assert.equal(run(start(), 'undo').past.length, 0);
});

test('une nouvelle modification efface ce qui pouvait être rétabli', () => {
  const state = typed(run(sample(), 'undo'), ['child'], ['stop', 'C']);
  assert.equal(state.future.length, 0);
});

test('cliquer ailleurs valide la saisie en cours, ou retire le nœud resté vide', () => {
  const editing = typed(start(), ['child'], ['child', 'A']);
  const kept = reduce(editing, { type: 'select', id: null, draft: 'A1' });
  assert.equal(outline(kept.root), 'Idée(A(A1))');
  assert.equal(kept.selected, null);
  const dropped = reduce(editing, { type: 'select', id: 'root', draft: '' });
  assert.equal(outline(dropped.root), 'Idée(A)');
  assert.equal(dropped.selected, 'root');
});

test('la perte de focus d’un ancien champ de saisie ne touche pas à la saisie en cours', () => {
  const editing = typed(start(), ['child'], ['sibling', 'A']);
  assert.equal(reduce(editing, { type: 'blur', id: 'ancien', draft: '' }), editing);
  const blurred = reduce(editing, { type: 'blur', id: editing.editing!.id, draft: 'B' });
  assert.equal(outline(blurred.root), 'Idée(A B)');
});

test('un double-clic ouvre la saisie du nœud visé', () => {
  const state = reduce(sample(), { type: 'edit', id: 'root' });
  assert.equal(state.editing?.id, 'root');
  assert.equal(state.selected, 'root');
});

test('replier par le point sélectionne le nœud et s’annule', () => {
  const state = sample();
  const a = state.root.children[0].id;
  const folded = reduce(state, { type: 'toggle', id: a });
  assert.equal(outline(folded.root), 'Idée(A[+](A1 A2) B)');
  assert.equal(folded.selected, a);
  assert.equal(folded.past.length, state.past.length + 1);
});

test('ouvrir une autre carte s’annule aussi', () => {
  const state = reduce(sample(), { type: 'replace', root: newNode('Autre', 'autre') });
  assert.equal(outline(state.root), 'Autre');
  assert.equal(state.selected, 'autre');
  assert.equal(outline(run(state, 'undo').root), 'Idée(A(A1 A2) B)');
});

test('l’historique garde au plus deux cents étapes', () => {
  let state = typed(start(), ['child'], ['stop', 'A']);
  for (let step = 0; step < 250; step++) state = run(state, 'toggle');
  assert.equal(state.past.length, 1);
  state = typed(state, ['child'], ['stop', 'A1'], ['left']);
  for (let step = 0; step < 250; step++) state = run(state, 'toggle');
  assert.equal(state.past.length, 200);
});
