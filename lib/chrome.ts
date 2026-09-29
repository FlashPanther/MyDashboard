import { existsSync } from 'node:fs';

/**
 * Le Chrome telecharge par Puppeteer n'a pas de bac a sable utilisable sous
 * Ubuntu 24.04 (AppArmor bloque les espaces de noms). Le Chrome du systeme, lui,
 * a son chrome-sandbox setuid : on le prefere, sans jamais passer --no-sandbox.
 */
export function chromePath(): string | undefined {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome'];
  return candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
}
