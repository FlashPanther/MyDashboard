'use client';

import { useState } from 'react';
import { config } from '@/dashboard.config';
import { Panel, Empty } from '@/components/Panel';
import { useEndpoint } from '@/lib/useEndpoint';
import { hhmm, minutesUntil, relative } from '@/lib/time';
import type { TrainDeparture } from '@/lib/providers/irail';
import type { CarRoute } from '@/lib/providers/car';

type TrainPayload = { from: string; to: string; departures: TrainDeparture[] };
type CarPayload = { from: string; to: string; route: CarRoute };

export function CommuteWidget({ now }: { now: number }) {
  // Le matin on part au bureau, l'apres-midi on rentre.
  const [direction, setDirection] = useState<'aller' | 'retour'>(
    new Date(now).getHours() < 13 ? 'aller' : 'retour',
  );
  const suffix = direction === 'retour' ? '?sens=retour' : '';

  const trains = useEndpoint<TrainPayload>(`/api/commute/train${suffix}`, config.refresh.commute);
  const car = useEndpoint<CarPayload>(`/api/commute/car${suffix}`, config.refresh.commute);

  const upcoming = (trains.data?.departures ?? [])
    .filter((d) => minutesUntil(d.departure, now) > -2)
    .slice(0, 5);

  return (
    <Panel
      title="Trajet"
      grow
      href={config.links.train}
      hrefLabel="Ouvrir le planificateur SNCB"
      meta={
        <span className="inline-flex overflow-hidden rounded-sm border border-rule">
          {(['aller', 'retour'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDirection(value)}
              aria-pressed={direction === value}
              className={`px-2 py-0.5 text-[11px] uppercase tracking-wider transition-colors ${
                direction === value ? 'bg-ink text-ground' : 'text-muted hover:text-ink'
              }`}
            >
              {value}
            </button>
          ))}
        </span>
      }
      error={trains.error}
    >
      <p className="tnum mb-2 font-mono text-[11px] text-muted">
        {trains.data ? `${trains.data.from} → ${trains.data.to}` : ''}
      </p>

      {/* Meme reservation de hauteur que les autres listes : sur ecran etroit,
          l'arrivee des horaires ne doit pas repousser les panneaux suivants. */}
      <div className="h-96 overflow-y-auto lg:h-auto lg:overflow-visible">
        {!trains.data ? (
          <p className="font-mono text-sm text-muted">Chargement…</p>
        ) : upcoming.length === 0 ? (
          <Empty>Plus de train dans cette direction.</Empty>
        ) : (
          <ul className="divide-y divide-rule">
            {upcoming.map((train, index) => (
              <TrainRow
                key={`${train.departure}-${index}`}
                train={train}
                now={now}
                lead={index === 0}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex min-h-[2.5rem] items-baseline justify-between gap-3 border-t border-rule pt-2.5">
        <span className="eyebrow">Voiture</span>
        {car.error ? (
          <span className="font-mono text-[11px] text-rose">indisponible</span>
        ) : car.data ? (
          <span className="tnum text-right font-mono text-xs text-ink">
            {car.data.route.duration} min
            {car.data.route.delay ? (
              <span className={car.data.route.delay > 5 ? 'text-rose' : 'text-amber'}>
                {' '}
                +{car.data.route.delay} trafic
              </span>
            ) : car.data.route.hasTraffic ? (
              <span className="text-jade"> fluide</span>
            ) : (
              <span className="text-muted"> sans trafic</span>
            )}
            <span className="text-muted"> · {car.data.route.distance} km</span>
          </span>
        ) : (
          <span className="font-mono text-[11px] text-muted">…</span>
        )}
      </div>
    </Panel>
  );
}

function TrainRow({ train, now, lead }: { train: TrainDeparture; now: number; lead: boolean }) {
  const real = train.departure + train.delay * 60_000;

  return (
    <li className="flex items-baseline gap-3 py-2">
      <span
        className={`tnum font-mono text-lg leading-none ${
          train.canceled ? 'text-muted line-through' : lead ? 'text-ink' : 'text-ink/70'
        }`}
      >
        {hhmm(train.departure)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] leading-tight text-ink">{train.direction}</span>
        <span className="tnum block font-mono text-[11px] text-muted">
          {train.transfers > 0 ? `${train.transfers} corr.` : 'direct'} · arrivée{' '}
          {hhmm(train.arrival)}
        </span>
      </span>

      <span className="shrink-0 text-right">
        {train.canceled ? (
          <span className="font-display text-[11px] font-bold uppercase tracking-wider text-rose">
            supprimé
          </span>
        ) : train.delay > 0 ? (
          <span className="tnum block font-mono text-xs text-amber">
            +{train.delay}&prime; → {hhmm(real)}
          </span>
        ) : (
          <span className="block font-mono text-[11px] text-jade">à l&rsquo;heure</span>
        )}
        <span className="tnum block font-mono text-[11px] text-muted">
          {train.platform ? `voie ${train.platform}` : '—'} · {relative(real, now)}
        </span>
      </span>
    </li>
  );
}
