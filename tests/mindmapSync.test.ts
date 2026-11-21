import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  eventOf,
  isClean,
  opening,
  parseDraft,
  sendDelay,
  serializeDraft,
  statusOf,
  syncStep,
  toSend,
  type SyncState,
} from '../lib/mindmap/sync.ts';
import { newNode, rename } from '../lib/mindmap/tree.ts';

const server = { revision: 4, root: newNode('Voyage', 'root') };
const mine = rename(server.root, 'root', 'Voyage au Japon');
const clean = (): SyncState => opening(server, null).sync;

test('sans brouillon, ou avec un brouillon identique, la carte du serveur s’ouvre comme déjà enregistrée', () => {
  for (const draft of [null, { base: 2, root: structuredClone(server.root) }]) {
    const { root, sync } = opening(server, draft);
    assert.equal(root, server.root);
    assert.equal(statusOf(sync, root), 'saved');
    assert.equal(toSend(sync, root), null);
  }
});

test('un brouillon fait sur la révision du serveur reprend là où on s’était arrêté et part à l’enregistrement', () => {
  const { root, sync } = opening(server, { base: 4, root: mine });
  assert.equal(root, mine);
  assert.equal(statusOf(sync, root), 'saving');
  assert.equal(toSend(sync, root), mine);
});

test('un brouillon fait sur une révision dépassée ouvre un conflit et n’envoie rien tant qu’il n’est pas tranché', () => {
  const { root, sync } = opening(server, { base: 3, root: mine });
  assert.equal(root, mine);
  assert.equal(statusOf(sync, root), 'conflict');
  assert.equal(toSend(sync, root), null);
});

test('un brouillon survit à son écriture, un texte abîmé ou sans révision est ignoré', () => {
  assert.deepEqual(parseDraft(serializeDraft(4, mine)), { base: 4, root: mine });
  assert.equal(parseDraft(null), null);
  assert.equal(parseDraft('{ abîmé'), null);
  assert.equal(parseDraft(JSON.stringify({ root: mine })), null);
});

test('un seul envoi à la fois : la modification faite pendant l’envoi part après l’accusé de réception', () => {
  const sending = syncStep(clean(), { type: 'sent', root: mine });
  const later = rename(mine, 'root', 'Voyage au Japon en avril');
  assert.equal(toSend(sending, later), null);
  const accepted = syncStep(sending, { type: 'accepted', revision: 5 });
  assert.deepEqual(accepted.base, { revision: 5, root: mine });
  assert.equal(statusOf(accepted, mine), 'saved');
  assert.equal(toSend(accepted, later), later);
});

const theirs = { revision: 9, root: rename(server.root, 'root', 'Ailleurs') };
const refused = () => syncStep(syncStep(clean(), { type: 'sent', root: mine }), { type: 'conflict', theirs });

test('en conflit rien ne part ; garder ma version l’envoie sur la révision de l’autre', () => {
  assert.equal(statusOf(refused(), mine), 'conflict');
  assert.equal(toSend(refused(), mine), null);
  const kept = syncStep(refused(), { type: 'settled' });
  assert.equal(kept.base.revision, 9);
  assert.equal(toSend(kept, mine), mine);
});

test('garder ma version l’envoie même si j’ai annulé jusqu’à la carte d’avant le conflit', () => {
  const kept = syncStep(refused(), { type: 'settled' });
  assert.equal(toSend(kept, server.root), server.root);
  assert.equal(statusOf(kept, server.root), 'saving');
});

test('prendre l’autre version l’adopte sans rien renvoyer', () => {
  const taken = syncStep(refused(), { type: 'settled' });
  assert.equal(statusOf(taken, theirs.root), 'saved');
  assert.equal(toSend(taken, theirs.root), null);
});

test('un brouillon en conflit reste rattaché à sa révision d’origine tant que rien n’est tranché', () => {
  const { sync } = opening(server, { base: 3, root: mine });
  assert.equal(sync.base.revision, 3);
  assert.equal(syncStep(sync, { type: 'settled' }).base.revision, 4);
});

test('une panne se retente de plus en plus lentement, puis repart normalement après un succès', () => {
  const failed = (state: SyncState) => syncStep(syncStep(state, { type: 'sent', root: mine }), eventOf(0, null));
  const once = failed(clean());
  assert.equal(statusOf(once, mine), 'offline');
  assert.equal(toSend(once, mine), mine);
  assert.deepEqual([once, failed(once), failed(failed(once))].map(sendDelay), [5000, 10000, 20000]);
  assert.equal(sendDelay(Array.from({ length: 12 }).reduce<SyncState>(failed, clean())), 60000);
  const back = syncStep(syncStep(once, { type: 'sent', root: mine }), eventOf(200, { revision: 5 }));
  assert.equal(statusOf(back, mine), 'saved');
  assert.equal(sendDelay(back), 600);
});

test('la réponse du serveur décide de la suite : accepté, conflit, supprimée, refus définitif, panne', () => {
  assert.deepEqual(eventOf(200, { revision: 5 }), { type: 'accepted', revision: 5 });
  const conflict = eventOf(409, { current: { revision: 9, root: { id: 'r', text: 'Ailleurs', children: [] } } });
  assert.equal(conflict.type === 'conflict' && conflict.theirs.root.text, 'Ailleurs');
  assert.deepEqual(eventOf(404, { error: 'x' }), { type: 'failed', trouble: 'gone' });
  for (const status of [400, 401, 413]) assert.deepEqual(eventOf(status, null), { type: 'failed', trouble: 'refused' });
  assert.deepEqual(eventOf(409, { current: 'illisible' }), { type: 'failed', trouble: 'refused' });
  for (const status of [0, 500, 502]) assert.deepEqual(eventOf(status, null), { type: 'failed', trouble: 'offline' });
  assert.deepEqual(eventOf(200, null), { type: 'failed', trouble: 'offline' });
});

test('une carte supprimée ou refusée par le serveur ne s’envoie plus', () => {
  for (const status of [404, 400]) {
    const stopped = syncStep(syncStep(clean(), { type: 'sent', root: mine }), eventOf(status, null));
    assert.equal(toSend(stopped, mine), null);
  }
});

test('un refus dont la version du serveur est déjà la mienne n’est pas un conflit', () => {
  const sending = syncStep(clean(), { type: 'sent', root: mine });
  const echoed = syncStep(sending, { type: 'conflict', theirs: { revision: 5, root: structuredClone(mine) } });
  assert.equal(statusOf(echoed, mine), 'saved');
  assert.deepEqual(echoed.base, { revision: 5, root: mine });
});

test('annuler pendant un envoi n’est pas « enregistré » : la carte d’avant repart dès l’accusé de réception', () => {
  const sending = syncStep(clean(), { type: 'sent', root: mine });
  assert.equal(isClean(sending, server.root), false);
  assert.equal(statusOf(sending, server.root), 'saving');
  const accepted = syncStep(sending, { type: 'accepted', revision: 5 });
  assert.equal(toSend(accepted, server.root), server.root);
});

test('après une réponse perdue, revenir à la dernière carte connue la renvoie quand même', () => {
  const lost = syncStep(syncStep(clean(), { type: 'sent', root: mine }), eventOf(0, null));
  assert.equal(isClean(lost, server.root), false);
  assert.equal(toSend(lost, server.root), server.root);
  const back = syncStep(syncStep(lost, { type: 'sent', root: server.root }), eventOf(200, { revision: 6 }));
  assert.equal(isClean(back, server.root), true);
});

test('pendant un conflit, revenir à la carte d’avant ne passe pas pour enregistré', () => {
  assert.equal(isClean(refused(), server.root), false);
  assert.equal(statusOf(refused(), server.root), 'conflict');
});
