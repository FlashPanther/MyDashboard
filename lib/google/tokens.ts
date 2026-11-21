import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const TOKEN_FILE = path.join(process.cwd(), '.data', 'tokens.json');

export type StoredTokens = {
  refresh_token: string;
  access_token?: string;
  /** Epoch ms. */
  expires_at?: number;
  scope?: string;
  /** Epoch ms du refus de Google (invalid_grant) : la liaison est a refaire. */
  refused_at?: number;
};

export async function readTokens(): Promise<StoredTokens | null> {
  try {
    return JSON.parse(await fs.readFile(TOKEN_FILE, 'utf8')) as StoredTokens;
  } catch {
    return null;
  }
}

let queue: Promise<unknown> = Promise.resolve();

function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const turn = queue.then(work);
  queue = turn.catch(() => undefined);
  return turn;
}

async function persist(tokens: StoredTokens): Promise<void> {
  await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
  // Plusieurs routes lisent ce fichier pendant qu'une autre le renouvelle : jamais de fichier a moitie ecrit.
  const draft = `${TOKEN_FILE}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(draft, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    await fs.rename(draft, TOKEN_FILE);
  } catch (error) {
    await fs.rm(draft, { force: true });
    throw error;
  }
}

export function writeTokens(tokens: StoredTokens): Promise<void> {
  return inTurn(() => persist(tokens));
}

/**
 * Modifie le jeton enregistre a partir de son etat du moment, une modification a la fois :
 * `change` rend le nouvel etat, ou null pour ne rien ecrire (le jeton a change entre-temps).
 */
export function updateTokens(change: (current: StoredTokens | null) => StoredTokens | null): Promise<void> {
  return inTurn(async () => {
    const next = change(await readTokens());
    if (next) await persist(next);
  });
}

export async function clearTokens(): Promise<void> {
  await fs.rm(TOKEN_FILE, { force: true });
}
