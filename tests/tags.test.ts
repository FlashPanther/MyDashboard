import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTags, tagColor } from '../lib/tags.ts';

test('sépare le titre de ses étiquettes', () => {
  assert.deepEqual(parseTags('Réparer le vélo #maison #urgent'), {
    label: 'Réparer le vélo',
    tags: ['maison', 'urgent'],
  });
});

test('trouve les étiquettes au milieu du titre', () => {
  assert.deepEqual(parseTags('Appeler #patro le trésorier'), {
    label: 'Appeler le trésorier',
    tags: ['patro'],
  });
});

test('ignore la casse et les doublons', () => {
  assert.deepEqual(parseTags('#Maison ranger #maison').tags, ['maison']);
});

test('accepte accents, chiffres, tirets et soulignés', () => {
  assert.deepEqual(parseTags('x #été-2027 #a_b #3').tags, ['été-2027', 'a_b', '3']);
});

test('ne prend pas un # collé à un mot', () => {
  assert.deepEqual(parseTags('Réviser C#9 et la page site.be/#ancre'), {
    label: 'Réviser C#9 et la page site.be/#ancre',
    tags: [],
  });
});

test('garde le texte d’un titre fait seulement d’étiquettes', () => {
  assert.deepEqual(parseTags('#maison #urgent'), { label: '#maison #urgent', tags: ['maison', 'urgent'] });
});

test('donne toujours la même couleur à une même étiquette', () => {
  assert.equal(tagColor('maison'), tagColor('maison'));
  assert.match(tagColor('maison'), /^bg-/);
});
