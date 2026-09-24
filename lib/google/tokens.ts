import { promises as fs } from 'node:fs';
import path from 'node:path';

const TOKEN_FILE = path.join(process.cwd(), '.data', 'tokens.json');

export type StoredTokens = {
  refresh_token: string;
  access_token?: string;
  /** Epoch ms. */
  expires_at?: number;
  scope?: string;
};

export async function readTokens(): Promise<StoredTokens | null> {
  try {
    return JSON.parse(await fs.readFile(TOKEN_FILE, 'utf8')) as StoredTokens;
  } catch {
    return null;
  }
}

export async function writeTokens(tokens: StoredTokens): Promise<void> {
  await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
  await fs.writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export async function clearTokens(): Promise<void> {
  await fs.rm(TOKEN_FILE, { force: true });
}
