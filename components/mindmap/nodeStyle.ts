import type { CSSProperties } from 'react';
import type { Box } from '@/lib/mindmap/layout';
import type { Side } from '@/lib/mindmap/tree';

const BRANCH_COLOURS = ['#e4572e', '#2e86ab', '#3b9a5b', '#a23b72', '#d99a1c', '#5b5fc7', '#1f9e9a', '#c2527a'];
export const LINK = { fill: 'none', strokeWidth: 2, strokeLinecap: 'round' } as const;

export function branchColour(index: number): string {
  return BRANCH_COLOURS[index % BRANCH_COLOURS.length];
}

export function nodeStyle(box: Box, colour: number): CSSProperties {
  return { left: box.x, top: box.y, '--branch': branchColour(colour) } as CSSProperties;
}

export function nodeClass(depth: number, side: Side, selected: boolean, editing: boolean): string {
  const state = [
    'absolute w-max min-w-11 max-w-[300px] whitespace-pre-wrap break-words bg-panel text-ink outline-none',
    editing ? 'cursor-text select-text' : 'cursor-pointer select-none',
    selected ? 'ring-2 ring-sky' : '',
  ].join(' ');
  if (depth === 0) {
    return `${state} min-h-[46px] rounded-full border-2 border-ink px-5 py-2.5 font-display text-[17px] font-bold`;
  }
  const accent =
    side === 'left' ? 'border-r-4 border-r-[color:var(--branch)]' : 'border-l-4 border-l-[color:var(--branch)]';
  return `${state} min-h-[36px] rounded-md border border-rule px-3 py-[7px] text-[15px] leading-5 ${accent}`;
}
