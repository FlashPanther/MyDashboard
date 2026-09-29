/**
 * Etiquettes des taches : des « #mot » dans le titre (Google Tasks n'a ni
 * categories ni etiquettes). Une lettre, un chiffre, « - » ou « _ » ; « #3 »
 * compte aussi. Comparees sans tenir compte de la casse.
 */

// Un « # » en debut de titre ou apres une espace : « C#9 » ou une adresse n'en sont pas.
const TAG = /(^|\s)#([\p{L}\p{N}_-]+)/gu;

export type Tagged = {
  /** Le titre sans ses etiquettes, espaces resserrees. */
  label: string;
  /** En minuscules, sans doublon, dans l'ordre du titre. */
  tags: string[];
};

export function parseTags(title: string): Tagged {
  const tags = [...new Set([...title.matchAll(TAG)].map((match) => match[2].toLowerCase()))];
  const label = title.replace(TAG, '$1').replace(/\s+/g, ' ').trim();
  // Un titre fait seulement d'etiquettes garde son texte : une ligne vide ne dit rien.
  return { label: label || title.trim(), tags };
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
