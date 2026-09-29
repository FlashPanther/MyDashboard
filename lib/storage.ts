'use client';

import { useEffect, useState } from 'react';

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

/** Un choix parmi `options`, retenu d'une visite a l'autre ; le premier par defaut. */
export function useStoredChoice<T extends string>(key: string, options: readonly T[]) {
  const [choice, setChoice] = useState<T>(options[0]);

  useEffect(() => {
    const stored = readStored(key);
    if (stored && (options as readonly string[]).includes(stored)) setChoice(stored as T);
    // Les options sont des constantes du composant appelant.
  }, [key]);

  function choose(next: T) {
    setChoice(next);
    writeStored(key, next);
  }

  return [choice, choose] as const;
}
