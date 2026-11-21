import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialState, modeOf, reduce, type EditorState } from '../lib/mindmap/editor.ts';
import type { EditCommand } from '../lib/mindmap/keymap.ts';
import { find, newNode, visibleNodes, type MapNode } from '../lib/mindmap/tree.ts';

function run(state: EditorState, command: EditCommand, draft?: string, key = ''): EditorState {
  return reduce(state, { type: 'command', command, draft, key });
}

function outline(node: MapNode): string {
  const label = (node.text || '∅') + (node.collapsed ? '[+]' : '');
  return node.children.length ? `${label}(${node.children.map(outline).join(' ')})` : label;
}

function selectedText(state: EditorState): string | null {
  return state.selected ? (find(state.root, state.selected)?.text ?? 'introuvable') : null;
}

function start(): EditorState {
  return initialState(newNode('Idée', 'root'));
}

function typed(state: EditorState, ...steps: [EditCommand, string?][]): EditorState {
  return steps.reduce((current, [command, draft]) => run(current, command, draft), state);
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
  assert.equal(run(sample(), 'toggle').past.length, sample().past.length);
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
  let state = typed(start(), ['child'], ['child', 'A'], ['stop', 'A1'], ['left']);
  for (let step = 0; step < 250; step++) state = run(state, 'toggle');
  assert.equal(state.past.length, 200);
});

test('une action sans texte de saisie laisse le texte du nœud tel quel', () => {
  const selected = typed(start(), ['child'], ['stop', 'A']);
  const done = run(run(selected, 'edit'), 'stop');
  assert.equal(outline(done.root), 'Idée(A)');
  assert.equal(done.past.length, selected.past.length);
  const replaced = run(run(selected, 'type', undefined, 'x'), 'stop');
  assert.equal(outline(replaced.root), 'Idée(x)');
});

test('Maj+Tab retire aussi un nœud vide qui n’était que sélectionné', () => {
  const emptied = typed(start(), ['child'], ['child', 'A'], ['stop', 'A1'], ['delete'], ['edit'], ['stop', '']);
  assert.equal(outline(emptied.root), 'Idée');
  const kept = initialState({ ...newNode('Idée', 'root'), children: [newNode('', 'vide')] });
  const left = run(reduce(kept, { type: 'select', id: 'vide' }), 'toParent');
  assert.equal(outline(left.root), 'Idée');
  assert.equal(left.selected, 'root');
});

test('le mode suit la saisie et la sélection', () => {
  assert.equal(modeOf(start()), 'selected');
  assert.equal(modeOf(run(start(), 'child')), 'editing');
  assert.equal(modeOf(run(start(), 'deselect')), 'idle');
});

test('un parent inséré puis abandonné vide est retiré sans trace, et l’enfant retrouve sa place', () => {
  const selected = typed(start(), ['child'], ['stop', 'A']);
  const abandoned = typed(selected, ['parent'], ['stop', '']);
  assert.equal(outline(abandoned.root), 'Idée(A)');
  assert.equal(abandoned.past.length, selected.past.length);
  assert.equal(selectedText(abandoned), 'A');
});

test('un enfant abandonné vide ne laisse pas sa branche dépliée ni d’étape d’annulation', () => {
  const folded = typed(start(), ['child'], ['child', 'A'], ['stop', 'A1'], ['left'], ['toggle']);
  const abandoned = typed(folded, ['child'], ['stop', '']);
  assert.equal(outline(abandoned.root), 'Idée(A[+](A1))');
  assert.equal(abandoned.root, folded.root);
  assert.equal(abandoned.past.length, folded.past.length);
});

test('un nœud existant vidé de son texte disparaît, en une étape qui s’annule', () => {
  const selected = typed(start(), ['child'], ['stop', 'A']);
  const emptied = typed(selected, ['edit'], ['stop', '']);
  assert.equal(outline(emptied.root), 'Idée');
  assert.equal(outline(run(emptied, 'undo').root), 'Idée(A)');
});

test('la carte ne dépasse pas la profondeur que sa relecture accepte', () => {
  let state = start();
  for (let level = 0; level < 105; level++) state = typed(state, ['child'], ['stop', 'x']);
  let depth = 0;
  for (let node = state.root; node.children.length; node = node.children[0]) depth++;
  assert.equal(depth, 100);
});

test('un déplacement qui ferait dépasser la profondeur relisible est ignoré', () => {
  let state = start();
  for (let level = 0; level < 100; level++) state = typed(state, ['child'], ['stop', 'x']);
  const deepest = state.selected!;
  state = typed(reduce(state, { type: 'select', id: 'root' }), ['child'], ['stop', 'feuille']);
  const leaf = state.selected!;
  const moved = reduce(state, { type: 'move', ids: [leaf], parentId: deepest, beforeId: null, side: 'right' });
  assert.equal(moved.root, state.root);
  assert.equal(moved.past.length, state.past.length);
});

function grouped(...texts: string[]): EditorState {
  const state = sample();
  const ids = texts.map((text) => {
    const walk = (node: MapNode): string | null =>
      node.text === text ? node.id : node.children.map(walk).find(Boolean) ?? null;
    return walk(state.root)!;
  });
  return reduce(state, { type: 'mark', ids });
}

test('un cadre sur plusieurs nœuds en fait un groupe, dans l’ordre de la carte', () => {
  const state = grouped('B', 'A1');
  assert.equal(modeOf(state), 'multiple');
  assert.deepEqual(state.group.map((id) => find(state.root, id)!.text), ['A1', 'B']);
  assert.equal(selectedText(state), 'A1');
});

test('un cadre sur un seul nœud le sélectionne, un cadre vide désélectionne', () => {
  const one = grouped('B');
  assert.deepEqual([one.group.length, selectedText(one), modeOf(one)], [0, 'B', 'selected']);
  const none = reduce(sample(), { type: 'mark', ids: [] });
  assert.deepEqual([none.group.length, none.selected, modeOf(none)], [0, null, 'idle']);
});

test('Suppr retire tout le groupe en une étape, parents et enfants confondus', () => {
  const state = run(grouped('A', 'A1', 'B'), 'delete');
  assert.equal(outline(state.root), 'Idée');
  assert.equal(selectedText(state), 'Idée');
  assert.equal(state.group.length, 0);
  assert.equal(outline(run(state, 'undo').root), 'Idée(A(A1 A2) B)');
});

test('la racine prise dans un groupe n’est pas supprimée', () => {
  const state = run(grouped('Idée', 'B'), 'delete');
  assert.equal(outline(state.root), 'Idée(A(A1 A2))');
});

test('toute autre action dissout le groupe', () => {
  assert.equal(run(grouped('A1', 'B'), 'down').group.length, 0);
  assert.equal(run(grouped('A1', 'B'), 'deselect').selected, null);
  assert.equal(reduce(grouped('A1', 'B'), { type: 'select', id: 'root' }).group.length, 0);
  assert.equal(reduce(grouped('A1', 'B'), { type: 'toggle', id: 'root' }).group.length, 0);
  assert.equal(run(grouped('A1', 'B'), 'undo').group.length, 0);
});

test('déplacer un groupe le garde sélectionné et se fait en une étape', () => {
  const state = grouped('A1', 'A2');
  const b = state.root.children[1].id;
  const moved = reduce(state, { type: 'move', ids: state.group, parentId: b, beforeId: null, side: 'right' });
  assert.equal(outline(moved.root), 'Idée(A B(A1 A2))');
  assert.equal(moved.group.length, 2);
  assert.equal(moved.past.length, state.past.length + 1);
});

test('après la suppression d’un groupe, la sélection va au voisin resté en place', () => {
  const state = run(grouped('A1', 'A2'), 'delete');
  assert.equal(outline(state.root), 'Idée(A B)');
  assert.equal(selectedText(state), 'A');
  const first = run(grouped('A', 'A2'), 'delete');
  assert.equal(selectedText(first), 'B');
});

test('replier ou déplier toute une branche sélectionne le nœud et s’annule en une étape', () => {
  const state = grouped('A1', 'B');
  const a = state.root.children[0].id;
  const folded = reduce(state, { type: 'foldBranch', id: a, collapsed: true });
  assert.equal(outline(folded.root), 'Idée(A[+](A1 A2) B)');
  assert.deepEqual([folded.selected, folded.group.length, folded.past.length], [a, 0, state.past.length + 1]);
  assert.equal(outline(run(folded, 'undo').root), 'Idée(A(A1 A2) B)');
  const unchanged = reduce(state, { type: 'foldBranch', id: a, collapsed: false });
  assert.equal(unchanged.past.length, state.past.length);
});

const tasks = (state: EditorState) =>
  visibleNodes(state.root)
    .slice(1)
    .map(({ node }) => (node.task ? (node.task.done ? 'done' : 'todo') : '-'));

test('marquer puis cocher une tâche sont deux étapes d’annulation, la sélection ne bouge pas', () => {
  const marked = run(sample(), 'task');
  assert.equal(selectedText(marked), 'B');
  assert.deepEqual(tasks(marked), ['-', '-', '-', 'todo']);
  const done = run(marked, 'tick');
  assert.deepEqual(tasks(done), ['-', '-', '-', 'done']);
  assert.deepEqual(tasks(run(done, 'undo')), ['-', '-', '-', 'todo']);
  assert.deepEqual(tasks(run(run(done, 'undo'), 'undo')), ['-', '-', '-', '-']);
});

test('cocher une idée ne fait rien et ne crée pas d’étape d’annulation', () => {
  const state = sample();
  assert.equal(run(state, 'tick').past.length, state.past.length);
});

test('la case d’un nœud le coche et le sélectionne, sans passer par la sélection courante', () => {
  const marked = run(sample(), 'task');
  const id = marked.selected!;
  const elsewhere = run(marked, 'up');
  const done = reduce(elsewhere, { type: 'tick', ids: [id] });
  assert.equal(done.selected, id);
  assert.deepEqual(tasks(done), ['-', '-', '-', 'done']);
});

test('sur un groupe, marquer et cocher s’appliquent à tous et le groupe reste sélectionné', () => {
  const state = sample();
  const ids = state.root.children.map((node) => node.id);
  const marked = run(reduce(state, { type: 'mark', ids }), 'task');
  assert.deepEqual(tasks(marked), ['todo', '-', '-', 'todo']);
  assert.equal(modeOf(marked), 'multiple');
  const done = run(marked, 'tick');
  assert.deepEqual(tasks(done), ['done', '-', '-', 'done']);
  assert.equal(modeOf(done), 'multiple');
});

test('déplacer ou renommer une tâche garde son état', () => {
  const marked = run(run(sample(), 'task'), 'tick');
  const id = marked.selected!;
  const a = marked.root.children[0].id;
  const moved = reduce(marked, { type: 'move', ids: [id], parentId: a, beforeId: null, side: 'right' });
  assert.equal(find(moved.root, id)!.task?.done, true);
  const renamed = run(run(moved, 'edit'), 'stop', 'B bis');
  assert.equal(find(renamed.root, id)!.task?.done, true);
});

test('le menu transforme en tâche le nœud visé, même s’il n’est pas la sélection, et dissout le groupe', () => {
  const state = sample();
  const [a, b] = state.root.children.map((node) => node.id);
  const marked = reduce(reduce(state, { type: 'mark', ids: [a, b] }), { type: 'task', ids: [a] });
  assert.deepEqual(tasks(marked), ['todo', '-', '-', '-']);
  assert.equal(marked.selected, a);
  assert.equal(modeOf(marked), 'selected');
});

test('cocher la case d’une tâche vidée pendant sa saisie la retire sans laisser de sélection fantôme', () => {
  const marked = run(sample(), 'task');
  const id = marked.selected!;
  const emptied = reduce(run(marked, 'edit'), { type: 'tick', ids: [id], draft: '' });
  assert.equal(find(emptied.root, id), null);
  assert.notEqual(selectedText(emptied), 'introuvable');
  assert.equal(outline(run(emptied, 'child').root), 'Idée(A(A1 A2 ∅))');
});

function hiding(): EditorState {
  return reduce(sample(), { type: 'hideDone', hide: true });
}

test('quand les tâches faites sont masquées, cocher la tâche sélectionnée reporte la sélection sur son parent', () => {
  const up = run(run(hiding(), 'up'), 'right');
  assert.equal(selectedText(up), 'A1');
  const done = run(run(up, 'task'), 'tick');
  assert.equal(selectedText(done), 'A');
  assert.equal(selectedText(run(done, 'right')), 'A2');
  assert.equal(selectedText(run(done, 'undo')), 'A1');
});

test('les flèches sautent les tâches masquées, et les réafficher ne change ni la carte ni l’historique', () => {
  const state = run(run(run(hiding(), 'up'), 'task'), 'tick');
  assert.equal(selectedText(state), 'Idée');
  assert.equal(selectedText(run(state, 'right')), 'B');
  const shown = reduce(state, { type: 'hideDone', hide: false });
  assert.equal(shown.root, state.root);
  assert.equal(shown.past.length, state.past.length);
  assert.equal(selectedText(run(shown, 'right')), 'A');
});

test('cocher un groupe quand les tâches faites sont masquées le fait disparaître et dissout le groupe', () => {
  const state = hiding();
  const ids = state.root.children.map((node) => node.id);
  const marked = run(reduce(state, { type: 'mark', ids }), 'task');
  assert.equal(modeOf(marked), 'multiple');
  const done = run(marked, 'tick');
  assert.equal(modeOf(done), 'selected');
  assert.equal(selectedText(done), 'Idée');
  assert.equal(modeOf(run(done, 'undo')), 'selected');
});

test('quand les tâches faites sont masquées, supprimer un nœud sélectionne son voisin visible, pas une tâche cachée', () => {
  const base = typed(sample(), ['sibling'], ['stop', 'C']);
  const b = base.root.children[1].id;
  const hidden = reduce(run(run(reduce(base, { type: 'select', id: b }), 'task'), 'tick'), { type: 'hideDone', hide: true });
  const onA = run(hidden, 'right');
  assert.equal(selectedText(onA), 'A');
  const removed = run(onA, 'delete');
  assert.equal(outline(removed.root), 'Idée(B C)');
  assert.equal(selectedText(removed), 'C');
});

test('replier un nœud dont tous les enfants sont masqués ne fait rien', () => {
  const state = run(run(hiding(), 'up'), 'right');
  const ids = find(state.root, state.root.children[0].id)!.children.map((node) => node.id);
  const done = run(run(reduce(state, { type: 'mark', ids }), 'task'), 'tick');
  assert.equal(selectedText(done), 'A');
  const folded = run(done, 'toggle');
  assert.equal(folded.root, done.root);
  assert.equal(folded.past.length, done.past.length);
});

test('reposer un nœud à sa place visible ne déplace pas les tâches masquées et ne crée pas d’étape d’annulation', () => {
  const base = typed(sample(), ['sibling'], ['stop', 'C']);
  const [a, b, c] = base.root.children.map((node) => node.id);
  const hidden = reduce(run(run(reduce(base, { type: 'select', id: b }), 'task'), 'tick'), { type: 'hideDone', hide: true });
  const dropped = reduce(hidden, { type: 'move', ids: [a], parentId: 'root', beforeId: c, side: 'right' });
  assert.equal(dropped.root, hidden.root);
  assert.equal(dropped.past.length, hidden.past.length);
  const moved = reduce(hidden, { type: 'move', ids: [c], parentId: 'root', beforeId: a, side: 'right' });
  assert.equal(outline(moved.root), 'Idée(C A(A1 A2) B)');
});

test('un changement venu de Google est une étape d’annulation ordinaire, garde la sélection et le groupe', () => {
  const marked = run(sample(), 'task');
  const id = marked.selected!;
  const ids = marked.root.children.map((node) => node.id);
  const grouped = reduce(marked, { type: 'mark', ids });
  const taken = reduce(grouped, { type: 'remote', changes: [{ id, done: true, title: 'B, renommée chez Google' }] });
  assert.deepEqual([find(taken.root, id)!.text, find(taken.root, id)!.task], ['B, renommée chez Google', { done: true }]);
  assert.equal(modeOf(taken), 'multiple');
  assert.equal(find(run(taken, 'undo').root, id)!.task?.done, false);
});

test('un changement venu de Google ne touche pas le nœud en cours de saisie, et rien ne bouge s’il n’y a rien à reprendre', () => {
  const marked = run(sample(), 'task');
  const id = marked.selected!;
  const typing = run(marked, 'edit');
  const untouched = reduce(typing, { type: 'remote', changes: [{ id, title: 'Écrasé ?' }] });
  assert.equal(untouched.root, typing.root);
  assert.equal(untouched.editing?.id, id);
  assert.equal(reduce(marked, { type: 'remote', changes: [{ id, done: false }] }).past.length, marked.past.length);
});

test('reprendre une tâche existante ajoute un nœud-tâche nommé sous le parent, sélectionné, en une étape d’annulation', () => {
  const state = sample();
  const parent = state.root.children[0].id;
  const adopted = reduce(state, { type: 'adopt', parentId: parent, id: 'livres', text: 'Rendre les livres', from: { taskId: 'p1', listId: 'L9' } });
  const node = find(adopted.root, 'livres')!;
  assert.deepEqual([node.text, node.task, node.from], ['Rendre les livres', { done: false }, { taskId: 'p1', listId: 'L9' }]);
  assert.equal(adopted.selected, 'livres');
  assert.equal(find(run(adopted, 'undo').root, 'livres'), null);
  assert.equal(reduce(adopted, { type: 'adopt', parentId: parent, id: 'livres', text: 'Encore', from: { taskId: 'p1', listId: 'L9' } }).root, adopted.root);
});

test('une tâche reprise par glisser-déposer arrive à l’endroit visé : parent, rang et côté', () => {
  const state = sample();
  const [first, second] = state.root.children.map((child) => child.id);
  const dropped = reduce(state, { type: 'adopt', parentId: state.root.id, id: 'livres', text: 'Rendre les livres', from: { taskId: 'p1', listId: 'L9' }, beforeId: second, side: 'right' });
  assert.deepEqual(dropped.root.children.map((child) => child.id).slice(0, 3), [first, 'livres', second]);
  assert.equal(dropped.selected, 'livres');
  assert.equal(find(run(dropped, 'undo').root, 'livres'), null);
});

test('retirer des nœuds glissés hors de la carte les supprime en une étape d’annulation, jamais la racine', () => {
  const state = sample();
  const [first, second] = state.root.children.map((child) => child.id);
  const removed = reduce(state, { type: 'remove', ids: [first, second, state.root.id] });
  assert.equal(find(removed.root, first), null);
  assert.equal(find(removed.root, second), null);
  assert.equal(find(run(removed, 'undo').root, first)?.id, first);
  assert.equal(reduce(state, { type: 'remove', ids: [state.root.id] }).root, state.root);
});

test('une tâche déjà reprise dans la carte n’y est pas reprise une seconde fois, même sous un autre nœud', () => {
  const state = sample();
  const from = { taskId: 'p1', listId: 'L9' };
  const once = reduce(state, { type: 'adopt', parentId: state.root.id, id: 'livres', text: 'Rendre les livres', from });
  assert.equal(reduce(once, { type: 'adopt', parentId: state.root.children[0].id, id: 'encore', text: 'Rendre les livres', from }).root, once.root);
});
