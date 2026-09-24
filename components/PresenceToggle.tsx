'use client';

import type { PresenceMode } from '@/lib/usePresence';
import type { CalendarEvent } from '@/app/api/calendar/route';

const OPTIONS: { value: PresenceMode; label: string }[] = [
  { value: 'home', label: 'Maison' },
  { value: 'office', label: 'Bureau' },
  { value: 'auto', label: 'Auto' },
];

export function PresenceToggle({
  mode,
  onChange,
  ssid,
  detected,
  officeEvent,
}: {
  mode: PresenceMode;
  onChange: (mode: PresenceMode) => void;
  ssid: string | null;
  detected: boolean | null;
  officeEvent: CalendarEvent | null;
}) {
  // Dire ce qui a tranche : sinon « Auto » est une boite noire.
  const autoHint = officeEvent
    ? `« ${officeEvent.title} » dans ton agenda aujourd'hui`
    : detected === null
      ? 'Ni évènement au calendrier ni réseau reconnu — choisis Maison ou Bureau'
      : `Aucun évènement de bureau · réseau ${ssid} reconnu comme ${
          detected ? 'la maison' : 'le bureau'
        }`;

  return (
    <div
      role="group"
      aria-label="Lieu de travail"
      className="inline-flex overflow-hidden rounded-sm border border-rule"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.value === 'auto' ? autoHint : undefined}
          onClick={() => onChange(option.value)}
          aria-pressed={mode === option.value}
          className={`px-2 py-0.5 text-[11px] uppercase tracking-wider transition-colors ${
            mode === option.value ? 'bg-ink text-ground' : 'text-muted hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
