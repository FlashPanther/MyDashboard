'use client';

import { config } from '@/dashboard.config';
import { Panel } from '@/components/Panel';
import { WeatherIcon } from '@/components/WeatherIcon';
import { useEndpoint } from '@/lib/useEndpoint';
import { weekdayShort } from '@/lib/time';
import { weatherLabel, type WeatherPayload } from '@/lib/providers/weather';

/**
 * Les sept jours en liste verticale. C'est la forme des jours ou le trajet
 * disparait : une colonne entiere pour un seul panneau etirerait la version
 * compacte, alors qu'une liste occupe la hauteur en disant davantage.
 */
export function WeekWidget() {
  const { data, error } = useEndpoint<WeatherPayload>('/api/weather', config.refresh.weather);

  return (
    <Panel
      title="Sept jours"
      grow
      href={config.links.weather}
      hrefLabel="Ouvrir les prévisions complètes"
      meta={
        data
          ? `${Math.round(Math.min(...data.days.slice(0, 7).map((d) => d.min)))}° → ${Math.round(
              Math.max(...data.days.slice(0, 7).map((d) => d.max)),
            )}° sur la semaine`
          : null
      }
      error={error}
    >
      {!data ? (
        <p className="font-mono text-sm text-muted">Chargement…</p>
      ) : (
        <ul className="flex h-full flex-col justify-between">
          {data.days.slice(0, 7).map((day, index) => (
            <li
              key={day.date}
              className={`flex items-center gap-3 border-b border-rule py-1.5 last:border-0 ${
                index === 0 ? 'text-ink' : ''
              }`}
            >
              <span
                className={`w-12 shrink-0 font-mono text-[11px] ${
                  index === 0 ? 'text-amber' : 'text-muted'
                }`}
              >
                {index === 0 ? 'auj.' : weekdayShort(day.date)}
              </span>

              <WeatherIcon code={day.code} size={26} className="shrink-0" />

              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                {weatherLabel(day.code)}
              </span>

              <span className="tnum shrink-0 font-mono text-[11px] text-sky">
                {day.precipitationProbability > 0 ? `${day.precipitationProbability} %` : ''}
              </span>

              <span className="tnum w-16 shrink-0 text-right font-mono text-[13px]">
                <span className="text-ink">{Math.round(day.max)}°</span>{' '}
                <span className="text-muted">{Math.round(day.min)}°</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
