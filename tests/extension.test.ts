import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { extensionFiles, presetFor, publicOrigin } from '../lib/extensionPackage.ts';
import { createZip } from '../lib/zip.ts';

/** Relit une archive par son repertoire central : nom et contenu de chaque fichier. */
function readZip(zip: Buffer) {
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    assert.equal(zip.readUInt32LE(at), 0x02014b50);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    const data = local + 30 + zip.readUInt16LE(local + 26);
    files[name] = inflateRawSync(zip.subarray(data, data + size)).toString('utf8');
    at += 46 + nameLength;
  }
  return files;
}

test('l’archive rend chaque fichier intact', () => {
  const zip = createZip([
    { name: 'dossier/a.txt', data: Buffer.from('bonjour') },
    { name: 'dossier/é.js', data: Buffer.from('x'.repeat(1000)) },
  ]);
  assert.deepEqual(readZip(zip), { 'dossier/a.txt': 'bonjour', 'dossier/é.js': 'x'.repeat(1000) });
});

test('prérègle l’extension sur l’adresse publique du tableau', async () => {
  const files = presetFor(await extensionFiles(), 'https://tableau.exemple.be');
  const read = (name: string) => files.find((file) => file.name.endsWith(name))!.data.toString();
  assert.ok(JSON.parse(read('/manifest.json')).host_permissions.includes('https://tableau.exemple.be/*'));
  assert.equal(read('/preset.js'), 'self.PRESET_DASHBOARD = "https://tableau.exemple.be";\n');
});

test('l’extension d’origine lit son adresse dans preset.js', async () => {
  const files = await extensionFiles();
  const read = (name: string) => files.find((file) => file.name.endsWith(name))!.data.toString();
  assert.match(read('/preset.js'), /self\.PRESET_DASHBOARD = null;/);
  assert.match(read('/settings.js'), /self\.PRESET_DASHBOARD \?\?/);
});

test('laisse l’extension telle quelle sans adresse publique', async () => {
  const files = await extensionFiles();
  assert.equal(presetFor(files, null), files);
});

test('tire l’adresse publique de la configuration, en HTTPS seulement', () => {
  assert.equal(publicOrigin('https://tableau.exemple.be/api/auth/google/callback'), 'https://tableau.exemple.be');
  assert.equal(publicOrigin('http://localhost:3737/api/auth/google/callback'), null);
  assert.equal(publicOrigin('pas une adresse'), null);
});

test('écrit l’adresse comme une chaîne JavaScript, jamais comme du code', async () => {
  const files = presetFor(await extensionFiles(), "https://a.be/'; alert(1); '");
  const preset = files.find((file) => file.name.endsWith('/preset.js'))!.data.toString();
  assert.equal(preset, 'self.PRESET_DASHBOARD = "https://a.be/\'; alert(1); \'";\n');
});
