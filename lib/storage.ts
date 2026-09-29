'use client';

import { useState } from 'react';

/**
 * Preferences d'affichage propres a chaque appareil (localStorage). Le stockage
 * peut etre bloque (navigation privee, site bloque) : on lit null, et un choix
 * ne vaut alors que pour la session.
 */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Stockage bloque : le choix ne vaut que pour cette session.
  }
}

/**
 * Un choix parmi `options`, retenu d'une visite a l'autre ; le premier par
 * defaut. Lu des le premier rendu, pour ne pas afficher d'abord le choix par
 * defaut : a reserver aux composants rendus seulement cote client (c'est le cas
 * du tableau, affiche apres montage, voir app/page.tsx).
 */
export function useStoredChoice<T extends string>(key: string, options: readonly T[]) {
  const [choice, setChoice] = useState<T>(() => {
    const stored = readStored(key);
    return stored && (options as readonly string[]).includes(stored) ? (stored as T) : options[0];
  });

  function choose(next: T) {
    setChoice(next);
    writeStored(key, next);
  }

  return [choice, choose] as const;
}
