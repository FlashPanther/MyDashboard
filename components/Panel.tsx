'use client';

import type { ReactNode } from 'react';

type PanelProps = {
  title: string;
  /** Page complete derriere le titre : Gmail, Google Tasks, l'agenda… */
  href?: string;
  /** Ce que le lien ouvre, en clair, pour l'infobulle et les lecteurs d'ecran. */
  hrefLabel?: string;
  /** Valeur courte affichee a droite du titre : compteur, temperature, statut. */
  meta?: ReactNode;
  error?: string | null;
  notConnected?: boolean;
  loading?: boolean;
  /** Occupe la hauteur restante de la colonne. */
  grow?: boolean;
  children: ReactNode;
};

export function Panel({
  title,
  href,
  hrefLabel,
  meta,
  error,
  notConnected,
  loading,
  grow,
  children,
}: PanelProps) {
  return (
    <section className={`panel flex min-h-0 w-full flex-col ${grow ? 'flex-1' : ''}`}>
      <header className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-2.5">
        <h2 className="eyebrow shrink-0">
          <PanelLink title={title} href={href} hrefLabel={hrefLabel} />
        </h2>
        <div className="tnum min-w-0 truncate font-mono text-xs text-muted">{meta}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
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
function PanelLink({ title, href, hrefLabel }: { title: string; href?: string; hrefLabel?: string }) {
  if (!href) return <>{title}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={hrefLabel}
      className="inline-flex items-baseline gap-1 transition-colors hover:text-ink"
    >
      {title}
      <span aria-hidden className="text-[9px]">
        &#8599;
      </span>
    </a>
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
