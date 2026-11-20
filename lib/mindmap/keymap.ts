export type Command =
  | 'child'
  | 'sibling'
  | 'siblingAbove'
  | 'parent'
  | 'toParent'
  | 'toggle'
  | 'delete'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'edit'
  | 'type'
  | 'stop'
  | 'deselect'
  | 'undo'
  | 'redo'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'zoomFit';

export type Mode = 'idle' | 'selected' | 'editing';

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

export function commandFor(press: KeyPress, mode: Mode): Command | null {
  const mod = press.ctrlKey || press.metaKey;
  const structural = structuralCommand(press, mod);

  if (mode === 'editing') return press.key === 'Escape' ? 'stop' : structural;
  if (structural === 'sibling' && mode === 'selected') return 'edit';
  if (structural) return mode === 'idle' && structural !== 'child' ? null : structural;

  const printable = press.key !== ' ' && [...press.key].length === 1;
  // Sous Windows, AltGr arrive comme Ctrl+Alt.
  if (mode === 'selected' && printable && press.ctrlKey && press.altKey) return 'type';

  if (mod) {
    const key = press.key.toLowerCase();
    if (key === 'z') return press.shiftKey ? 'redo' : 'undo';
    if (key === 'y') return 'redo';
    return null;
  }
  if (press.altKey) return null;
  if (press.key in SINGLE_KEYS) return SINGLE_KEYS[press.key];
  if (mode === 'idle') return null;

  if (press.key === 'Delete' || press.key === 'Backspace') return 'delete';
  if (press.key === 'F2') return 'edit';
  if (press.key === 'Escape') return 'deselect';
  return printable ? 'type' : null;
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
  // Hors QWERTY, Whimsical attend la touche située à l'emplacement du « / » américain.
  if (mod && (press.key === '/' || press.code === 'Slash')) return 'toggle';
  return null;
}
