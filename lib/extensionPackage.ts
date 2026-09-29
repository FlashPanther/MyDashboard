import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createZip, type ZipEntry } from './zip.ts';

/** Dossier cree par la decompression : c'est lui qu'on charge dans Chrome. */
const FOLDER = 'tableau-du-jour';
const SOURCE = path.join(process.cwd(), 'extension', 'tableau');
const LOCAL = 'http://localhost:3737';

/**
 * Adresse publique du tableau, tiree de sa configuration et non des en-tetes de
 * la requete (Host, X-Forwarded-*), qu'on ne choisit pas. GOOGLE_REDIRECT_URI
 * pointe forcement vers elle : Google n'accepte que l'adresse enregistree.
 * null en local ou hors HTTPS.
 */
export function publicOrigin(redirectUri: string | undefined): string | null {
  try {
    const url = new URL(redirectUri ?? '');
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Prereglage pour un tableau en ligne : l'extension vise d'emblee cette adresse
 * (adresse par defaut et permission d'acces deja accordee). Le jeton, secret,
 * n'est jamais mis dans l'archive : il se colle dans les options.
 * Sans adresse publique, les fichiers restent tels quels (localhost:3737).
 */
export function presetFor(files: ZipEntry[], origin: string | null): ZipEntry[] {
  if (!origin) return files;
  return files.map((file) => {
    const text = file.data.toString('utf8');
    if (file.name.endsWith('/manifest.json')) {
      const manifest = JSON.parse(text);
      manifest.host_permissions = [...manifest.host_permissions, `${origin}/*`];
      return { ...file, data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) };
    }
    if (file.name.endsWith('/settings.js')) {
      const preset = text.replace(
        `const DEFAULT_DASHBOARD = '${LOCAL}';`,
        `const DEFAULT_DASHBOARD = ${JSON.stringify(origin)};`,
      );
      return { ...file, data: Buffer.from(preset) };
    }
    return file;
  });
}

/** L'extension en .zip, et le nom de fichier qui porte sa version. */
export async function packageExtension(origin: string | null) {
  // Les fichiers du dossier, sans sous-dossier ni fichier cache (.DS_Store…).
  const names = (await readdir(SOURCE, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
  const files = await Promise.all(
    names.map(async (name) => ({ name: `${FOLDER}/${name}`, data: await readFile(path.join(SOURCE, name)) })),
  );
  const { version } = JSON.parse(await readFile(path.join(SOURCE, 'manifest.json'), 'utf8'));
  return { zip: createZip(presetFor(files, origin)), fileName: `${FOLDER}-${version}.zip` };
}
