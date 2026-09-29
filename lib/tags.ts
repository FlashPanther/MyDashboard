/**
 * Etiquettes des taches : des « #mot » dans le titre (Google Tasks n'a ni
 * categories ni etiquettes). Lettres (accents compris), chiffres, « _ », et
 * « - » a l'interieur ; « #3 » compte aussi. Comparees sans tenir compte de la
 * casse.
 */

// Le « # » ne suit ni lettre, ni chiffre, ni « / », « # » ou « & » : « C#9 », une
// adresse « site.be/#ancre », « ## » ou une entite « &#39; » n'en sont pas ;
// « (#urgent) » si.
const TAG = /(?<![\p{L}\p{N}_/#&])#([\p{L}\p{N}_](?:[\p{L}\p{N}_-]*[\p{L}\p{N}_])?)/gu;

export type Tagged = {
  /** Le titre sans ses etiquettes, espaces resserrees. */
  label: string;
  /** En minuscules, sans doublon, dans l'ordre du titre. */
  tags: string[];
};

export function parseTags(title: string): Tagged {
  const tags = [...new Set([...title.matchAll(TAG)].map((match) => match[1].toLowerCase()))];
  // Un titre sans etiquette reste tel quel : le nettoyage ne concerne que ce
  // que le retrait des etiquettes laisse derriere lui.
  if (tags.length === 0) return { label: title.trim(), tags };
  const label = title
    .replace(TAG, '')
    // Ce que l'etiquette laisse derriere elle : parentheses vides, espace avant « , » ou « . ».
    .replace(/[([{«]\s*[)\]}»]/g, '')
    .replace(/\s+([,.])/g, '$1')
    .replace(/\s+/g, ' ')
    // …et la ponctuation qui ouvrait sur une etiquette en tete de titre.
    .replace(/^[\s,.;:–-]+/, '')
    .trim();
  // Un titre sans autre texte que ses etiquettes les garde : une ligne vide
  // ou faite de ponctuation ne dit rien.
  return { label: /[\p{L}\p{N}]/u.test(label) ? label : title.trim(), tags };
}

/**
 * Couleur d'une etiquette, toujours la meme pour un meme nom : un petit hachage
 * choisit parmi les teintes du theme. Pas de rose, reserve au retard.
 */
const COLORS = [
  'bg-amber/15 text-amber',
  'bg-jade/15 text-jade',
  'bg-sky/15 text-sky',
  'bg-ink/10 text-ink',
] as const;

export function tagColor(tag: string): (typeof COLORS)[number] {
  let hash = 0;
  for (const char of tag) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return COLORS[hash % COLORS.length];
}
