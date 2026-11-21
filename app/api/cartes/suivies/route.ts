import { handle } from '@/lib/api';
import { tasksFollowedElsewhere } from '@/lib/mindmap/store';

export const dynamic = 'force-dynamic';

/** Les tâches Google déjà suivies par une carte : les autres sont proposées dans le panneau des tâches libres. */
export async function GET() {
  return handle(async () => {
    const followed = await tasksFollowedElsewhere(null);
    if (!followed) throw new Error('Une carte est illisible : impossible de savoir quelles tâches sont libres');
    return { taskIds: [...followed] };
  });
}
