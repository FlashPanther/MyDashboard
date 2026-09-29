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
  SESSION_MAX_AGE,
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
  assert.equal(verifySession(createSession('secret', 0), 'secret', SESSION_MAX_AGE * 1000 + DAY), false);
});

test('refuse une session dont la date a été retouchée', () => {
  const [, signature] = createSession('secret', 0).split('.');
  assert.equal(verifySession(`${999 * DAY}.${signature}`, 'secret', DAY), false);
});

test('refuse une session absente ou malformée', () => {
  assert.equal(verifySession(undefined, 'secret'), false);
  assert.equal(verifySession('n-importe-quoi', 'secret'), false);
});

const extension = { 'content-type': 'application/json', origin: 'chrome-extension://abc' };
const online = { password: 'secret', extensionToken: 'jeton' };
const local = { password: null, extensionToken: null };

test('en ligne, accepte l’extension qui présente le bon jeton', () => {
  const headers = new Headers({ ...extension, authorization: 'Bearer jeton' });
  assert.equal(extensionRefusal(headers, online), null);
});

test('en ligne, refuse une origine d’extension imitée sans jeton', () => {
  assert.notEqual(extensionRefusal(new Headers(extension), online), null);
});

test('en ligne, refuse tout rapport tant qu’aucun jeton n’est configuré', () => {
  assert.notEqual(extensionRefusal(new Headers(extension), { ...online, extensionToken: null }), null);
});

test('en local, l’origine d’extension suffit', () => {
  assert.equal(extensionRefusal(new Headers(extension), local), null);
  assert.notEqual(extensionRefusal(new Headers({ ...extension, origin: 'https://evil.example' }), local), null);
});

test('refuse toujours un rapport qui n’est pas du JSON', () => {
  for (const type of ['text/plain', 'application/jsonp']) {
    const headers = new Headers({ ...extension, 'content-type': type, authorization: 'Bearer jeton' });
    assert.notEqual(extensionRefusal(headers, online), null);
  }
  const charset = new Headers({
    ...extension,
    'content-type': 'application/json; charset=utf-8',
    authorization: 'Bearer jeton',
  });
  assert.equal(extensionRefusal(charset, online), null);
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
