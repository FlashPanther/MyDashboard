import type { Box } from './layout.ts';

export type View = { x: number; y: number; scale: number };

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function fit(boxes: Iterable<Box>, width: number, height: number, margin = 60): View {
  const all = [...boxes];
  if (all.length === 0) return { x: 0, y: 0, scale: 1 };
  const left = Math.min(...all.map((box) => box.x));
  const top = Math.min(...all.map((box) => box.y));
  const right = Math.max(...all.map((box) => box.x + box.width));
  const bottom = Math.max(...all.map((box) => box.y + box.height));
  const wanted = Math.min(1, (width - 2 * margin) / (right - left), (height - 2 * margin) / (bottom - top));
  const scale = clampScale(wanted);
  return {
    scale,
    x: (width - (left + right) * scale) / 2,
    y: (height - (top + bottom) * scale) / 2,
  };
}

export function zoomAt(view: View, factor: number, x: number, y: number): View {
  const scale = clampScale(view.scale * factor);
  const ratio = scale / view.scale;
  return { scale, x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio };
}
