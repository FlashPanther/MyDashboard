'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { config } from '@/dashboard.config';
import { useEndpoint } from '@/lib/useEndpoint';
import { planDeparture } from '@/lib/leave';
import {
  decimalHour,
  hhmm,
  minutesUntil,
  relative,
  shortDate,
  todayAt,
} from '@/lib/time';
import type { CalendarEvent } from '@/app/api/calendar/route';
import type { TrainDeparture } from '@/lib/providers/irail';

const PX_PER_HOUR = 58;
const MS_PER_DAY = 86_400_000;

/**
 * Position de l'evenement sur l'axe du jour, en heures decimales.
 * Un evenement qui deborde de la journee est coupe a ses bords : commence-t-il
 * hier, il part de 0 ; finit-il demain, il va jusqu'a 24.
 */
function spanToday(event: CalendarEvent, dayStartMs: number): { from: number; to: number } {
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  const from = start <= dayStartMs ? 0 : decimalHour(event.start);
  const to =
    end >= dayStartMs + MS_PER_DAY ? 24 : Math.max(decimalHour(event.end), from + 0.25);
  return { from, to };
}

/** "jusqu'au 30 aout" pour un evenement de plusieurs jours, sinon rien. */
function untilLabel(event: CalendarEvent, dayStartMs: number): string | null {
  // La date de fin d'un evenement "journee entiere" est exclusive.
  const lastDay = new Date(new Date(event.end).getTime() - MS_PER_DAY);
  if (lastDay.getTime() <= dayStartMs) return null;
  return `jusqu'au ${shortDate(lastDay)}`;
}

type Placed = CalendarEvent & { top: number; height: number; lane: number; lanes: number };

/**
 * Répartit les événements sur des colonnes parallèles.
 * Le nombre de colonnes est calculé par grappe de chevauchement : une réunion
 * isolée occupe toute la largeur même si deux autres se croisent ailleurs dans la journée.
 */
function place(events: CalendarEvent[], startHour: number, dayStartMs: number): Placed[] {
  const timed = events
    .filter((e) => !e.allDay)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => ({ ...e, ...spanToday(e, dayStartMs) }));

  const placed: Placed[] = [];
  let cluster: (CalendarEvent & { from: number; to: number; lane: number })[] = [];
  let clusterEnd = -Infinity;
  let laneEnds: number[] = [];

  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((e) => e.lane + 1));
    for (const event of cluster) {
      placed.push({
        ...event,
        lanes,
        top: (event.from - startHour) * PX_PER_HOUR,
        height: Math.max((event.to - event.from) * PX_PER_HOUR - 3, 24),
      });
    }
    cluster = [];
    laneEnds = [];
  };

  for (const event of timed) {
    if (event.from >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= event.from);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = event.to;
    cluster.push({ ...event, lane });
    clusterEnd = Math.max(clusterEnd, event.to);
  }
  flush();

  return placed;
}

export function DayColumn({
  now,
  atHome,
  officeEvent,
}: {
  now: number;
  atHome: boolean;
  /** L'evenement « Présentiel » du jour, s'il existe. */
  officeEvent: CalendarEvent | null;
}) {
  const calendar = useEndpoint<{ events: CalendarEvent[] }>('/api/calendar', config.refresh.calendar);
  const isWorkDay = (config.workDays as readonly number[]).includes(new Date(now).getDay());
  const trains = useEndpoint<{ departures: TrainDeparture[] }>(
    isWorkDay && !atHome ? '/api/commute/train' : null,
    config.refresh.commute,
  );

  const events = calendar.data?.events ?? [];
  const dayStartMs = new Date(now).setHours(0, 0, 0, 0);
  const dayEndMs = dayStartMs + MS_PER_DAY;

  /*
   * Un evenement compte pour aujourd'hui des qu'il chevauche la journee, et pas
   * seulement s'il y commence : autrement des vacances entamees la semaine
   * derniere disparaissent alors qu'elles sont en cours.
   */
  const today = events.filter(
    (e) => new Date(e.start).getTime() < dayEndMs && new Date(e.end).getTime() > dayStartMs,
  );
  const tomorrow = events.filter(
    (e) => !e.allDay && new Date(e.start).getTime() >= dayEndMs,
  );
  const allDay = today.filter((e) => e.allDay);

  // Le repere de depart ne concerne que le trajet du matin : passe l'heure de
  // bureau (plus un quart d'heure de tolerance), il n'a plus rien a dire.
  /*
   * L'heure a viser vient de l'evenement du jour quand il y en a un : « Présentiel »
   * commence a 09:30 un jour et 10:00 un autre, et c'est cette heure-la qui compte,
   * pas une valeur figee dans la configuration.
   */
  const arriveBy = officeEvent ? hhmm(officeEvent.start) : config.workStart;

  const plan = useMemo(() => {
    if (!trains.data) return null;
    if (now > todayAt(arriveBy).getTime() + 15 * 60_000) return null;
    return planDeparture(trains.data.departures, arriveBy, now);
  }, [trains.data, now, arriveBy]);

  const nowDecimal = decimalHour(now);
  const leaveDecimal = plan ? decimalHour(plan.leaveAt) : null;

  const spans = today.filter((e) => !e.allDay).map((e) => spanToday(e, dayStartMs));
  const startHour = Math.max(
    0,
    Math.floor(
      Math.min(nowDecimal, leaveDecimal ?? 24, ...spans.map((s) => s.from), config.calendar.dayStart),
    ),
  );
  const endHour = Math.min(
    24,
    Math.ceil(Math.max(config.calendar.dayEnd, nowDecimal + 3, ...spans.map((s) => s.to))),
  );

  const placed = useMemo(
    () => place(today, startHour, dayStartMs),
    [today, startHour, dayStartMs],
  );
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  // Amene la ligne "maintenant" dans le champ de vision au premier rendu.
  const scroller = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || !scroller.current || calendar.isLoading) return;
    scrolled.current = true;
    scroller.current.scrollTop = Math.max(0, (nowDecimal - startHour) * PX_PER_HOUR - 90);
  }, [calendar.isLoading, nowDecimal, startHour]);

  return (
    <section className="panel flex min-h-0 w-full flex-col">
      <header className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-2.5">
        <h2 className="eyebrow">
          <a
            href={`https://calendar.google.com/calendar/r/${config.calendar.view}`}
            target="_blank"
            rel="noreferrer"
            title="Ouvrir Google Agenda"
            className="inline-flex items-baseline gap-1 transition-colors hover:text-ink"
          >
            Aujourd&rsquo;hui
            <span aria-hidden className="text-[9px]">
              &#8599;
            </span>
          </a>
        </h2>
        <span className="tnum font-mono text-xs text-muted">
          {calendar.data ? `${today.filter((e) => !e.allDay).length} rendez-vous` : null}
        </span>
      </header>

      {allDay.length > 0 && (
        <ul className="flex max-h-[4.75rem] flex-wrap gap-2 overflow-y-auto border-b border-rule px-4 py-2.5">
          {allDay.map((event) => {
            const until = untilLabel(event, dayStartMs);
            return (
              <li key={event.id}>
                <a
                  href={event.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`${event.title} — ${event.calendar}`}
                  className="block border border-sky/40 bg-sky/10 px-2 py-1 text-xs font-medium text-sky transition-colors hover:bg-sky/20"
                >
                  {event.title}
                  {until && <span className="ml-1.5 font-mono text-[11px] opacity-70">{until}</span>}
                </a>
              </li>
            );
          })}
        </ul>
      )}

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {calendar.notConnected ? (
          <p className="py-2 text-sm text-muted">
            Ton agenda apparaîtra ici.{' '}
            <a href="/api/auth/google" className="text-amber underline-offset-2 hover:underline">
              Relier mon compte Google
            </a>
          </p>
        ) : calendar.error ? (
          <p className="text-sm text-rose">{calendar.error}</p>
        ) : (
          <div className="relative" style={{ height: hours.length * PX_PER_HOUR }}>
            {hours.map((hour, index) => (
              <div
                key={hour}
                className="absolute left-0 right-0 flex items-start gap-3"
                style={{ top: index * PX_PER_HOUR }}
              >
                <span className="tnum -mt-[6px] w-8 shrink-0 font-mono text-[11px] text-muted">
                  {String(hour).padStart(2, '0')}
                </span>
                <span className="h-px flex-1 bg-rule" />
              </div>
            ))}

            <div className="absolute bottom-0 left-11 right-0 top-0">
              {placed.map((event) => (
                <EventBlock key={event.id} event={event} now={now} />
              ))}
            </div>

            {leaveDecimal !== null && leaveDecimal >= startHour && leaveDecimal < endHour && plan && (
              <LeaveMarker
                top={(leaveDecimal - startHour) * PX_PER_HOUR}
                plan={plan}
                now={now}
              />
            )}

            {nowDecimal >= startHour && nowDecimal < endHour && (
              <NowLine top={(nowDecimal - startHour) * PX_PER_HOUR} now={now} />
            )}
          </div>
        )}

        {tomorrow.length > 0 && (
          <p className="mt-4 border-t border-rule pt-3 font-mono text-xs text-muted">
            Demain{' '}
            <a
              href={tomorrow[0].url}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              <span className="text-ink">{hhmm(tomorrow[0].start)}</span> {tomorrow[0].title}
            </a>
            {tomorrow.length > 1 && ` · +${tomorrow.length - 1}`}
          </p>
        )}
      </div>
    </section>
  );
}

function EventBlock({ event, now }: { event: Placed; now: number }) {
  const started = new Date(event.start).getTime() <= now;
  const ended = new Date(event.end).getTime() <= now;
  const live = started && !ended;
  // Sous 36 px il n'y a la place que pour une ligne : heure et titre fusionnent.
  const compact = event.height < 36;

  /*
   * Le lien du titre porte un ::after qui recouvre tout le bloc : la surface
   * cliquable est le bloc entier, mais le nom accessible du lien reste le titre
   * de l'evenement. Le lien "rejoindre" repasse au-dessus avec z-10.
   */
  const stretched = (
    <a
      href={event.url}
      target="_blank"
      rel="noreferrer"
      className="after:absolute after:inset-0 hover:underline"
    >
      {event.title}
    </a>
  );

  return (
    <article
      title={[event.title, event.location, event.calendar].filter(Boolean).join(" — ")}
      className={[
        'absolute overflow-hidden border-l-2 px-2 py-0.5 transition-colors',
        live ? 'border-amber bg-amber/15 hover:bg-amber/25' : 'border-sky/70 bg-panel-soft hover:bg-sky/10',
        ended ? 'opacity-40' : '',
      ].join(' ')}
      style={{
        top: event.top,
        height: event.height,
        left: `${(event.lane / event.lanes) * 100}%`,
        width: `calc(${100 / event.lanes}% - 4px)`,
      }}
    >
      {compact ? (
        <p className="truncate text-[12px] leading-[1.35] text-ink">
          <span className="tnum font-mono text-[11px] text-muted">{hhmm(event.start)}</span>{' '}
          {stretched}
        </p>
      ) : (
        <>
          <p className="truncate text-[13px] font-medium leading-tight text-ink">{stretched}</p>
          <p className="tnum truncate font-mono text-[11px] text-muted">
            {hhmm(event.start)}
            {event.location ? ` · ${event.location}` : ''}
          </p>
          {event.meetingUrl && event.height > 52 && (
            <a
              href={event.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="relative z-10 font-mono text-[11px] text-sky hover:underline"
            >
              rejoindre
            </a>
          )}
        </>
      )}
    </article>
  );
}

function NowLine({ top, now }: { top: number; now: number }) {
  return (
    <div className="pointer-events-none absolute left-0 right-0 z-20 flex items-start" style={{ top }}>
      <span className="tnum -mt-[6px] w-8 shrink-0 bg-panel pr-1 text-right font-mono text-[11px] font-semibold text-amber">
        {hhmm(now)}
      </span>
      <span className="ml-3 h-px flex-1 bg-amber" />
    </div>
  );
}

function LeaveMarker({
  top,
  plan,
  now,
}: {
  top: number;
  plan: NonNullable<ReturnType<typeof planDeparture>>;
  now: number;
}) {
  const minutes = minutesUntil(plan.leaveAt, now);
  const imminent = minutes >= 0 && minutes <= 15;
  const passed = minutes < 0;
  const tone = passed ? 'border-muted/60' : plan.late ? 'border-rose' : 'border-amber';
  const text = passed ? 'text-muted' : plan.late ? 'text-rose' : 'text-amber';

  return (
    <div
      className={`absolute left-11 right-0 z-30 ${passed ? 'opacity-60' : ''}`}
      style={{ top: top - 11 }}
    >
      <div
        className={`flex items-baseline gap-2 border-y border-dashed bg-panel px-2 py-[3px] ${tone}`}
      >
        <span
          className={`shrink-0 font-display text-[11px] font-extrabold uppercase tracking-[0.2em] ${text} ${
            imminent && !passed ? 'pulse-amber' : ''
          }`}
        >
          Partir {hhmm(plan.leaveAt)}
        </span>
        <span className="tnum truncate font-mono text-[11px] text-muted">
          {relative(plan.leaveAt, now)} · train {hhmm(plan.train.departure)}
          {plan.train.platform ? ` voie ${plan.train.platform}` : ''}
          {plan.late ? ' · trop tard' : ` · ${plan.slack} min de marge`}
        </span>
      </div>
    </div>
  );
}
