import { config } from '@/dashboard.config';
import { googleFetch } from '@/lib/google/oauth';
import { syncTasks } from './taskSync';
import { syncAllMaps } from './taskRounds';

const ROUND_MS = 5 * 60_000;
const globalState = globalThis as typeof globalThis & { __carteTasksRounds?: ReturnType<typeof setInterval> };

/** La synchronisation d'une carte avec la liste et le client Google du tableau. */
export function syncMapTasks(id: string, options: { read?: boolean } = {}) {
  return syncTasks(id, config.mindmap.taskList, googleFetch, options);
}

/** Envoie les tâches d'une carte juste après son enregistrement, sans attendre l'éditeur. */
export function syncSoon(id: string) {
  return syncMapTasks(id, { read: false }).catch((error) => console.error(`Carte ${id} : envoi vers Google en échec :`, (error as Error).message));
}

/** Toutes les cinq minutes, ce qui n'a pas pu partir vers Google repart. Seulement en production : une copie locale des cartes n'écrit pas dans le vrai compte. */
export function startTaskRounds(): void {
  if (process.env.NODE_ENV !== 'production' || globalState.__carteTasksRounds) return;
  let failing = false;
  const round = async () => {
    const failures = await syncAllMaps(config.mindmap.taskList, googleFetch).catch((error) => [(error as Error).message]);
    // Une ligne au journal quand l'envoi tombe en panne et une quand il repart, pas une toutes les cinq minutes.
    if (failures.length > 0 && !failing) console.error('Cartes : envoi vers Google en échec :', failures.join(' ; '));
    if (failures.length === 0 && failing) console.info('Cartes : envoi vers Google rétabli');
    failing = failures.length > 0;
  };
  globalState.__carteTasksRounds = setInterval(() => void round(), ROUND_MS);
}
