'use client';

import { useRef, type KeyboardEvent } from 'react';

export type PanelTab<K extends string> = {
  key: K;
  label: string;
  /** Compteur affiche dans l'onglet : ambre s'il reste quelque chose, jade a zero. */
  count?: number;
  /** « 25+ » quand le compte est tronque. */
  more?: boolean;
};

const tabId = (id: string, key: string) => `${id}-tab-${key}`;
const panelId = (id: string) => `${id}-panel`;

/** Attributs du panneau que les onglets commandent (meme `id` que PanelTabs). */
export function tabPanelProps(id: string, value: string) {
  return { role: 'tabpanel', id: panelId(id), 'aria-labelledby': tabId(id, value) } as const;
}

/**
 * Onglets d'un panneau, a droite de son titre : meme dessin que le selecteur
 * Maison / Bureau / Auto de l'en-tete. Motif d'onglets ARIA : un seul onglet
 * dans l'ordre de tabulation, fleches, Debut et Fin pour passer de l'un a
 * l'autre.
 */
export function PanelTabs<K extends string>({
  id,
  label,
  tabs,
  value,
  onChange,
}: {
  /** Prefixe des identifiants, partage avec tabPanelProps (useId). */
  id: string;
  label: string;
  tabs: PanelTab<K>[];
  value: K;
  onChange: (key: K) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent) {
    const current = tabs.findIndex((tab) => tab.key === value);
    const last = tabs.length - 1;
    const next = {
      ArrowRight: current === last ? 0 : current + 1,
      ArrowLeft: current === 0 ? last : current - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onChange(tabs[next].key);
    buttons.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="inline-flex overflow-hidden rounded-sm border border-rule"
    >
      {tabs.map((tab, index) => {
        const selected = tab.key === value;
        return (
          <button
            key={tab.key}
            ref={(button) => {
              buttons.current[index] = button;
            }}
            id={tabId(id, tab.key)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={`flex items-baseline gap-1.5 whitespace-nowrap px-2 py-0.5 text-[11px] uppercase tracking-wider transition-colors ${
              selected ? 'bg-ink text-ground' : 'text-muted hover:text-ink'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`tnum font-semibold ${
                  selected ? '' : tab.count === 0 ? 'text-jade' : 'text-amber'
                }`}
              >
                {tab.count}
                {tab.more ? '+' : ''}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
