import { googleFetch } from '@/lib/google/oauth';

export type CalendarRef = { id: string; name: string };

type CalendarListEntry = {
  id: string;
  summary?: string;
  /** Nom donne par toi si tu as renomme l'agenda partage. */
  summaryOverride?: string;
  selected?: boolean;
  deleted?: boolean;
  accessRole?: string;
};

/**
 * Les agendas coches dans Google Agenda. On suit le choix deja fait la-bas
 * plutot que d'en tenir une seconde liste : masquer un agenda dans Google le
 * masque ici aussi.
 */
export async function visibleCalendars(): Promise<CalendarRef[]> {
  const data = await googleFetch<{ items?: CalendarListEntry[] }>(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100',
  );

  return (data.items ?? [])
    .filter(
      (entry) =>
        entry.selected === true &&
        !entry.deleted &&
        // freeBusyReader ne donne que des plages occupees, sans titre.
        entry.accessRole !== 'freeBusyReader',
    )
    .map((entry) => ({
      id: entry.id,
      name: entry.summaryOverride ?? entry.summary ?? entry.id,
    }));
}
