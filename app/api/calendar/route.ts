import { handle } from '@/lib/api';
import { googleFetch } from '@/lib/google/oauth';
import { config } from '@/dashboard.config';
import { ymdPath } from '@/lib/time';
import { visibleCalendars, type CalendarRef } from '@/lib/google/calendars';

export const dynamic = 'force-dynamic';

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  meetingUrl: string | null;
  calendar: string;
  accepted: boolean;
  /** Ce qu'ouvre le clic : Google Agenda cadre sur la date de l'événement. */
  url: string;
  /** Lien direct vers la fiche de l'événement, si tu preferes celui-la. */
  eventUrl: string | null;
};

type GoogleEvent = {
  id: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  status?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
  conferenceData?: { entryPoints?: { uri?: string; entryPointType?: string }[] };
};

export async function GET() {
  return handle(async () => {
    const now = new Date();
    const timeMin = new Date(now);
    timeMin.setHours(0, 0, 0, 0);
    const timeMax = new Date(timeMin);
    timeMax.setDate(timeMax.getDate() + 2);

    const configured = config.calendar.calendarIds;
    const calendars: CalendarRef[] =
      configured === 'visible'
        ? await visibleCalendars()
        : configured.map((id) => ({ id, name: id }));

    const lists = await Promise.all(
      calendars.map(async ({ id, name }) => {
        const params = new URLSearchParams({
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '30',
        });
        const data = await googleFetch<{ items?: GoogleEvent[] }>(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?${params}`,
        );
        return (data.items ?? [])
          .filter((event) => event.status !== 'cancelled')
          .map<CalendarEvent>((event) => {
            const self = event.attendees?.find((a) => a.self);
            const start = event.start.dateTime ?? `${event.start.date}T12:00:00`;
            // Un evenement deja commence doit ouvrir l'agenda sur aujourd'hui,
            // pas sur sa date de debut : des vacances entamees la semaine
            // derniere renverraient sinon une semaine en arriere.
            const anchor = Math.max(new Date(start).getTime(), timeMin.getTime());
            return {
              id: event.id,
              title: event.summary ?? '(sans titre)',
              start: event.start.dateTime ?? `${event.start.date}T00:00:00`,
              end: event.end.dateTime ?? `${event.end.date}T00:00:00`,
              allDay: !event.start.dateTime,
              location: event.location ?? null,
              meetingUrl:
                event.hangoutLink ??
                event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ??
                null,
              calendar: name,
              accepted: !self || self.responseStatus !== 'declined',
              url: `https://calendar.google.com/calendar/r/${config.calendar.view}/${ymdPath(anchor)}`,
              eventUrl: event.htmlLink ?? null,
            };
          });
      }),
    );

    const events = lists
      .flat()
      .filter((event) => event.accepted)
      .sort((a, b) => a.start.localeCompare(b.start));

    return { events, fetchedAt: new Date().toISOString() };
  });
}
