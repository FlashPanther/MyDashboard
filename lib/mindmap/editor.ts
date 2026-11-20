import type { Command } from './keymap.ts';
import {
  addChild,
  addParent,
  addSibling,
  find,
  isEmptyLeaf,
  neighbour,
  newNode,
  parentOf,
  remove,
  rename,
  sameMap,
  toggleCollapsed,
  type MapNode,
} from './tree.ts';

export type Snapshot = { root: MapNode; selected: string | null };

export type Editing = { id: string; initial: string | null; before: Snapshot };

export type EditorState = Snapshot & { editing: Editing | null; past: Snapshot[]; future: Snapshot[] };

export type EditorAction = { draft?: string } & (
  | { type: 'command'; command: Command; key?: string; newId?: string }
  | { type: 'select'; id: string | null }
  | { type: 'edit'; id: string }
  | { type: 'blur'; id: string }
  | { type: 'toggle'; id: string }
  | { type: 'replace'; root: MapNode }
);

const HISTORY_LIMIT = 200;
const CREATIONS: ReadonlySet<Command> = new Set(['child', 'sibling', 'siblingAbove', 'parent']);

export function initialState(root: MapNode): EditorState {
  return { root, selected: root.id, editing: null, past: [], future: [] };
}

export function reduce(state: EditorState, action: EditorAction): EditorState {
  const draft = action.draft ?? '';
  switch (action.type) {
    case 'command':
      return runCommand(state, action.command, draft, action.key ?? '', action.newId ?? crypto.randomUUID());
    case 'select':
      if (action.id !== null && action.id === state.editing?.id) return state;
      return { ...finishEditing(state, draft), selected: action.id };
    case 'edit':
      if (action.id === state.editing?.id) return state;
      return startEditing({ ...finishEditing(state, draft), selected: action.id }, null);
    case 'blur':
      return action.id === state.editing?.id ? finishEditing(state, draft) : state;
    case 'toggle': {
      const settled = finishEditing(state, draft);
      return commit(settled, toggleCollapsed(settled.root, action.id), action.id);
    }
    case 'replace':
      return commit(finishEditing(state, draft), action.root, action.root.id);
  }
}

function snapshot(state: EditorState): Snapshot {
  return { root: state.root, selected: state.selected };
}

function remember(past: Snapshot[], entry: Snapshot): Snapshot[] {
  return [...past, entry].slice(-HISTORY_LIMIT);
}

function commit(state: EditorState, root: MapNode, selected: string | null): EditorState {
  if (root === state.root) return { ...state, selected };
  return { ...state, root, selected, past: remember(state.past, snapshot(state)), future: [] };
}

function startEditing(state: EditorState, initial: string | null, before: Snapshot = snapshot(state)): EditorState {
  const id = state.selected ?? state.root.id;
  return { ...state, selected: id, editing: { id, initial, before } };
}

function finishEditing(state: EditorState, draft: string): EditorState {
  if (!state.editing) return state;
  const { id, before } = state.editing;
  let root = rename(state.root, id, draft.trim());
  let selected = state.selected;
  if (isEmptyLeaf(find(root, id)!)) {
    const removal = remove(root, id);
    root = removal.root;
    if (selected === id) selected = removal.next ?? id;
  }
  if (sameMap(root, before.root)) return { ...state, root: before.root, selected, editing: null };
  return { ...state, root, selected, editing: null, past: remember(state.past, before), future: [] };
}

function create(state: EditorState, newId: string, insert: (targetId: string, node: MapNode) => MapNode): EditorState {
  const before = snapshot(state);
  const root = insert(state.selected ?? state.root.id, newNode('', newId));
  if (root === state.root) return state;
  return startEditing({ ...state, root, selected: newId }, null, before);
}

function goToParent(state: EditorState, draft: string): EditorState {
  const id = state.selected;
  const parent = id ? parentOf(state.root, id) : null;
  const settled = finishEditing(state, draft);
  if (!id || !parent) return settled;
  const node = find(settled.root, id);
  const root = node && isEmptyLeaf(node) ? remove(settled.root, id).root : settled.root;
  return commit(settled, root, parent.id);
}

function travel(state: EditorState, entry: Snapshot | undefined, from: 'past' | 'future'): EditorState {
  if (!entry) return state;
  const to = from === 'past' ? 'future' : 'past';
  return {
    ...state,
    root: entry.root,
    selected: entry.selected,
    [from]: state[from].slice(0, -1),
    [to]: [...state[to], snapshot(state)],
  };
}

function runCommand(state: EditorState, command: Command, draft: string, key: string, newId: string): EditorState {
  if (CREATIONS.has(command)) {
    const target = state.selected ?? state.root.id;
    const text = state.editing ? draft : (find(state.root, target)?.text ?? '');
    if (text.trim() === '') return state.editing ? state : startEditing(state, null);
  }
  if (command === 'toParent') return goToParent(state, draft);

  const settled = finishEditing(state, draft);
  const { root, selected } = settled;
  switch (command) {
    case 'child':
      return create(settled, newId, (target, node) => addChild(root, target, node));
    case 'sibling':
      return create(settled, newId, (target, node) =>
        target === root.id ? addChild(root, target, node) : addSibling(root, target, node, 'below'),
      );
    case 'siblingAbove':
      return create(settled, newId, (target, node) => addSibling(root, target, node, 'above'));
    case 'parent':
      return create(settled, newId, (target, node) => addParent(root, target, node));
    case 'toggle':
      return selected ? commit(settled, toggleCollapsed(root, selected), selected) : settled;
    case 'delete': {
      if (!selected) return settled;
      const removal = remove(root, selected);
      return commit(settled, removal.root, removal.next ?? selected);
    }
    case 'left':
    case 'right':
    case 'up':
    case 'down':
      return { ...settled, selected: selected ? (neighbour(root, selected, command) ?? selected) : root.id };
    case 'edit':
      return startEditing(settled, null);
    case 'type':
      return startEditing(settled, key);
    case 'deselect':
      return { ...settled, selected: null };
    case 'undo':
      return travel(settled, settled.past.at(-1), 'past');
    case 'redo':
      return travel(settled, settled.future.at(-1), 'future');
    default:
      return settled;
  }
}
