import { readTokens, writeTokens, type StoredTokens } from './tokens';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  // Ecriture : le champ « Nouvelle tâche » du panneau Tâches en cree.
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
];

/** Le jeton existe mais n'a pas ete accorde pour cette API : il faut relier a nouveau. */
export class ScopeMissingError extends Error {
  constructor(message = 'Autorisation manquante pour cette API') {
    super(message);
    this.name = 'ScopeMissingError';
  }
}

/** L'API n'est pas activee dans le projet Google Cloud. */
export class ApiDisabledError extends Error {
  constructor(
    message = 'API non activée dans le projet Google Cloud',
    /** Nom du service refuse, ex. "analyticsadmin.googleapis.com". */
    readonly service: string | null = null,
    /** Page d'activation exacte, renvoyee par Google. */
    readonly activationUrl: string | null = null,
  ) {
    super(message);
    this.name = 'ApiDisabledError';
  }
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Levee quand aucun compte Google n'est encore relie. */
export class NotConnectedError extends Error {
  constructor(message = 'Compte Google non relié') {
    super(message);
    this.name = 'NotConnectedError';
  }
}

function credentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3737/api/auth/google/callback';
  if (!clientId || !clientSecret) {
    throw new NotConnectedError('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants dans .env.local');
  }
  return { clientId, clientSecret, redirectUri };
}

/** Cookie du jeton anti-rejeu `state`, pose par /api/auth/google et relu au retour. */
export const STATE_COOKIE = 'tableau_oauth_state';

/** `state` : valeur aleatoire rendue par Google au retour, voir app/api/auth/google. */
export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = credentials();
  const params = new URLSearchParams({
    state,
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string): Promise<StoredTokens> {
  const { clientId, clientSecret, redirectUri } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Échange du code refusé : ${json.error_description ?? res.status}`);
  if (!json.refresh_token) {
    throw new Error(
      "Google n'a pas renvoyé de refresh_token. Retire l'accès de l'app dans ton compte Google puis relance la connexion.",
    );
  }
  const tokens: StoredTokens = {
    refresh_token: json.refresh_token,
    access_token: json.access_token,
    expires_at: Date.now() + json.expires_in * 1000,
    scope: json.scope,
  };
  await writeTokens(tokens);
  return tokens;
}

/** Renvoie un access_token valide, en le renouvelant si besoin. */
export async function getAccessToken(): Promise<string> {
  const stored = await readTokens();
  if (!stored?.refresh_token) throw new NotConnectedError();

  if (stored.access_token && stored.expires_at && stored.expires_at - Date.now() > 60_000) {
    return stored.access_token;
  }

  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: stored.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    if (json.error === 'invalid_grant') throw new NotConnectedError('Autorisation Google expirée');
    throw new Error(`Renouvellement du jeton refusé : ${json.error_description ?? res.status}`);
  }

  await writeTokens({
    ...stored,
    access_token: json.access_token,
    expires_at: Date.now() + json.expires_in * 1000,
  });
  return json.access_token as string;
}

/** fetch() vers une API Google, avec le jeton et la gestion d'erreur en place. */
export async function googleFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` },
  });

  if (res.status === 401 || res.status === 403) {
    // Google distingue trois refus qui appellent trois gestes differents.
    const body = await res.json().catch(() => ({}));
    const reason: string = body?.error?.details?.[0]?.reason ?? body?.error?.status ?? '';
    if (reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT') {
      throw new ScopeMissingError();
    }
    if (reason === 'SERVICE_DISABLED' || /has not been used|is disabled/i.test(body?.error?.message ?? '')) {
      const meta = body?.error?.details?.[0]?.metadata ?? {};
      throw new ApiDisabledError(body?.error?.message, meta.service ?? null, meta.activationUrl ?? null);
    }
    throw new NotConnectedError("Accès refusé par Google : vérifie les autorisations demandées");
  }
  if (!res.ok) throw new Error(`${new URL(url).pathname} a répondu ${res.status}`);
  return (await res.json()) as T;
}
