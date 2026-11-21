import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectionOf } from '../lib/google/connection.ts';

test('sans compte relié, la liaison n’est ni valide ni expirée', () => {
  assert.deepEqual(connectionOf(null), { connected: false, expired: false });
  assert.deepEqual(connectionOf({}), { connected: false, expired: false });
});

test('un jeton enregistré que Google n’a pas refusé est une liaison valide', () => {
  assert.deepEqual(connectionOf({ refresh_token: 'jeton' }), { connected: true, expired: false });
});

test('un jeton enregistré mais refusé par Google est une liaison expirée, pas une liaison valide', () => {
  assert.deepEqual(connectionOf({ refresh_token: 'jeton', refused_at: 1 }), { connected: false, expired: true });
});
