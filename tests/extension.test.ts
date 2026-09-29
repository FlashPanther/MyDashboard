import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { presetFor, publicOrigin } from '../lib/extensionPackage.ts';
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

const files = [
  {
    name: 'tableau-du-jour/manifest.json',
    data: Buffer.from(JSON.stringify({ host_permissions: ['http://localhost:3737/*'] })),
  },
  { name: 'tableau-du-jour/settings.js', data: Buffer.from("const DEFAULT_DASHBOARD = 'http://localhost:3737';\n") },
];

test('prérègle l’extension sur le domaine d’où elle est téléchargée', () => {
  const [manifest, settings] = presetFor(files, 'https://tableau.exemple.be');
  assert.deepEqual(JSON.parse(manifest.data.toString()).host_permissions, [
    'http://localhost:3737/*',
    'https://tableau.exemple.be/*',
  ]);
  assert.match(settings.data.toString(), /DEFAULT_DASHBOARD = "https:\/\/tableau\.exemple\.be";/);
});

test('laisse l’extension telle quelle sans adresse publique', () => {
  assert.equal(presetFor(files, null), files);
});

test('tire l’adresse publique de la configuration, en HTTPS seulement', () => {
  assert.equal(publicOrigin('https://tableau.exemple.be/api/auth/google/callback'), 'https://tableau.exemple.be');
  assert.equal(publicOrigin('http://localhost:3737/api/auth/google/callback'), null);
  assert.equal(publicOrigin(undefined), null);
  assert.equal(publicOrigin('pas une adresse'), null);
});

test('écrit l’adresse comme une chaîne JavaScript, jamais comme du code', () => {
  const [, settings] = presetFor(files, "https://a.be/'; alert(1); '");
  assert.match(settings.data.toString(), /DEFAULT_DASHBOARD = "https:\/\/a\.be\/'; alert\(1\); '";/);
});
