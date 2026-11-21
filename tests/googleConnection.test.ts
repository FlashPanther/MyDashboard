import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectionOf } from '../lib/google/connection.ts';

const refusal = Object.assign(new Error('Autorisation Google expirée'), { name: 'NotConnectedError' });

test('sans compte relié, la liaison est absente et Google n’est pas interrogé', async () => {
  let asked = false;
  assert.equal(await connectionOf(false, async () => (asked = true)), 'absent');
  assert.equal(asked, false);
});

test('un jeton que Google renouvelle est une liaison valide', async () => {
  assert.equal(await connectionOf(true, async () => 'jeton'), 'connected');
});

test('un jeton enregistré mais refusé par Google est une liaison expirée, pas une liaison valide', async () => {
  assert.equal(await connectionOf(true, () => Promise.reject(refusal)), 'expired');
});

test('une panne de réseau ne fait pas passer la liaison pour expirée', async () => {
  assert.equal(await connectionOf(true, () => Promise.reject(new Error('fetch failed'))), 'connected');
});
