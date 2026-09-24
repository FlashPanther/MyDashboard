import { config, type Place } from '@/dashboard.config';

export type CarRoute = {
  /** Duree avec trafic, en minutes. */
  duration: number;
  /** Duree sans trafic, en minutes (null si le fournisseur ne la donne pas). */
  baseline: number | null;
  /** Minutes perdues dans le trafic (null si inconnu). */
  delay: number | null;
  distance: number;
  provider: 'osrm' | 'tomtom' | 'google';
  hasTraffic: boolean;
};

async function viaOsrm(from: Place, to: Place): Promise<CarRoute> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`OSRM a répondu ${res.status}`);
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error("OSRM n'a pas trouvé d'itinéraire");
  return {
    duration: Math.round(route.duration / 60),
    baseline: Math.round(route.duration / 60),
    delay: null,
    distance: Math.round(route.distance / 100) / 10,
    provider: 'osrm',
    hasTraffic: false,
  };
}

async function viaTomTom(from: Place, to: Place): Promise<CarRoute> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) throw new Error('TOMTOM_API_KEY manquant');
  const url =
    `https://api.tomtom.com/routing/1/calculateRoute/${from.lat},${from.lon}:${to.lat},${to.lon}/json` +
    `?key=${key}&traffic=true&travelMode=car&computeTravelTimeFor=all`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TomTom a répondu ${res.status}`);
  const data = await res.json();
  const s = data.routes?.[0]?.summary;
  if (!s) throw new Error("TomTom n'a pas trouvé d'itinéraire");
  return {
    duration: Math.round(s.travelTimeInSeconds / 60),
    baseline: Math.round((s.noTrafficTravelTimeInSeconds ?? s.travelTimeInSeconds) / 60),
    delay: Math.round((s.trafficDelayInSeconds ?? 0) / 60),
    distance: Math.round(s.lengthInMeters / 100) / 10,
    provider: 'tomtom',
    hasTraffic: true,
  };
}

async function viaGoogle(from: Place, to: Place): Promise<CarRoute> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY manquant');
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lon } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lon } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Google Routes a répondu ${res.status}`);
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error("Google Routes n'a pas trouvé d'itinéraire");
  const seconds = (v: string) => Number(String(v).replace('s', ''));
  const duration = Math.round(seconds(route.duration) / 60);
  const baseline = Math.round(seconds(route.staticDuration) / 60);
  return {
    duration,
    baseline,
    delay: Math.max(0, duration - baseline),
    distance: Math.round(route.distanceMeters / 100) / 10,
    provider: 'google',
    hasTraffic: true,
  };
}

export async function fetchCarRoute(reverse = false): Promise<CarRoute> {
  const from = reverse ? config.work : config.home;
  const to = reverse ? config.home : config.work;
  const provider = (process.env.CAR_PROVIDER ?? 'osrm').toLowerCase();

  try {
    if (provider === 'google') return await viaGoogle(from, to);
    if (provider === 'tomtom') return await viaTomTom(from, to);
    return await viaOsrm(from, to);
  } catch (error) {
    // Un fournisseur paye mal configure ne doit pas faire disparaitre le widget.
    if (provider !== 'osrm') return await viaOsrm(from, to);
    throw error;
  }
}
