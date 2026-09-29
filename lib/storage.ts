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
 * Une valeur retenue d'une visite a l'autre, ou null. Lue des le premier rendu,
 * pour ne pas afficher d'abord la valeur par defaut : a reserver aux composants
 * rendus seulement cote client (c'est le cas du tableau, affiche apres montage,
 * voir app/page.tsx).
 */
export function useStored(key: string) {
  const [value, setValue] = useState<string | null>(() => readStored(key));

  function store(next: string | null) {
    setValue(next);
    writeStored(key, next);
  }

  return [value, store] as const;
}

/** Un choix parmi `options`, retenu d'une visite a l'autre ; le premier par defaut. */
export function useStoredChoice<T extends string>(key: string, options: readonly T[]) {
  const [stored, store] = useStored(key);
  const choice = stored && (options as readonly string[]).includes(stored) ? (stored as T) : options[0];
  return [choice, store as (next: T) => void] as const;
}
