import type { EditCommand, Mode } from './keymap.ts';
import {
  addChild,
  addParent,
  addSibling,
  applyRemote,
  find,
  foldBranch,
  isEmptyLeaf,
  neighbour,
  parentOf,
  remove,
  rename,
  shownAncestor,
  sameMap,
  move,
  removeAll,
  toggleCollapsed,
  toggleDone,
  toggleTask,
  visibleNodes,
  withinLimits,
  withoutFinished,
  type MapNode,
  type RemoteChange,
  type Side,
} from './tree.ts';

export type Snapshot = { root: MapNode; selected: string | null };

export type Editing = { id: string; initial: string | null; before: Snapshot };

export type EditorState = Snapshot & {
  group: string[];
  editing: Editing | null;
  past: Snapshot[];
  future: Snapshot[];
  hideDone: boolean;
};

export type EditorAction = { draft?: string; newId?: string } & (
  | { type: 'command'; command: EditCommand; key?: string }
  | { type: 'select'; id: string | null }
  | { type: 'edit'; id: string }
  | { type: 'blur'; id: string }
  | { type: 'toggle'; id: string }
  | { type: 'task' | 'tick'; ids: string[] }
  | { type: 'replace'; root: MapNode }
  | { type: 'move'; ids: string[]; parentId: string; beforeId: string | null; side: Side }
  | { type: 'mark'; ids: string[] }
  | { type: 'foldBranch'; id: string; collapsed: boolean }
  | { type: 'hideDone'; hide: boolean }
  | { type: 'remote'; changes: RemoteChange[] }
  | { type: 'adopt'; parentId: string; id: string; text: string; from: { taskId: string; listId: string }; beforeId?: string | null; side?: Side }
  | { type: 'remove'; ids: string[] }
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

export function initialState(root: MapNode, hideDone = false): EditorState {
  return { root, selected: root.id, group: [], editing: null, past: [], future: [], hideDone };
}

export function shownRoot(state: Pick<EditorState, 'root' | 'hideDone'>): MapNode {
  return state.hideDone ? withoutFinished(state.root) : state.root;
}

export function modeOf(state: EditorState): Mode {
  if (state.editing) return 'editing';
  if (state.group.length) return 'multiple';
  return state.selected ? 'selected' : 'idle';
}

export function reduce(state: EditorState, action: EditorAction): EditorState {
  const next = onShown(step(state, action));
  const keepsGroup =
    action.type === 'mark' ||
    action.type === 'move' ||
    action.type === 'remote' ||
    (action.type === 'command' && (action.command === 'task' || action.command === 'tick'));
  if (keepsGroup || next.group.length === 0) return next;
  return { ...next, group: [] };
}

function onShown(state: EditorState): EditorState {
  if (!state.hideDone || state.editing) return state;
  const shown = shownRoot(state);
  if (shown === state.root) return state;
  const selected = state.selected && find(state.root, state.selected) ? shownAncestor(state.root, shown, state.selected) : state.selected;
  const group = state.group.filter((id) => find(shown, id));
  if (selected === state.selected && group.length === state.group.length) return state;
  return { ...state, selected, group: group.length > 1 ? group : [] };
}

function step(state: EditorState, action: EditorAction): EditorState {
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
      return fold(finishEditing(state, action.draft), action.id, (root) => toggleCollapsed(root, action.id));
    }
    case 'task':
    case 'tick': {
      const settled = finishEditing(state, action.draft);
      const ids = action.ids.filter((id) => find(settled.root, id));
      return markTasks(settled, action.type, ids, ids[0] ?? settled.selected);
    }
    case 'replace':
      return commit(finishEditing(state, action.draft), action.root, action.root.id);
    case 'move': {
      const settled = finishEditing(state, action.draft);
      const shown = shownRoot(settled);
      if (move(shown, action.ids, action.parentId, action.beforeId, action.side) === shown) return settled;
      const root = move(settled.root, action.ids, action.parentId, action.beforeId, action.side);
      return withinLimits(root) ? commit(settled, root, settled.selected) : settled;
    }
    case 'remote': {
      // Le nœud en cours de saisie n'est pas touché : son changement reviendra au prochain passage.
      const changes = action.changes.filter(({ id }) => id !== state.editing?.id);
      return commit(state, applyRemote(state.root, changes), state.selected);
    }
    case 'adopt': {
      const settled = finishEditing(state, action.draft);
      if (holds(settled.root, action.from.taskId)) return settled;
      const added = addChild(settled.root, action.parentId, action.id, { text: action.text, task: { done: false }, from: action.from });
      const root = action.side && added !== settled.root ? move(added, [action.id], action.parentId, action.beforeId ?? null, action.side) : added;
      return withinLimits(root) ? commit(settled, root, action.id) : settled;
    }
    case 'remove': {
      const settled = finishEditing(state, action.draft);
      const ids = action.ids.filter((id) => id !== settled.root.id && find(settled.root, id));
      if (ids.length === 0) return settled;
      const removal = removeShown(settled.root, settled.hideDone, ids);
      return commit({ ...settled, group: [] }, removal.root, removal.next);
    }
    case 'hideDone':
      return { ...finishEditing(state, action.draft), hideDone: action.hide };
    case 'foldBranch': {
      return fold(finishEditing(state, action.draft), action.id, (root) => foldBranch(root, action.id, action.collapsed));
    }
    case 'mark': {
      const settled = finishEditing(state, action.draft);
      const marked = new Set(action.ids);
      const ids = visibleNodes(shownRoot(settled)).map(({ node }) => node.id).filter((id) => marked.has(id));
      return { ...settled, selected: ids[0] ?? null, group: ids.length > 1 ? ids : [] };
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

function markTasks(state: EditorState, kind: 'task' | 'tick', ids: string[], selected: string | null): EditorState {
  return commit(state, (kind === 'task' ? toggleTask : toggleDone)(state.root, ids), selected);
}

function fold(state: EditorState, id: string, alter: (root: MapNode) => MapNode): EditorState {
  const foldable = find(shownRoot(state), id)?.children.length;
  return commit(state, foldable ? alter(state.root) : state.root, id);
}

function removeShown(root: MapNode, hideDone: boolean, ids: string[]): { root: MapNode; next: string | null } {
  const drop = (tree: MapNode) => (ids.length > 1 ? removeAll(tree, new Set(ids)) : remove(tree, ids[0]));
  const whole = drop(root);
  const shown = shownRoot({ root, hideDone });
  return shown === root ? whole : { root: whole.root, next: drop(shown).next };
}

function holds(node: MapNode, taskId: string): boolean {
  return node.from?.taskId === taskId || node.children.some((child) => holds(child, taskId));
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
    const removal = removeShown(root, state.hideDone, [id]);
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
      return selected ? fold(settled, selected, (tree) => toggleCollapsed(tree, selected)) : settled;
    case 'delete': {
      if (!selected) return settled;
      const removal = removeShown(root, settled.hideDone, settled.group.length ? settled.group : [selected]);
      return commit(settled, removal.root, removal.next ?? selected);
    }
    case 'task':
    case 'tick': {
      if (!selected) return settled;
      return markTasks(settled, command, settled.group.length ? settled.group : [selected], selected);
    }
    case 'left':
    case 'right':
    case 'up':
    case 'down':
      return { ...settled, selected: selected ? (neighbour(shownRoot(settled), selected, command) ?? selected) : root.id };
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
