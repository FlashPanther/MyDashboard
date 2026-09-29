/**
 * Freine les essais de mot de passe : au-dela de MAX_FAILURES echecs dans la
 * fenetre, une adresse doit attendre. En memoire : un redemarrage remet a zero,
 * ce qui suffit pour un tableau personnel.
 */

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60_000;

const failures = new Map<string, number[]>();

function recent(ip: string, now: number) {
  const list = (failures.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  failures.set(ip, list);
  return list;
}

export function isBlocked(ip: string, now = Date.now()): boolean {
  return recent(ip, now).length >= MAX_FAILURES;
}

export function recordFailure(ip: string, now = Date.now()) {
  recent(ip, now).push(now);
}

export function clearFailures(ip: string) {
  failures.delete(ip);
}
