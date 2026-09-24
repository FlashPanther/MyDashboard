import { config } from '@/dashboard.config';

const TZ = config.timezone;
const LOCALE = config.locale;

export function hhmm(value: Date | string | number): string {
  return new Date(value).toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
}

export function longDate(value: Date | string | number): string {
  return new Date(value).toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  });
}

/** Minutes entieres entre maintenant et une date (negatif si passe). */
export function minutesUntil(value: Date | string | number, from = Date.now()): number {
  return Math.round((new Date(value).getTime() - from) / 60_000);
}

const MINUTES_PER_DAY = 1440;

/**
 * Ecart lisible : "dans 8 min", "il y a 3 h 20", "il y a 4 j".
 * Au-dela d'une semaine l'ecart ne dit plus rien d'utile : on rend la date.
 * Les minutes ne sont gardees que sous six heures, la ou elles servent encore
 * (un train dans 1 h 36) ; plus loin elles ne font qu'encombrer.
 */
export function relative(value: Date | string | number, from = Date.now()): string {
  const minutes = minutesUntil(value, from);
  const abs = Math.abs(minutes);

  if (abs < 1) return 'maintenant';

  let body: string;
  if (abs < 60) {
    body = `${abs} min`;
  } else if (abs < 360) {
    const hours = Math.floor(abs / 60);
    const rest = abs % 60;
    body = rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
  } else if (abs < MINUTES_PER_DAY - 30) {
    // Le seuil est a 23 h 30 : arrondi a l'heure, au-dela on afficherait "24 h".
    body = `${Math.round(abs / 60)} h`;
  } else if (abs < 7 * MINUTES_PER_DAY) {
    body = `${Math.max(1, Math.round(abs / MINUTES_PER_DAY))} j`;
  } else {
    return new Date(value).toLocaleDateString(LOCALE, {
      day: 'numeric',
      month: 'short',
      timeZone: TZ,
    });
  }

  return minutes < 0 ? `il y a ${body}` : `dans ${body}`;
}

/** Heure decimale locale (14h30 -> 14.5), pour placer un point sur l'axe. */
export function decimalHour(value: Date | string | number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  }).formatToParts(new Date(value));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour + minute / 60;
}

/** "lun." — nom de jour court, pour la prevision a plusieurs jours. */
export function weekdayShort(value: Date | string | number): string {
  return new Date(value).toLocaleDateString(LOCALE, { weekday: 'short', timeZone: TZ });
}

/** "30 août" : pour situer la fin d'un evenement qui deborde du jour. */
export function shortDate(value: Date | string | number): string {
  return new Date(value).toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  });
}

/** "2026/8/25" dans le fuseau configure : le segment de date des URL Google Agenda. */
export function ymdPath(value: Date | string | number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: TZ,
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}/${Number(part('month'))}/${Number(part('day'))}`;
}

/** Convertit "09:00" en Date d'aujourd'hui. */
export function todayAt(clock: string): Date {
  const [hours, minutes] = clock.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes ?? 0, 0, 0);
  return date;
}
