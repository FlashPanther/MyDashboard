import type { CalendarEvent } from '@/app/api/calendar/route';

const MS_PER_DAY = 86_400_000;

/** Compare sans accents ni casse : « Présentiel » doit matcher « presentiel ». */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * L'evenement qui marque une journee au bureau, s'il y en a un aujourd'hui.
 * Le calendrier dit ce qu'est la journee ; le Wi-Fi ne dit que ou tu te trouves
 * a l'instant present — inutile le matin, quand tu es encore chez toi mais que
 * tu dois attraper un train.
 */
export function findOfficeEvent(
  events: CalendarEvent[],
  keywords: readonly string[],
  now: number,
): CalendarEvent | null {
  if (!now) return null;
  const dayStart = new Date(now).setHours(0, 0, 0, 0);
  const dayEnd = dayStart + MS_PER_DAY;
  const needles = keywords.map(fold);

  return (
    events.find((event) => {
      if (!needles.some((needle) => fold(event.title).includes(needle))) return false;
      return new Date(event.start).getTime() < dayEnd && new Date(event.end).getTime() > dayStart;
    }) ?? null
  );
}
