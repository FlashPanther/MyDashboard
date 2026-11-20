import type { Send } from '@/components/mindmap/types';
import type { Box } from '@/lib/mindmap/layout';
import type { MapNode } from '@/lib/mindmap/tree';

export function TaskBox({ node, box, faded = false, send }: { node: MapNode; box: Box; faded?: boolean; send?: Send }) {
  const done = node.task === 'done';
  const shared = {
    className: `absolute flex h-4 w-4 items-center justify-center rounded-[4px] border-2 text-[11px] leading-none ${
      done ? 'border-muted bg-muted text-panel' : 'border-muted bg-panel hover:border-ink'
    }${faded ? ' opacity-30' : ''}`,
    style: { left: box.x + 11, top: box.y + 10 },
    children: done ? '✓' : null,
  };
  if (!send) return <span {...shared} />;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={node.text}
      title={done ? 'Remettre à faire' : 'Cocher'}
      data-id={node.id}
      {...shared}
      // Sans cela, l'appui prend le focus et la saisie en cours se ferme avant le clic.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => send({ type: 'tick', id: node.id })}
    />
  );
}
