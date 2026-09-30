'use client';

import { config } from '@/dashboard.config';
import { CloudSun } from 'lucide-react';
import { Panel } from '@/components/Panel';
import { WeatherIcon } from '@/components/WeatherIcon';
import { useEndpoint } from '@/lib/useEndpoint';
import { hhmm, weekdayShort } from '@/lib/time';
import { weatherLabel } from '@/lib/providers/weather';
import type { WeatherHour, WeatherPayload } from '@/lib/providers/weather';

/** Open-Meteo ne dit pas si une heure est diurne : on la situe entre lever et coucher. */
function isDaylight(hour: WeatherHour, sunrise: string, sunset: string): boolean {
  const time = hour.time.slice(11, 16);
  return time >= sunrise.slice(11, 16) && time < sunset.slice(11, 16);
}

function tooltip(hour: WeatherHour): string {
  return `${hhmm(hour.time)} · ${weatherLabel(hour.code)} · ${Math.round(hour.temperature)}° · ${hour.precipitationProbability} % de pluie`;
}

export function WeatherWidget() {
  const { data, error } = useEndpoint<WeatherPayload>('/api/weather', config.refresh.weather);

  const hours = data?.hours.slice(0, 10) ?? [];
  // Une rangee de jauges vides ressemble a un graphique casse : quand rien n'est
  // annonce, une phrase dit la meme chose et rend sa place au reste.
  const peak = Math.max(0, ...hours.map((h) => h.precipitationProbability));

  return (
    <Panel
      title="Météo"
      icon={CloudSun}
      href={config.links.weather}
      hrefLabel="Ouvrir les prévisions complètes"
      meta={
        data
          ? `${data.place} · ${Math.round(data.today.min)}° / ${Math.round(data.today.max)}°`
          : null
      }
    >
      <div className="flex h-[22rem] flex-col">
        {error ? (
          <p className="text-sm text-rose">{error}</p>
        ) : !data ? (
          <p className="font-mono text-sm text-muted">Chargement…</p>
        ) : (
          <>
            <div>
              <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <WeatherIcon code={data.now.code} isDay={data.now.isDay} size={48} />
                {/* Chiffres proportionnels : a cette taille, tabulaire fait des trous. */}
                <p className="font-display text-5xl font-extrabold leading-none text-ink">
                  {Math.round(data.now.temperature)}
                  <span className="text-2xl text-muted">°</span>
                </p>
              </div>
              <p className="tnum shrink-0 text-right font-mono text-[11px] leading-snug text-muted">
                lever {hhmm(data.today.sunrise)}
                <br />
                coucher {hhmm(data.today.sunset)}
              </p>
            </div>
              <p className="mt-2 text-[13px] leading-tight text-ink">{data.now.label}</p>
              <p className="tnum font-mono text-[11px] text-muted">
                ressenti {Math.round(data.now.feelsLike)}° · vent {Math.round(data.now.wind)} km/h
              </p>
            </div>

            {/*
             * Deux blocs volontairement dissemblables : les heures forment un
             * bandeau continu, les jours des cellules detachees. Le temps
             * continu se lit comme une bande, les jours comme des unites.
             */}
            <div className="mt-3 flex flex-1 flex-col justify-center gap-1 border-t border-rule pt-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="eyebrow">Heure par heure</span>
                <span className="font-mono text-[10px] text-muted">
                  {peak > 0
                    ? 'ligne : pluie, échelle 0–100 %'
                    : hours.length > 0
                      ? `aucune pluie avant ${hhmm(hours[hours.length - 1].time)}`
                      : ''}
                </span>
              </div>

              <div className="flex items-center">
                {hours.map((hour) => (
                  <div
                    key={hour.time}
                    title={tooltip(hour)}
                    className={`flex flex-1 flex-col items-center ${peak > 0 ? 'gap-1' : 'gap-2'}`}
                  >
                    <WeatherIcon
                      code={hour.code}
                      isDay={isDaylight(hour, data.today.sunrise, data.today.sunset)}
                      size={peak > 0 ? 20 : 26}
                    />
                    <span className="tnum font-mono text-[11px] leading-none text-ink">
                      {Math.round(hour.temperature)}°
                    </span>
                  </div>
                ))}
              </div>

              {peak > 0 && <RainLine hours={hours} />}

              <div className="flex">
                {hours.map((hour) => (
                  <span
                    key={hour.time}
                    title={tooltip(hour)}
                    className="tnum flex-1 text-center font-mono text-[10px] leading-none text-muted"
                  >
                    {hhmm(hour.time).slice(0, 2)}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-3 border-t border-rule pt-2">
              <span className="eyebrow">Sept jours</span>
              <ul className="mt-1.5 flex items-stretch gap-[3px]">
                {data.days.slice(0, 7).map((day, index) => (
                  <li
                    key={day.date}
                    title={`${weekdayShort(day.date)} · ${weatherLabel(day.code)} · ${Math.round(day.max)}° / ${Math.round(day.min)}° · ${day.precipitationProbability} % de pluie`}
                    className={`flex flex-1 flex-col items-center gap-1 rounded-sm border py-1.5 ${
                      index === 0 ? 'border-amber/50 bg-amber/10' : 'border-rule bg-panel-soft/50'
                    }`}
                  >
                    <span
                      className={`font-mono text-[10px] leading-none ${
                        index === 0 ? 'text-amber' : 'text-muted'
                      }`}
                    >
                      {index === 0 ? 'auj.' : weekdayShort(day.date)}
                    </span>
                    <WeatherIcon code={day.code} size={20} />
                    <span className="tnum font-mono text-[11px] leading-none text-ink">
                      {Math.round(day.max)}°
                    </span>
                    <span className="tnum font-mono text-[10px] leading-none text-muted">
                      {Math.round(day.min)}°
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

/**
 * Probabilite de pluie : une ligne continue sur toute la largeur du bandeau,
 * calee sur le meme axe de temps que les pictos. Une seule mesure, une seule
 * echelle 0-100 %, jamais superposee a la temperature.
 */
function RainLine({ hours }: { hours: WeatherHour[] }) {
  const count = hours.length;
  const x = (index: number) => ((index + 0.5) / count) * 100;
  const y = (probability: number) => 100 - probability;

  const points = hours.map((hour, i) => `${x(i)},${y(hour.precipitationProbability)}`).join(' ');
  const peakIndex = hours.reduce(
    (best, hour, i) =>
      hour.precipitationProbability > hours[best].precipitationProbability ? i : best,
    0,
  );
  const peak = hours[peakIndex].precipitationProbability;

  return (
    <div className="relative h-12">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {/* Ligne de base : le 0 %. */}
        <line
          x1="0"
          y1="100"
          x2="100"
          y2="100"
          stroke="var(--color-rule)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-sky)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* Seul le maximum est etiquete : une valeur sur chaque point ne se lit pas. */}
      <span
        className="absolute -translate-x-1/2 -translate-y-full pb-1 font-mono text-[10px] leading-none text-sky"
        style={{ left: `${x(peakIndex)}%`, top: `${y(peak)}%` }}
      >
        {peak}%
      </span>
    </div>
  );
}
