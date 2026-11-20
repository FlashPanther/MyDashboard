import type { EditorAction } from '@/lib/mindmap/editor';
import type { Carried, Drop } from '@/lib/mindmap/drop';

export type Send = (action: EditorAction) => void;
export type Drag = Carried & { lifted: ReadonlySet<string>; dx: number; dy: number; drop: Drop | null };
