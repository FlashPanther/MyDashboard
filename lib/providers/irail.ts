import { config } from '@/dashboard.config';

export type TrainDeparture = {
  /** Heure de depart theorique, epoch ms. */
  departure: number;
  /** Retard au depart, en minutes. */
  delay: number;
  arrival: number;
  /** Duree porte-a-porte annoncee, en minutes. */
  duration: number;
  platform: string | null;
  platformChanged: boolean;
  direction: string;
  vehicle: string;
  transfers: number;
  canceled: boolean;
};

const IRAIL = 'https://api.irail.be/connections/';

function toInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchTrains(reverse = false): Promise<TrainDeparture[]> {
  const { train } = config;
  const params = new URLSearchParams({
    from: reverse ? train.to : train.from,
    to: reverse ? train.from : train.to,
    format: 'json',
    lang: 'fr',
    timeSel: 'depart',
    results: '5',
  });

  const res = await fetch(`${IRAIL}?${params}`, {
    headers: {
      'User-Agent': process.env.IRAIL_USER_AGENT ?? 'myDashboard/1.0 (contact non renseigne)',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`iRail a répondu ${res.status}`);
  const data = await res.json();

  const connections: any[] = Array.isArray(data.connection) ? data.connection : [];

  return connections.map((c) => {
    const departure = toInt(c.departure.time) * 1000;
    const arrival = toInt(c.arrival.time) * 1000;
    return {
      departure,
      delay: Math.round(toInt(c.departure.delay) / 60),
      arrival,
      duration: Math.round(toInt(c.duration) / 60),
      platform: c.departure.platform && c.departure.platform !== '?' ? c.departure.platform : null,
      platformChanged: c.departure.platforminfo?.normal === '0',
      direction: c.departure.direction?.name ?? c.arrival.station ?? '',
      vehicle: (c.departure.vehicle ?? '').replace(/^BE\.NMBS\./, ''),
      transfers: toInt(c.vias?.number),
      canceled: toInt(c.departure.canceled) === 1 || toInt(c.arrival.canceled) === 1,
    };
  });
}
