import { TaskMark } from '@/components/mindmap/TaskBox';
import type { Drag } from '@/components/mindmap/types';
import { branchColour, LINK, nodeClass, nodeStyle } from '@/components/mindmap/nodeStyle';
import { carried, linkPath, type Box } from '@/lib/mindmap/layout';
import type { VisibleNode } from '@/lib/mindmap/tree';

export function Ghost({
  visible,
  boxes,
  lifted,
  drag,
}: {
  visible: VisibleNode[];
  boxes: Map<string, Box>;
  lifted: ReadonlySet<string>;
  drag: Drag;
}) {
  const branch = visible.filter(({ node }) => lifted.has(node.id));
  const origin = branch.find(({ node }) => node.id === drag.anchorId)!.side;
  const side = drag.drop?.side ?? origin;
  const moved = carried(boxes, lifted, drag.anchorId, drag.dx, drag.dy, side !== origin);
  const target = drag.drop && boxes.get(drag.drop.parentId)!;
  return (
    <div className="pointer-events-none absolute left-0 top-0">
      <svg aria-hidden="true" className="absolute left-0 top-0 h-px w-px overflow-visible">
        {branch.map(({ node, parentId, colour }) => {
          const box = moved.get(node.id)!;
          const parent = moved.get(parentId!);
          if (parent) return <path key={node.id} d={linkPath(parent, box)} {...LINK} stroke={branchColour(colour)} />;
          if (!target) return null;
          return <path key={node.id} d={linkPath(target, box)} {...LINK} stroke="var(--color-sky)" strokeDasharray="7 6" />;
        })}
      </svg>
      {branch.map(({ node, depth, colour }) => (
        <div
          key={node.id}
          className={`${nodeClass(depth, side, drag.ids.includes(node.id), false, node.task)} shadow-lg`}
          style={nodeStyle(moved.get(node.id)!, colour)}
        >
          {node.text}
        </div>
      ))}
      {branch.map(({ node }) => (node.task ? <TaskMark key={node.id} done={node.task.done} box={moved.get(node.id)!} /> : null))}
    </div>
  );
}
