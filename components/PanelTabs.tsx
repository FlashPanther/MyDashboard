'use client';

export type PanelTab<K extends string> = {
  key: K;
  label: string;
  /** Compteur affiche dans l'onglet : ambre s'il reste quelque chose, jade a zero. */
  count?: number;
  /** « 25+ » quand le compte est tronque. */
  more?: boolean;
};

/**
 * Onglets d'un panneau, a droite de son titre : meme dessin que le selecteur
 * Maison / Bureau / Auto de l'en-tete.
 */
export function PanelTabs<K extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: PanelTab<K>[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-sm border border-rule"
    >
      {tabs.map((tab) => {
        const selected = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={`flex items-baseline gap-1.5 px-2 py-0.5 text-[11px] uppercase tracking-wider transition-colors ${
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
