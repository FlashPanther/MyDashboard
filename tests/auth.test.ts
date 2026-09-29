import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearFailures,
  isBlocked,
  MAX_FAILURES,
  MAX_GLOBAL_FAILURES,
  recordFailure,
  resetLimiter,
  WINDOW_MS,
} from '../lib/auth/limiter.ts';
import {
  clientIp,
  createSession,
  extensionRefusal,
  safeEqual,
  SESSION_DAYS,
  verifySession,
} from '../lib/auth/session.ts';

const DAY = 86_400_000;

test('accepte une session signée avec le bon mot de passe', () => {
  assert.equal(verifySession(createSession('secret', 0), 'secret', DAY), true);
});

test('refuse une session après changement de mot de passe', () => {
  assert.equal(verifySession(createSession('ancien', 0), 'nouveau', DAY), false);
});

test('refuse une session expirée', () => {
  assert.equal(verifySession(createSession('secret', 0), 'secret', (SESSION_DAYS + 1) * DAY), false);
});

test('refuse une session dont la date a été retouchée', () => {
  const [, signature] = createSession('secret', 0).split('.');
  assert.equal(verifySession(`${999 * DAY}.${signature}`, 'secret', DAY), false);
});

test('refuse une session absente ou malformée', () => {
  assert.equal(verifySession(undefined, 'secret'), false);
  assert.equal(verifySession('n-importe-quoi', 'secret'), false);
});

const json = { contentType: 'application/json', origin: 'chrome-extension://abc', authorization: null };

test('en ligne, accepte l’extension qui présente le bon jeton', () => {
  const request = { ...json, authorization: 'Bearer jeton' };
  assert.equal(extensionRefusal(request, { token: 'jeton', password: 'secret' }), null);
});

test('en ligne, refuse une origine d’extension imitée sans jeton', () => {
  assert.notEqual(extensionRefusal(json, { token: 'jeton', password: 'secret' }), null);
});

test('en ligne, refuse tout rapport tant qu’aucun jeton n’est configuré', () => {
  assert.notEqual(extensionRefusal(json, { password: 'secret' }), null);
});

test('en local, l’origine d’extension suffit', () => {
  assert.equal(extensionRefusal(json, {}), null);
  assert.notEqual(extensionRefusal({ ...json, origin: 'https://evil.example' }, {}), null);
});

test('refuse toujours un rapport qui n’est pas du JSON', () => {
  for (const contentType of ['text/plain', 'application/jsonp']) {
    const request = { ...json, contentType, authorization: 'Bearer jeton' };
    assert.notEqual(extensionRefusal(request, { token: 'jeton' }), null);
  }
  const charset = { ...json, contentType: 'application/json; charset=utf-8', authorization: 'Bearer jeton' };
  assert.equal(extensionRefusal(charset, { token: 'jeton' }), null);
});

test('bloque une adresse après trop d’échecs, puis la libère', () => {
  resetLimiter();
  for (let i = 0; i < MAX_FAILURES; i++) recordFailure('1.2.3.4', 0);
  assert.equal(isBlocked('1.2.3.4', 1000), true);
  assert.equal(isBlocked('1.2.3.4', WINDOW_MS + 1), false);
  assert.equal(isBlocked('5.6.7.8', 1000), false);
});

test('ferme la connexion à tous quand les échecs viennent de trop d’adresses', () => {
  resetLimiter();
  for (let i = 0; i < MAX_GLOBAL_FAILURES; i++) recordFailure(`10.0.0.${i}`, 0);
  assert.equal(isBlocked('192.168.1.1', 1000), true);
  assert.equal(isBlocked('192.168.1.1', WINDOW_MS + 1), false);
});

test('une connexion réussie efface les échecs de l’adresse', () => {
  resetLimiter();
  for (let i = 0; i < MAX_FAILURES; i++) recordFailure('1.2.3.4', 0);
  clearFailures('1.2.3.4');
  assert.equal(isBlocked('1.2.3.4', 1000), false);
});

test('prend l’adresse posée par le proxy, pas celle inventée par le client', () => {
  assert.equal(clientIp(new Headers({ 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '1.1.1.1' })), '8.8.8.8');
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 8.8.8.8' })), '8.8.8.8');
  assert.equal(clientIp(new Headers()), 'inconnue');
});

test('compare des chaînes de longueurs différentes sans erreur', () => {
  assert.equal(safeEqual('court', 'beaucoup plus long'), false);
  assert.equal(safeEqual('pareil', 'pareil'), true);
});
