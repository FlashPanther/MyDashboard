import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allPages } from '../lib/google/allPages.ts';

test('une seule page sans jeton suivant rend ses éléments', async () => {
  const items = await allPages(async () => ({ items: ['a', 'b'] }));
  assert.deepEqual(items, ['a', 'b']);
});

test('toutes les pages sont lues, dans l ordre, en repassant le jeton reçu', async () => {
  const jetons: (string | undefined)[] = [];
  const pages = new Map<string | undefined, { items: string[]; nextPageToken?: string }>([
    [undefined, { items: ['a'], nextPageToken: 'p2' }],
    ['p2', { items: ['b'], nextPageToken: 'p3' }],
    ['p3', { items: ['c'] }],
  ]);
  const items = await allPages(async (jeton) => {
    jetons.push(jeton);
    return pages.get(jeton)!;
  });
  assert.deepEqual(items, ['a', 'b', 'c']);
  assert.deepEqual(jetons, [undefined, 'p2', 'p3']);
});

test('un jeton déjà rencontré lève une erreur au lieu de boucler sans fin', async () => {
  await assert.rejects(
    allPages(async () => ({ items: ['a'], nextPageToken: 'p2' })),
    /jeton déjà rencontré/,
  );
});

test('une page sans items ne rompt pas la lecture', async () => {
  const items = await allPages<string>(async (jeton) =>
    jeton ? { items: ['a'] } : { nextPageToken: 'p2' },
  );
  assert.deepEqual(items, ['a']);
});
