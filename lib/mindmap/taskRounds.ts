import { listMaps, type Options } from './store.ts';
import { syncTasks, type Google } from './taskSync.ts';

/**
 * Une passe pour chaque carte qui envoie ses tâches : ce qui n'a pas pu partir part. Google n'est pas relu (sauf pour
 * créer) : ce qu'il a changé sera lu à l'ouverture de la carte, sans dépenser de requêtes pour des cartes fermées.
 */
export async function syncAllMaps(listTitle: string, google: Google, options: Options = {}): Promise<string[]> {
  const failures: string[] = [];
  for (const { id, sendTasks } of await listMaps(options)) {
    if (!sendTasks) continue;
    await syncTasks(id, listTitle, google, { ...options, read: false }).catch((error) => {
      failures.push(`${id} : ${(error as Error).message}`);
    });
  }
  return failures;
}
