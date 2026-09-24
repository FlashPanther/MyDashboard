import { googleFetch } from '@/lib/google/oauth';
import { config } from '@/dashboard.config';

export type PropertyStats = {
  /** Identifiant GA4, de la forme "properties/123456". */
  id: string;
  name: string;
  liveUsers: number;
  users7d: number;
  sessions7d: number;
  pageViews7d: number;
  /** Utilisateurs actifs par jour sur 28 jours, du plus ancien au plus recent. */
  dailyUsers: number[];
};

export type AnalyticsPayload = {
  properties: PropertyStats[];
  liveTotal: number;
  fetchedAt: string;
};

const ADMIN = 'https://analyticsadmin.googleapis.com/v1beta';
const DATA = 'https://analyticsdata.googleapis.com/v1beta';
const SERIES_DAYS = 28;
const MAX_PROPERTIES = 12;

type AccountSummaries = {
  accountSummaries?: {
    propertySummaries?: { property: string; displayName: string }[];
  }[];
};

type Report = {
  rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[];
};

function post<T>(url: string, body: unknown): Promise<T> {
  return googleFetch<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const metric = (report: Report, row = 0, index = 0) =>
  Number(report.rows?.[row]?.metricValues?.[index]?.value ?? 0);

/** Les 28 derniers jours au format GA4 (AAAAMMJJ), du plus ancien au plus recent. */
function lastDays(): string[] {
  const days: string[] = [];
  for (let i = SERIES_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return days;
}

async function listProperties(): Promise<{ id: string; name: string }[]> {
  const data = await googleFetch<AccountSummaries>(`${ADMIN}/accountSummaries?pageSize=200`);
  return (data.accountSummaries ?? []).flatMap((account) =>
    (account.propertySummaries ?? []).map((p) => ({ id: p.property, name: p.displayName })),
  );
}

async function statsFor(property: { id: string; name: string }): Promise<PropertyStats> {
  const [live, week, series] = await Promise.all([
    post<Report>(`${DATA}/${property.id}:runRealtimeReport`, {
      metrics: [{ name: 'activeUsers' }],
    }),
    post<Report>(`${DATA}/${property.id}:runReport`, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
    }),
    post<Report>(`${DATA}/${property.id}:runReport`, {
      dateRanges: [{ startDate: `${SERIES_DAYS - 1}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }],
    }),
  ]);

  // GA4 omet les jours a zero : on reconstruit la serie complete.
  const byDay = new Map(
    (series.rows ?? []).map((row) => [
      row.dimensionValues?.[0]?.value ?? '',
      Number(row.metricValues?.[0]?.value ?? 0),
    ]),
  );

  return {
    id: property.id,
    name: property.name,
    liveUsers: metric(live),
    users7d: metric(week, 0, 0),
    sessions7d: metric(week, 0, 1),
    pageViews7d: metric(week, 0, 2),
    dailyUsers: lastDays().map((day) => byDay.get(day) ?? 0),
  };
}

export async function fetchAnalytics(): Promise<AnalyticsPayload> {
  const all = await listProperties();
  const wanted = config.analytics.properties;

  // Un identifiant peut etre note "properties/123" ou juste "123" dans la config.
  const matches = (id: string, list: readonly string[]) =>
    list.includes(id) || list.includes(id.replace('properties/', ''));

  const kept =
    wanted === 'all'
      ? all.filter((p) => !matches(p.id, config.analytics.exclude))
      : all.filter((p) => matches(p.id, wanted));
  const selected = kept.slice(0, MAX_PROPERTIES);

  const properties = await Promise.all(selected.map(statsFor));
  properties.sort((a, b) => b.liveUsers - a.liveUsers || b.users7d - a.users7d);

  return {
    properties,
    liveTotal: properties.reduce((sum, p) => sum + p.liveUsers, 0),
    fetchedAt: new Date().toISOString(),
  };
}
