'use client';

import { useEffect, useState } from 'react';
import { config } from '@/dashboard.config';
import { longDate } from '@/lib/time';
import { useEndpoint } from '@/lib/useEndpoint';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PresenceToggle } from '@/components/PresenceToggle';
import type { PresenceMode } from '@/lib/usePresence';
import type { CalendarEvent } from '@/app/api/calendar/route';

export function Header({
  now,
  presenceMode,
  onPresenceChange,
  ssid,
  detected,
  officeEvent,
}: {
  now: number;
  presenceMode: PresenceMode;
  onPresenceChange: (mode: PresenceMode) => void;
  ssid: string | null;
  detected: boolean | null;
  officeEvent: CalendarEvent | null;
}) {
  const [clock, setClock] = useState<Date | null>(null);
  const status = useEndpoint<{ configured: boolean; connected: boolean }>('/api/auth/status', 60);

  useEffect(() => {
    setClock(new Date());
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = (clock ?? new Date(now)).toLocaleTimeString(config.locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: config.timezone,
  });

  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-rule pb-3">
      <div className="flex items-baseline gap-4">
        <h1 className="font-display text-xl font-extrabold uppercase tracking-[0.16em] text-ink">
          {longDate(now)}
        </h1>
        <span className="font-mono text-xs text-muted">{config.owner}</span>
      </div>

      <div className="flex items-center gap-4">
        <PresenceToggle
          mode={presenceMode}
          onChange={onPresenceChange}
          ssid={ssid}
          detected={detected}
          officeEvent={officeEvent}
        />
        <ThemeToggle />
        {status.data && !status.data.connected && (
          <a
            href="/api/auth/google"
            className="border border-amber px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-amber transition-colors hover:bg-amber hover:text-ground"
          >
            Relier Google
          </a>
        )}
        <span className="tnum font-mono text-3xl leading-none text-ink">{time}</span>
      </div>
    </header>
  );
}
