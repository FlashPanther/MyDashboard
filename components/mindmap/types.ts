import type { EditorAction } from '@/lib/mindmap/editor';
import type { Carried, Drop } from '@/lib/mindmap/drop';
import type { ZoomCommand } from '@/lib/mindmap/keymap';

export type Send = (action: EditorAction) => void;
export type Observe = (element: HTMLElement | null) => (() => void) | undefined;
export type CanvasHandle = { zoom: (command: ZoomCommand) => void };
export type Drag = Carried & { lifted: ReadonlySet<string>; dx: number; dy: number; drop: Drop | null };
