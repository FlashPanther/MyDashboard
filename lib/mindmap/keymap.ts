export type ZoomCommand = 'zoomIn' | 'zoomOut' | 'zoomReset' | 'zoomFit';

export type EditCommand =
  | 'child'
  | 'sibling'
  | 'siblingAbove'
  | 'parent'
  | 'toParent'
  | 'toggle'
  | 'delete'
  | 'task'
  | 'tick'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'edit'
  | 'stop'
  | 'deselect'
  | 'undo'
  | 'redo';

export type Command = EditCommand | ZoomCommand;

export function isZoom(command: Command): command is ZoomCommand {
  return command.startsWith('zoom');
}

export type Mode = 'idle' | 'selected' | 'multiple' | 'editing';

export type KeyPress = {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

const SINGLE_KEYS: Record<string, Command> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  '=': 'zoomIn',
  '+': 'zoomIn',
  '-': 'zoomOut',
  '0': 'zoomReset',
  '1': 'zoomFit',
};

// `code` et non `key` : sur Mac, Alt+T donne « † ».
const ALT_KEYS: Record<string, Command> = { KeyT: 'task', KeyC: 'tick' };

export function commandFor(press: KeyPress, mode: Mode): Command | null {
  const mod = press.ctrlKey || press.metaKey;
  const structural = structuralCommand(press, mod);

  if (mode === 'editing') return press.key === 'Escape' ? 'stop' : structural;
  if (mode === 'multiple' && structural) return null;
  if (structural === 'sibling' && mode === 'selected') return 'edit';
  if (structural) return mode === 'idle' && structural !== 'child' ? null : structural;

  if (mod) {
    const key = press.key.toLowerCase();
    if (key === 'z') return press.shiftKey ? 'redo' : 'undo';
    if (key === 'y') return 'redo';
    return null;
  }
  if (press.altKey) return mode === 'idle' || press.shiftKey ? null : (ALT_KEYS[press.code] ?? null);
  if (press.key in SINGLE_KEYS) return SINGLE_KEYS[press.key];
  if (mode === 'idle') return null;

  if (press.key === 'Delete' || press.key === 'Backspace') return 'delete';
  if (press.key === 'Escape') return 'deselect';
  if (mode === 'multiple') return null;
  if (press.key === 'F2') return 'edit';
  return !press.shiftKey && press.key.toLowerCase() === 'f' ? 'toggle' : null;
}

export function swallowed(press: KeyPress, mode: Mode): boolean {
  return mode === 'multiple' && structuralCommand(press, press.ctrlKey || press.metaKey) !== null;
}

function structuralCommand(press: KeyPress, mod: boolean): Command | null {
  if (press.key === 'Tab') {
    if (mod || press.altKey) return null;
    return press.shiftKey ? 'toParent' : 'child';
  }
  if (press.key === 'Enter') {
    if (press.shiftKey) return null;
    if (mod) return 'siblingAbove';
    return press.altKey ? 'parent' : 'sibling';
  }
  // `key` dépend de la disposition du clavier, `code` non : en AZERTY, la touche du « / » américain donne « ! ».
  if (mod && (press.key === '/' || press.code === 'Slash')) return 'toggle';
  return null;
}
