import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Acces au tableau en ligne. Sans DASHBOARD_PASSWORD (usage local), tout est
 * ouvert, comme avant. Avec, chaque appareil se connecte une fois et garde un
 * cookie signe pour SESSION_DAYS.
 *
 * Le cookie ne contient que sa date d'expiration et une signature HMAC dont la
 * cle derive du mot de passe : changer le mot de passe deconnecte tout le monde.
 */

export const SESSION_COOKIE = 'tableau_session';
export const SESSION_DAYS = 180;

function key(password: string) {
  return createHash('sha256').update(`tableau-session:${password}`).digest();
}

function sign(payload: string, password: string) {
  return createHmac('sha256', key(password)).update(payload).digest('base64url');
}

/** Comparaison en temps constant, pour ne rien laisser deviner a la duree. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
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
