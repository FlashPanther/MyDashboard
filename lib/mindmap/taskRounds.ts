import { listMaps, readMap, type Options } from './store.ts';
import { syncTasks, type Google } from './taskSync.ts';

export type Round = { maps: number; failed: number };

/** Une passe pour chaque carte qui envoie ses tâches : ce qui a changé dans une carte part, ce qui a changé chez Google attend sa réouverture. */
export async function syncAllMaps(listTitle: string, google: Google, options: Options = {}): Promise<Round> {
  let maps = 0;
  let failed = 0;
  for (const { id } of await listMaps(options)) {
    const map = await readMap(id, options).catch(() => null);
    if (!map?.sendTasks) continue;
    maps += 1;
    await syncTasks(id, listTitle, google, options).catch(() => {
      failed += 1;
    });
  }
  return { maps, failed };
}
