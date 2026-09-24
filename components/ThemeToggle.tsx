'use client';

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'theme';

const OPTIONS: { value: Theme; label: string; hint: string }[] = [
  { value: 'light', label: 'Clair', hint: 'Toujours en clair' },
  { value: 'dark', label: 'Sombre', hint: 'Toujours en sombre' },
  { value: 'auto', label: 'Auto', hint: 'Suit le réglage du système' },
];

/** « auto » retire l'attribut : la feuille de style repasse sur prefers-color-scheme. */
function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function ThemeToggle() {
  // Null tant que le navigateur n'a pas parle : le serveur ne peut pas deviner
  // le choix, et afficher un bouton actif au hasard ferait clignoter la barre.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Navigation privee ou stockage bloque : on reste en automatique.
    }
    setTheme(stored === 'light' || stored === 'dark' ? stored : 'auto');
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    apply(next);
    try {
      if (next === 'auto') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Le choix vaut pour la session, il ne survivra pas au rechargement.
    }
  };

  return (
    <div
      role="group"
      aria-label="Thème"
      className="inline-flex overflow-hidden rounded-sm border border-rule"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.hint}
          onClick={() => choose(option.value)}
          aria-pressed={theme === option.value}
          className={`px-2 py-0.5 text-[11px] uppercase tracking-wider transition-colors ${
            theme === option.value ? 'bg-ink text-ground' : 'text-muted hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
