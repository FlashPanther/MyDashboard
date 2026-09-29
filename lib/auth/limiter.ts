/**
 * Freine les essais de mot de passe : au-dela de MAX_FAILURES echecs dans la
 * fenetre, une adresse doit attendre ; au-dela de MAX_GLOBAL_FAILURES echecs,
 * toutes adresses confondues, la connexion se ferme pour tout le monde le temps
 * de la fenetre (les appareils deja connectes gardent leur session). En memoire :
 * un redemarrage remet a zero, ce qui suffit pour un tableau personnel.
 */

export const MAX_FAILURES = 5;
export const MAX_GLOBAL_FAILURES = 30;
export const WINDOW_MS = 15 * 60_000;
/** Au-dela, on purge les adresses dont tous les echecs sont perimes. */
const MAX_TRACKED = 1000;

const failures = new Map<string, number[]>();
let everyone: number[] = [];

function fresh(list: number[], now: number) {
  return list.filter((at) => now - at < WINDOW_MS);
}

export function isBlocked(ip: string, now = Date.now()): boolean {
  everyone = fresh(everyone, now);
  return everyone.length >= MAX_GLOBAL_FAILURES || fresh(failures.get(ip) ?? [], now).length >= MAX_FAILURES;
}

export function recordFailure(ip: string, now = Date.now()) {
  everyone.push(now);
  failures.set(ip, [...fresh(failures.get(ip) ?? [], now), now]);
  if (failures.size > MAX_TRACKED) {
    for (const [address, list] of failures) {
      if (fresh(list, now).length === 0) failures.delete(address);
    }
  }
}

export function clearFailures(ip: string) {
  failures.delete(ip);
}

/** Pour les tests. */
export function resetLimiter() {
  failures.clear();
  everyone = [];
}
