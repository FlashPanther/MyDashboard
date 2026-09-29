import { createHash, createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Acces au tableau en ligne. Sans DASHBOARD_PASSWORD (usage local), tout est
 * ouvert, comme avant. Avec, chaque appareil se connecte une fois et garde un
 * cookie signe pour SESSION_DAYS.
 *
 * Le cookie ne contient que sa date d'expiration et une signature HMAC dont la
 * cle derive du mot de passe (scrypt : un cookie vole ne permet pas de tester
 * des mots de passe a la chaine). Changer le mot de passe deconnecte tout le monde.
 */

export const SESSION_COOKIE = 'tableau_session';
export const SESSION_DAYS = 180;

const keys = new Map<string, Buffer>();

/** scrypt coute ~50 ms : calcule une fois par mot de passe. */
function key(password: string) {
  let derived = keys.get(password);
  if (!derived) {
    derived = scryptSync(password, 'tableau-session', 32);
    keys.set(password, derived);
  }
  return derived;
}

function sign(payload: string, password: string) {
  return createHmac('sha256', key(password)).update(payload).digest('base64url');
}

/**
 * Comparaison en temps constant, longueur comprise : on compare des empreintes
 * de taille fixe, pour ne rien laisser deviner a la duree.
 */
export function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Adresse du visiteur derriere le proxy de Coolify (Traefik). X-Real-Ip est
 * pose par Traefik ; a defaut, la derniere entree de X-Forwarded-For est celle
 * qu'il ajoute. La premiere, elle, vient du client et s'invente librement.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  return headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'inconnue';
}

export function createSession(password: string, now = Date.now()): string {
  const expires = String(now + SESSION_DAYS * 86_400_000);
  return `${expires}.${sign(expires, password)}`;
}

export function verifySession(token: string | undefined, password: string, now = Date.now()): boolean {
  if (!token) return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature || !/^\d+$/.test(expires)) return false;
  if (Number(expires) < now) return false;
  return safeEqual(signature, sign(expires, password));
}

/**
 * Les rapports de l'extension (POST /api/whatsapp, /api/messenger). En ligne,
 * un jeton partage : sur internet, l'en-tete Origin s'imite en une ligne. En
 * local, sans jeton configure, l'origine chrome-extension:// suffit.
 * Rend null si la requete passe, sinon la raison du refus.
 */
export function extensionRefusal(
  request: { authorization: string | null; origin: string | null; contentType: string | null },
  env: { token?: string; password?: string },
): string | null {
  // JSON exige : une page web ne peut pas en envoyer ici sans une verification
  // CORS a laquelle on ne repond pas.
  if (request.contentType?.split(';')[0].trim() !== 'application/json') return 'JSON attendu';
  if (env.token) {
    const bearer = request.authorization?.match(/^Bearer (.+)$/)?.[1] ?? '';
    return safeEqual(bearer, env.token) ? null : 'Jeton de l’extension invalide';
  }
  if (env.password) return 'EXTENSION_TOKEN n’est pas configuré sur le serveur';
  return request.origin?.startsWith('chrome-extension://') ? null : 'Réservé à l’extension du tableau';
}
