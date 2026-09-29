'use client';

import { useEffect, useMemo, useState } from 'react';
import { config } from '@/dashboard.config';
import { useEndpoint } from '@/lib/useEndpoint';
import { readStored as read, writeStored as write } from '@/lib/storage';
import { findOfficeEvent } from '@/lib/officeDay';
import type { CalendarEvent } from '@/app/api/calendar/route';

export type PresenceMode = 'auto' | 'home' | 'office';

const MODE_KEY = 'presence-mode';
const LAST_KEY = 'presence-last';

type PresencePayload = { ssid: string | null; atHome: boolean | null };

export function usePresence(now: number) {
  const [mode, setMode] = useState<PresenceMode>('auto');
  /*
   * Le dernier etat connu sert de valeur de depart : sans lui, le panneau
   * Trajet apparaitrait puis disparaitrait a chaque chargement a la maison.
   */
  const [last, setLast] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = read(MODE_KEY);
    if (stored === 'home' || stored === 'office') setMode(stored);
    const remembered = read(LAST_KEY);
    if (remembered === 'home' || remembered === 'office') setLast(remembered === 'home');
  }, []);

  const { data } = useEndpoint<PresencePayload>('/api/presence', config.refresh.presence);
  const wifiAtHome = data?.atHome ?? null;

  /*
   * L'agenda est deja charge pour la colonne du jour : SWR sert la meme reponse,
   * pas d'appel supplementaire.
   */
  const calendar = useEndpoint<{ events: CalendarEvent[] }>('/api/calendar', config.refresh.calendar);
  const officeEvent = useMemo(
    () =>
      calendar.data
        ? findOfficeEvent(calendar.data.events, config.presence.officeKeywords, now)
        : null,
    [calendar.data, now],
  );

  /* Le calendrier tranche ; le Wi-Fi ne parle que s'il n'a rien dit. */
  const detected = officeEvent ? false : wifiAtHome;

  useEffect(() => {
    if (detected === null) return;
    setLast(detected);
    write(LAST_KEY, detected ? 'home' : 'office');
  }, [detected]);

  const choose = (next: PresenceMode) => {
    setMode(next);
    write(MODE_KEY, next === 'auto' ? null : next);
  };

  const atHome =
    mode === 'home' ? true : mode === 'office' ? false : (detected ?? last ?? true);

  return {
    atHome,
    mode,
    choose,
    ssid: data?.ssid ?? null,
    detected,
    officeEvent,
  };
}
