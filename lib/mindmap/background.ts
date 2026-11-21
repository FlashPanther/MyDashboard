import { config } from '@/dashboard.config';
import { googleFetch } from '@/lib/google/oauth';
import { syncTasks } from './taskSync';
import { syncAllMaps } from './taskRounds';

const ROUND_MS = 5 * 60_000;
const FIRST_ROUND_MS = 30_000;

declare global {
  // Le serveur de développement recharge les modules : un seul tour à la fois quand même.
  var carteTasksRounds: ReturnType<typeof setInterval> | undefined;
}

/** Envoie les tâches d'une carte juste après son enregistrement, sans attendre l'éditeur. */
export function syncSoon(id: string): Promise<void> {
  return syncTasks(id, config.mindmap.taskList, googleFetch).then(
    () => undefined,
    () => undefined,
  );
}

/** Toutes les cinq minutes, une passe pour chaque carte, ouverte ou non. */
export function startTaskRounds(): void {
  if (globalThis.carteTasksRounds) return;
  const round = () => void syncAllMaps(config.mindmap.taskList, googleFetch).catch(() => undefined);
  setTimeout(round, FIRST_ROUND_MS);
  globalThis.carteTasksRounds = setInterval(round, ROUND_MS);
}
