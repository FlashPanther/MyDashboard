'use client';

import { useId, type ReactNode } from 'react';
import { TriangleAlert, type LucideIcon } from 'lucide-react';
import { PanelTabs, tabPanelProps, type PanelTab } from '@/components/PanelTabs';

export type PanelAlert = { count: number; detail: string; severe: boolean };

type PanelProps<K extends string> = {
  title: string;
  icon: LucideIcon;
  /** Ce qui demande ton attention : un badge a cote du titre, le detail au survol. */
  alert?: PanelAlert | null;
  /** Page complete derriere le titre : Gmail, Google Tasks, l'agenda… */
  href?: string;
  /** Ce que le lien ouvre, en clair, pour l'infobulle et les lecteurs d'ecran. */
  hrefLabel?: string;
  /** Valeur courte affichee a droite du titre : compteur, temperature, statut. */
  meta?: ReactNode;
  /**
   * Onglets a droite du titre : le corps du panneau devient leur tabpanel, y
   * compris quand il affiche une erreur ou « relier Google ».
   */
  tabs?: { label: string; items: PanelTab<K>[]; value: K; onChange: (key: K) => void };
  error?: string | null;
  notConnected?: boolean;
  loading?: boolean;
  /** Occupe la hauteur restante de la colonne. */
  grow?: boolean;
  children: ReactNode;
};

export function Panel<K extends string = string>({
  title,
  icon,
  alert,
  href,
  hrefLabel,
  meta,
  tabs,
  error,
  notConnected,
  loading,
  grow,
  children,
}: PanelProps<K>) {
  const id = useId();
  return (
    <section className={`panel flex min-h-0 w-full flex-col ${grow ? 'flex-1' : ''}`}>
      <header className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-2.5">
        <PanelTitle title={title} icon={icon} alert={alert} href={href} hrefLabel={hrefLabel} />
        {tabs && (
          <PanelTabs
            id={id}
            label={tabs.label}
            tabs={tabs.items}
            value={tabs.value}
            onChange={tabs.onChange}
          />
        )}
        {meta && <div className="tnum min-w-0 truncate font-mono text-xs text-muted">{meta}</div>}
      </header>
      <div
        {...(tabs && tabPanelProps(id, tabs.value))}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        {notConnected ? (
          <ConnectPrompt />
        ) : error ? (
          <p className="text-sm text-rose">{error}</p>
        ) : loading ? (
          <p className="font-mono text-sm text-muted">Chargement…</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/** Titre de panneau, cliquable quand une page complete existe. */
export function PanelTitle({
  title,
  icon: Icon,
  alert,
  href,
  hrefLabel,
}: {
  title: string;
  icon: LucideIcon;
  alert?: PanelAlert | null;
  href?: string;
  hrefLabel?: string;
}) {
  const label = (
    <>
      <Icon aria-hidden size={13} strokeWidth={2.25} className="shrink-0 self-center" />
      {title}
    </>
  );
  return (
    <div className="flex shrink-0 items-baseline gap-2">
      <h2 className="eyebrow">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            title={hrefLabel}
            className="inline-flex items-baseline gap-1.5 transition-colors hover:text-ink"
          >
            {label}
            <span aria-hidden className="text-[9px]">
              &#8599;
            </span>
          </a>
        ) : (
          <span className="inline-flex items-baseline gap-1.5">{label}</span>
        )}
      </h2>
      {alert && alert.count > 0 && <AlertBadge alert={alert} />}
    </div>
  );
}

function AlertBadge({ alert }: { alert: PanelAlert }) {
  return (
    <span
      role="img"
      title={alert.detail}
      aria-label={alert.detail}
      className={`tnum inline-flex items-center gap-1 self-center rounded-full px-1.5 font-mono text-[10px] leading-4 ${
        alert.severe ? 'bg-rose/15 text-rose' : 'bg-amber/15 text-amber'
      }`}
    >
      <TriangleAlert aria-hidden size={11} strokeWidth={2.5} />
      {alert.count}
    </span>
  );
}

function ConnectPrompt() {
  return (
    <p className="text-sm text-muted">
      Ce panneau attend ton compte Google.{' '}
      <a href="/api/auth/google" className="text-amber underline-offset-2 hover:underline">
        Le relier
      </a>
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-1 text-sm text-muted">{children}</p>;
}
