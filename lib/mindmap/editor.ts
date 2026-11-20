import type { EditCommand, Mode } from './keymap.ts';
import {
  addChild,
  addParent,
  addSibling,
  find,
  isEmptyLeaf,
  neighbour,
  parentOf,
  remove,
  rename,
  sameMap,
  move,
  toggleCollapsed,
  withinLimits,
  type MapNode,
  type Side,
} from './tree.ts';

export type Snapshot = { root: MapNode; selected: string | null };

export type Editing = { id: string; initial: string | null; before: Snapshot };

export type EditorState = Snapshot & { editing: Editing | null; past: Snapshot[]; future: Snapshot[] };

export type EditorAction = { draft?: string; newId?: string } & (
  | { type: 'command'; command: EditCommand; key?: string }
  | { type: 'select'; id: string | null }
  | { type: 'edit'; id: string }
  | { type: 'blur'; id: string }
  | { type: 'toggle'; id: string }
  | { type: 'replace'; root: MapNode }
  | { type: 'move'; ids: string[]; parentId: string; beforeId: string | null; side: Side }
);

type InsertCommand = 'child' | 'sibling' | 'siblingAbove' | 'parent';
type Insert = (root: MapNode, targetId: string, id: string) => MapNode;

const HISTORY_LIMIT = 200;

const INSERTS: Record<InsertCommand, Insert> = {
  child: addChild,
  sibling: (root, target, id) => (target === root.id ? addChild(root, target, id) : addSibling(root, target, id, 'below')),
  siblingAbove: (root, target, id) => addSibling(root, target, id, 'above'),
  parent: addParent,
};

export function initialState(root: MapNode): EditorState {
  return { root, selected: root.id, editing: null, past: [], future: [] };
}

export function modeOf(state: EditorState): Mode {
  if (state.editing) return 'editing';
  return state.selected ? 'selected' : 'idle';
}

export function reduce(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'command':
      return runCommand(state, action.command, action.draft, action.key ?? '', action.newId);
    case 'select':
      if (action.id !== null && action.id === state.editing?.id) return state;
      return { ...finishEditing(state, action.draft), selected: action.id };
    case 'edit':
      if (action.id === state.editing?.id) return state;
      return startEditing({ ...finishEditing(state, action.draft), selected: action.id }, null);
    case 'blur':
      return action.id === state.editing?.id ? finishEditing(state, action.draft) : state;
    case 'toggle': {
      const settled = finishEditing(state, action.draft);
      return commit(settled, toggleCollapsed(settled.root, action.id), action.id);
    }
    case 'replace':
      return commit(finishEditing(state, action.draft), action.root, action.root.id);
    case 'move': {
      const settled = finishEditing(state, action.draft);
      const root = move(settled.root, action.ids, action.parentId, action.beforeId, action.side);
      return withinLimits(root) ? commit(settled, root, settled.selected) : settled;
    }
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

function targetOf(state: EditorState): string {
  return state.selected ?? state.root.id;
}

function typedText(state: EditorState, draft: string | undefined): string {
  const { id, initial } = state.editing!;
  return (draft ?? initial ?? find(state.root, id)!.text).trim();
}

function startEditing(state: EditorState, initial: string | null, before: Snapshot = snapshot(state)): EditorState {
  const id = targetOf(state);
  return { ...state, selected: id, editing: { id, initial, before } };
}

function finishEditing(state: EditorState, draft: string | undefined): EditorState {
  if (!state.editing) return state;
  const { id, before } = state.editing;
  const text = typedText(state, draft);
  if (text === '' && !find(before.root, id)) return { ...state, ...before, editing: null };
  let root = rename(state.root, id, text);
  let selected: string | null = id;
  if (isEmptyLeaf(find(root, id)!)) {
    const removal = remove(root, id);
    root = removal.root;
    selected = removal.next ?? id;
  }
  if (sameMap(root, before.root)) return { ...state, root: before.root, selected, editing: null };
  return { ...state, root, selected, editing: null, past: remember(state.past, before), future: [] };
}

function runCommand(
  state: EditorState,
  command: EditCommand,
  draft: string | undefined,
  key: string,
  newId: string = crypto.randomUUID(),
): EditorState {
  if (isInsert(command)) {
    const text = state.editing ? typedText(state, draft) : find(state.root, targetOf(state))!.text.trim();
    if (text === '') return state.editing ? state : startEditing(state, null);
    const settled = finishEditing(state, draft);
    const root = INSERTS[command](settled.root, targetOf(settled), newId);
    if (root === settled.root || !withinLimits(root)) return settled;
    return startEditing({ ...settled, root, selected: newId }, null, snapshot(settled));
  }

  const settled = finishEditing(state, draft);
  const { root, selected } = settled;
  switch (command) {
    case 'toParent': {
      const left = state.selected;
      const parent = left ? parentOf(state.root, left) : null;
      if (!left || !parent) return settled;
      const node = find(root, left);
      return commit(settled, node && isEmptyLeaf(node) ? remove(root, left).root : root, parent.id);
    }
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
    case 'stop':
      return settled;
    case 'deselect':
      return { ...settled, selected: null };
    case 'undo': {
      const entry = settled.past.at(-1);
      if (!entry) return settled;
      return { ...settled, ...entry, past: settled.past.slice(0, -1), future: [...settled.future, snapshot(settled)] };
    }
    case 'redo': {
      const entry = settled.future.at(-1);
      if (!entry) return settled;
      return { ...settled, ...entry, future: settled.future.slice(0, -1), past: [...settled.past, snapshot(settled)] };
    }
  }
}

function isInsert(command: EditCommand): command is InsertCommand {
  return command in INSERTS;
}
