import { handle } from '@/lib/api';
import { followedTasks } from '@/lib/mindmap/store';

export const dynamic = 'force-dynamic';

/** Les tâches Google déjà suivies par une carte : les autres sont proposées dans le panneau des tâches libres. */
export async function GET() {
  return handle(async () => ({ taskIds: await followedTasks() }));
}
