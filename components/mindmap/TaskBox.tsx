import { keepFocus } from '@/components/mindmap/keepFocus';
import { FADED, taskBoxClass, taskBoxStyle } from '@/components/mindmap/nodeStyle';
import type { Send } from '@/components/mindmap/types';
import type { Box } from '@/lib/mindmap/layout';
import type { MapNode } from '@/lib/mindmap/tree';

export function TaskMark({ done, box }: { done: boolean; box: Box }) {
  return (
    <span className={taskBoxClass(done)} style={taskBoxStyle(box)}>
      {done ? '✓' : null}
    </span>
  );
}

export function TaskBox({ node, done, box, faded, send }: { node: MapNode; done: boolean; box: Box; faded: boolean; send: Send }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={node.text}
      title={done ? 'Remettre à faire' : 'Cocher'}
      data-id={node.id}
      className={`${taskBoxClass(done)} hover:border-ink${faded ? FADED : ''}`}
      style={taskBoxStyle(box)}
      onMouseDown={keepFocus}
      onClick={() => send({ type: 'tick', ids: [node.id] })}
    >
      {done ? '✓' : null}
    </button>
  );
}
