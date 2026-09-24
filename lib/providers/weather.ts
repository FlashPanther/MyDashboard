import { config } from '@/dashboard.config';

export type WeatherNow = {
  temperature: number;
  feelsLike: number;
  code: number;
  label: string;
  isDay: boolean;
  wind: number;
};

export type WeatherHour = {
  time: string;
  temperature: number;
  precipitation: number;
  precipitationProbability: number;
  code: number;
};

export type WeatherDay = {
  date: string;
  code: number;
  min: number;
  max: number;
  precipitationProbability: number;
};

export type WeatherPayload = {
  place: string;
  now: WeatherNow;
  hours: WeatherHour[];
  today: { min: number; max: number; sunrise: string; sunset: string; precipitation: number };
  days: WeatherDay[];
  /** Modele qui a fourni « maintenant » et les prochaines heures. */
  model: string;
};

/** Codes WMO utilises par Open-Météo. */
const WMO: Record<number, string> = {
  0: 'Ciel dégagé',
  1: 'Peu nuageux',
  2: 'Partiellement nuageux',
  3: 'Couvert',
  45: 'Brouillard',
  48: 'Brouillard givrant',
  51: 'Bruine légère',
  53: 'Bruine',
  55: 'Bruine dense',
  56: 'Bruine verglaçante',
  57: 'Bruine verglaçante dense',
  61: 'Pluie faible',
  63: 'Pluie',
  65: 'Forte pluie',
  66: 'Pluie verglaçante',
  67: 'Pluie verglaçante forte',
  71: 'Neige faible',
  73: 'Neige',
  75: 'Forte neige',
  77: 'Grains de neige',
  80: 'Averses',
  81: 'Averses marquées',
  82: 'Averses violentes',
  85: 'Averses de neige',
  86: 'Fortes averses de neige',
  95: 'Orage',
  96: 'Orage et grêle',
  99: 'Orage violent',
};

export function weatherLabel(code: number): string {
  return WMO[code] ?? 'Temps indéterminé';
}

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

async function query(params: URLSearchParams): Promise<any> {
  // Surtout pas de cache ici : « maintenant » doit vouloir dire maintenant.
  const res = await fetch(`${ENDPOINT}?${params}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Open-Meteo a répondu ${res.status}`);
  return res.json();
}

export async function fetchWeather(): Promise<WeatherPayload> {
  const { home, timezone } = config;
  const place = { latitude: String(home.lat), longitude: String(home.lon), timezone };

  const wide = new URLSearchParams({
    ...place,
    current: 'temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code',
    daily:
      'temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max,weather_code,sunrise,sunset',
    forecast_days: '7',
  });

  /*
   * Le modele global voit la Belgique de trop loin : il annonce « couvert » la
   * ou le ciel est degage. Le modele configure (ICON-D2, maille de 2,2 km) est
   * bien plus fin, mais ne porte que sur ~48 h — il sert donc pour maintenant
   * et les prochaines heures, le modele global gardant les sept jours.
   */
  const near = new URLSearchParams({
    ...place,
    current: 'temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code',
    forecast_days: '2',
    models: config.weather.shortRangeModel,
  });

  const [wideData, nearData] = await Promise.all([
    query(wide),
    query(near).catch(() => null),
  ]);

  // Repli sur le modele global si le modele fin ne couvre pas ce point.
  const short =
    nearData?.current?.weather_code != null && Array.isArray(nearData?.hourly?.time)
      ? nearData
      : wideData;

  /*
   * Les heures renvoyees sont en heure locale ; comparer a un horodatage UTC
   * decalait la bande de deux heures en ete. La reference est donc l'heure que
   * l'API dit elle-meme etre « maintenant ».
   */
  const reference = String(short.current?.time ?? '').slice(0, 13);
  const startIndex = Math.max(
    0,
    (short.hourly.time as string[]).findIndex((t) => t.slice(0, 13) >= reference),
  );

  const hours: WeatherHour[] = (short.hourly.time as string[])
    .slice(startIndex, startIndex + 12)
    .map((time, i) => ({
      time,
      temperature: short.hourly.temperature_2m[startIndex + i],
      precipitation: short.hourly.precipitation[startIndex + i],
      precipitationProbability: short.hourly.precipitation_probability[startIndex + i] ?? 0,
      code: short.hourly.weather_code[startIndex + i],
    }))
    .filter((h) => h.temperature !== null && h.code !== null);

  return {
    place: home.label,
    model: short === nearData ? config.weather.shortRangeModel : 'best_match',
    now: {
      temperature: short.current.temperature_2m,
      feelsLike: short.current.apparent_temperature,
      code: short.current.weather_code,
      label: weatherLabel(short.current.weather_code),
      isDay: short.current.is_day === 1,
      wind: short.current.wind_speed_10m,
    },
    hours,
    days: (wideData.daily.time as string[]).map((date, i) => ({
      date,
      code: wideData.daily.weather_code[i],
      min: wideData.daily.temperature_2m_min[i],
      max: wideData.daily.temperature_2m_max[i],
      precipitationProbability: wideData.daily.precipitation_probability_max[i] ?? 0,
    })),
    today: {
      min: wideData.daily.temperature_2m_min[0],
      max: wideData.daily.temperature_2m_max[0],
      precipitation: wideData.daily.precipitation_sum[0],
      sunrise: wideData.daily.sunrise[0],
      sunset: wideData.daily.sunset[0],
    },
  };
}
