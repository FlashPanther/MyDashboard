import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTags, tagColor } from '../lib/tags.ts';

// Titre → titre affiché, étiquettes.
const cases: [string, string, string[]][] = [
  ['Réparer le vélo #maison #urgent', 'Réparer le vélo', ['maison', 'urgent']],
  ['Appeler #patro le trésorier', 'Appeler le trésorier', ['patro']],
  ['Réunion (#urgent)', 'Réunion', ['urgent']],
  ['Voir « #perso » demain', 'Voir demain', ['perso']],
  ['#maison, puis ranger', 'puis ranger', ['maison']],
  ['Ranger #maison.', 'Ranger.', ['maison']],
  ['Laver #maison- bis', 'Laver - bis', ['maison']],
  ['Fête 🎉 #été', 'Fête 🎉', ['été']],
  ['Payer #3 factures', 'Payer factures', ['3']],
  // Un titre réduit à ses étiquettes, ou à de la ponctuation, garde son texte.
  ['#maison #urgent', '#maison #urgent', ['maison', 'urgent']],
  ['#maison,', '#maison,', ['maison']],
  // Pas des étiquettes, et un titre sans étiquette n'est jamais retouché.
  ['Réviser C#9 et la page site.be/#ancre', 'Réviser C#9 et la page site.be/#ancre', []],
  ['##urgent', '##urgent', []],
  ['Citer &#39;ok&#39;', 'Citer &#39;ok&#39;', []],
  ['Rien # ici', 'Rien # ici', []],
  ['... relancer ( ) , vite', '... relancer ( ) , vite', []],
];

for (const [title, label, tags] of cases) {
  test(`lit « ${title} »`, () => {
    assert.deepEqual(parseTags(title), { label, tags });
  });
}

test('ignore la casse et les doublons', () => {
  assert.deepEqual(parseTags('#Maison ranger #maison').tags, ['maison']);
});

test('accepte accents, chiffres, tirets et soulignés', () => {
  assert.deepEqual(parseTags('x #été-2027 #a_b #3').tags, ['été-2027', 'a_b', '3']);
});

test('donne toujours la même couleur à une même étiquette, prise dans la palette', () => {
  assert.equal(tagColor('maison'), tagColor('maison'));
  for (const tag of ['maison', 'urgent', 'été', '3', 'x']) assert.match(tagColor(tag), /^bg-(amber|jade|sky|ink)\//);
});
