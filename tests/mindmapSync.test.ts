import assert from 'node:assert/strict';
import { test } from 'node:test';
import { opening, parseDraft, serializeDraft, statusOf, syncStep, toSend, type SyncState } from '../lib/mindmap/sync.ts';
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
  assert.equal(accepted.revision, 5);
  assert.equal(statusOf(accepted, mine), 'saved');
  assert.equal(toSend(accepted, later), later);
});

test('refusé par le serveur : garder ma version repart de sa révision, prendre l’autre l’adopte sans rien renvoyer', () => {
  const theirs = { revision: 9, root: rename(server.root, 'root', 'Ailleurs') };
  const refused = syncStep(syncStep(clean(), { type: 'sent', root: mine }), { type: 'refused', theirs });
  assert.equal(statusOf(refused, mine), 'conflict');
  const kept = syncStep(refused, { type: 'keepMine' });
  assert.equal(kept.revision, 9);
  assert.equal(toSend(kept, mine), mine);
  const taken = syncStep(refused, { type: 'takeTheirs' });
  assert.equal(taken.revision, 9);
  assert.equal(statusOf(taken, theirs.root), 'saved');
});

test('une panne de réseau se retente, une carte supprimée ailleurs ne s’envoie plus', () => {
  const offline = syncStep(syncStep(clean(), { type: 'sent', root: mine }), { type: 'failed', gone: false });
  assert.equal(statusOf(offline, mine), 'offline');
  assert.equal(toSend(offline, mine), mine);
  assert.equal(statusOf(syncStep(syncStep(offline, { type: 'sent', root: mine }), { type: 'accepted', revision: 5 }), mine), 'saved');
  const gone = syncStep(syncStep(clean(), { type: 'sent', root: mine }), { type: 'failed', gone: true });
  assert.equal(statusOf(gone, mine), 'gone');
  assert.equal(toSend(gone, mine), null);
});
