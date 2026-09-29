import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { feedSnapshot, receiveReport, resetFeeds, STALE_MS } from '../lib/providers/relay.ts';

const chat = {
  id: 'a',
  name: 'Marie',
  preview: 'On se voit demain ?',
  when: '14:32',
  unread: 2,
  url: 'https://web.whatsapp.com/',
};

beforeEach(() => resetFeeds());

test('attend l’extension tant qu’elle ne s’est jamais manifestée', () => {
  assert.equal(feedSnapshot('whatsapp').status, 'waiting');
});

test('rend les discussions reçues, avec le total annoncé par la page', () => {
  receiveReport('whatsapp', { state: 'ready', chats: [chat], total: 5 });
  const snapshot = feedSnapshot('whatsapp');
  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.conversations, 5);
  assert.equal(snapshot.chats[0].name, 'Marie');
  assert.equal(snapshot.chats[0].unread, 2);
});

test('ne compte jamais moins de discussions que la liste n’en contient', () => {
  receiveReport('whatsapp', { state: 'ready', chats: [chat], total: 0 });
  assert.equal(feedSnapshot('whatsapp').conversations, 1);
});

test('signale une extension muette depuis plus de trois minutes', () => {
  receiveReport('messenger', { state: 'ready', chats: [] }, 0);
  assert.equal(feedSnapshot('messenger', STALE_MS + 1).status, 'stale');
});

test('rejette les liens hors de la messagerie concernée', () => {
  receiveReport('whatsapp', {
    state: 'ready',
    chats: [
      { ...chat, url: 'javascript:alert(1)' },
      { ...chat, url: 'https://evil.example/' },
      { ...chat, url: 'https://www.messenger.com/t/1/' },
    ],
  });
  assert.deepEqual(feedSnapshot('whatsapp').chats, []);
});

test('garde les sources séparées', () => {
  receiveReport('whatsapp', { state: 'ready', chats: [chat] });
  assert.equal(feedSnapshot('messenger').status, 'waiting');
});

test('refuse un état inconnu', () => {
  assert.throws(() => receiveReport('whatsapp', { state: 'pirate' }));
});

const pc1 = { instance: 'pc-1' };
const pc2 = { instance: 'pc-2' };
const status = (at: number) => feedSnapshot('whatsapp', at).status;

test('un seul PC : la déconnexion de l’onglet se voit tout de suite', () => {
  receiveReport('whatsapp', { ...pc1, tab: 7, state: 'ready', chats: [chat] }, 0);
  receiveReport('whatsapp', { ...pc1, tab: 7, state: 'login', chats: [] }, 10_000);
  assert.equal(status(10_000), 'login');
});

test('un seul PC : le dernier onglet fermé se voit au contrôle suivant', () => {
  receiveReport('whatsapp', { ...pc1, tab: 7, state: 'ready', chats: [chat] }, 0);
  receiveReport('whatsapp', { ...pc1, tab: null, state: 'noTab', chats: [] }, 60_000);
  assert.equal(status(60_000), 'noTab');
});

test('un onglet sur le QR code n’efface pas l’onglet prêt du même PC', () => {
  receiveReport('whatsapp', { ...pc1, tab: 7, state: 'ready', chats: [chat] }, 0);
  receiveReport('whatsapp', { ...pc1, tab: 8, state: 'login', chats: [] }, 5_000);
  assert.equal(status(5_000), 'ready');
  assert.equal(feedSnapshot('whatsapp', 5_000).chats.length, 1);
});

test('un PC sans onglet n’efface pas la liste d’un autre PC', () => {
  receiveReport('whatsapp', { ...pc1, tab: 7, state: 'ready', chats: [chat] }, 0);
  receiveReport('whatsapp', { ...pc2, tab: null, state: 'noTab', chats: [] }, 30_000);
  assert.equal(status(30_000), 'ready');
});

test('un seul PC prêt suffit, même si un autre est déconnecté', () => {
  receiveReport('whatsapp', { ...pc1, tab: 7, state: 'ready', chats: [chat] }, 0);
  receiveReport('whatsapp', { ...pc2, tab: 3, state: 'login', chats: [] }, 10_000);
  assert.equal(status(10_000), 'ready');
});

test('quand le PC prêt se tait, l’état de l’autre PC reprend la main', () => {
  receiveReport('whatsapp', { ...pc1, tab: 7, state: 'ready', chats: [chat] }, 0);
  receiveReport('whatsapp', { ...pc2, tab: null, state: 'noTab', chats: [] }, STALE_MS);
  assert.equal(status(STALE_MS), 'ready');
  assert.equal(status(STALE_MS + 1), 'noTab');
});

test('entre deux listes fraîches, la plus récente l’emporte', () => {
  receiveReport('whatsapp', { ...pc1, tab: 7, state: 'ready', chats: [chat] }, 0);
  receiveReport('whatsapp', { ...pc2, tab: 3, state: 'ready', chats: [] }, 1_000);
  assert.equal(feedSnapshot('whatsapp', 1_000).chats.length, 0);
});

test('une extension sans identifiant compte comme un seul Chrome', () => {
  receiveReport('whatsapp', { state: 'ready', chats: [chat] }, 0);
  receiveReport('whatsapp', { state: 'noTab', chats: [] }, 30_000);
  assert.equal(status(30_000), 'noTab');
});
