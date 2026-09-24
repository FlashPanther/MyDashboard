'use client';

import { config } from '@/dashboard.config';
import { Panel, Empty } from '@/components/Panel';
import { useEndpoint } from '@/lib/useEndpoint';
import type { AnalyticsPayload, PropertyStats } from '@/lib/providers/analytics';

const fmt = new Intl.NumberFormat(config.locale);

export function AudienceWidget() {
  const { data, error, notConnected, scopeMissing, apiDisabled, disabledService, activationUrl } =
    useEndpoint<AnalyticsPayload>('/api/analytics', config.refresh.analytics);

  const serviceLabel =
    disabledService === 'analyticsadmin.googleapis.com'
      ? 'Google Analytics Admin API'
      : disabledService === 'analyticsdata.googleapis.com'
        ? 'Google Analytics Data API'
        : (disabledService ?? "l'API Google Analytics");
  // Le projet est dans l'URL d'activation : le dire evite d'activer au mauvais endroit.
  const project = activationUrl?.match(/project=(\d+)/)?.[1];

  return (
    <Panel
      title="Audience"
      href="https://analytics.google.com/"
      hrefLabel="Ouvrir Google Analytics"
      meta={
        data ? (
          <>
            <span className={`font-semibold ${data.liveTotal > 0 ? 'text-amber' : 'text-muted'}`}>
              {data.liveTotal}
            </span>{' '}
            en ligne
          </>
        ) : null
      }
      error={scopeMissing || apiDisabled ? null : error}
      notConnected={notConnected}
    >
      {/* Hauteur reservee : les proprietes arrivent apres le reste et ne
          doivent rien deplacer. */}
      <div className="h-44 overflow-y-auto">
        {scopeMissing ? (
          <Setup>
            Ton compte est relié, mais sans l&rsquo;autorisation Analytics.{' '}
            <a href="/api/auth/google" className="text-amber underline-offset-2 hover:underline">
              Relier à nouveau
            </a>{' '}
            pour l&rsquo;accorder.
          </Setup>
        ) : apiDisabled ? (
          <Setup>
            <strong className="font-semibold text-ink">{serviceLabel}</strong> n&rsquo;est pas
            activée{project ? ` dans le projet ${project}` : ' dans ton projet Cloud'}.{' '}
            <a
              href={
                activationUrl ??
                'https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com'
              }
              target="_blank"
              rel="noreferrer"
              className="text-amber underline-offset-2 hover:underline"
            >
              L&rsquo;activer
            </a>
            . Compte quelques minutes de propagation après l&rsquo;activation.
          </Setup>
        ) : !data ? (
          <p className="font-mono text-sm text-muted">Chargement…</p>
        ) : data.properties.length === 0 ? (
          <Empty>Aucune propriété GA4 accessible avec ce compte.</Empty>
        ) : (
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-wider text-muted">
                <th className="pb-1.5 text-left font-normal">Projet</th>
                <th className="w-[4.5rem] whitespace-nowrap pb-1.5 pr-2 text-right font-normal">En ligne</th>
                <th className="w-16 pb-1.5 pr-2 text-right font-normal">7 jours</th>
                <th className="w-24 pb-1.5 text-right font-normal">28 j</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {data.properties.map((property) => (
                <Row key={property.id} property={property} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}

function Row({ property }: { property: PropertyStats }) {
  const title = `${property.name} · ${fmt.format(property.users7d)} utilisateurs, ${fmt.format(
    property.sessions7d,
  )} sessions, ${fmt.format(property.pageViews7d)} pages vues sur 7 jours`;

  return (
    <tr title={title} className="transition-colors hover:bg-panel-soft">
      <td className="truncate py-1.5 pr-2 text-[13px] text-ink">{property.name}</td>
      <td
        className={`tnum py-1.5 pr-2 text-right font-mono text-[13px] ${
          property.liveUsers > 0 ? 'font-semibold text-amber' : 'text-muted'
        }`}
      >
        {property.liveUsers}
      </td>
      <td className="tnum py-1.5 pr-2 text-right font-mono text-[12px] text-ink">
        {fmt.format(property.users7d)}
      </td>
      <td className="py-1.5 pl-2">
        <Sparkline values={property.dailyUsers} />
      </td>
    </tr>
  );
}

/**
 * Tendance sur 28 jours : une seule serie, un seul trait, aucune valeur
 * ecrite — c'est la forme qui se lit, les chiffres sont dans l'infobulle.
 */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const count = values.length;
  const points = values
    .map((v, i) => `${(i / Math.max(1, count - 1)) * 100},${100 - (v / max) * 100}`)
    .join(' ');

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="ml-auto block h-5 w-20"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-sky)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Setup({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted">{children}</p>;
}
