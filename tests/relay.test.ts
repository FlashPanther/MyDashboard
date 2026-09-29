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
