'use client';

import { useId } from 'react';
import { weatherLabel } from '@/lib/providers/weather';

type Kind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder';

/** Regroupe les codes WMO en familles de pictos. */
function kindFor(code: number): Kind {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunder';
  return 'cloudy';
}

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

function Sun({ cx = 12, cy = 11, r = 4 }) {
  return (
    <g className="text-amber">
      <circle cx={cx} cy={cy} r={r} fill="currentColor" />
      {RAYS.map((angle) => (
        <line
          key={angle}
          x1={cx}
          y1={cy - r - 1.7}
          x2={cx}
          y2={cy - r - 3.4}
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          transform={`rotate(${angle} ${cx} ${cy})`}
        />
      ))}
    </g>
  );
}

function Moon({ id }: { id: string }) {
  return (
    <g className="text-amber">
      <mask id={id}>
        <rect width="24" height="24" fill="white" />
        <circle cx="16.5" cy="7.5" r="6.2" fill="black" />
      </mask>
      <circle cx="12" cy="11.5" r="6.2" fill="currentColor" mask={`url(#${id})`} />
    </g>
  );
}

/** Le nuage est la silhouette commune a presque tous les pictos. */
function Cloud({ dy = 0, dim = false }: { dy?: number; dim?: boolean }) {
  return (
    <g
      className="text-muted"
      fill="currentColor"
      opacity={dim ? 0.55 : 0.95}
      transform={`translate(0 ${dy})`}
    >
      <circle cx="9.3" cy="12.4" r="3.4" />
      <circle cx="14.2" cy="11.7" r="4.2" />
      <rect x="5.8" y="13.4" width="12.6" height="4.2" rx="2.1" />
    </g>
  );
}

/**
 * Les gouttes sont bleues et nettement detachees du nuage : c'est le seul indice
 * qui separe « couvert » de « pluie », et les deux teintes sont proches.
 */
function Drops({ short = false }: { short?: boolean }) {
  const top = 18.2;
  const bottom = short ? 20.4 : 22.4;
  return (
    <g className="text-sky" stroke="currentColor" strokeWidth={short ? 1.7 : 2} strokeLinecap="round">
      {[8.6, 12, 15.4].map((x, i) => (
        <line key={x} x1={x} y1={top} x2={x - 0.9} y2={bottom - (short && i === 1 ? 0 : 0)} />
      ))}
    </g>
  );
}

function Flakes() {
  return (
    <g className="text-sky" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      {[8.6, 12, 15.4].map((x) => (
        <g key={x}>
          <line x1={x - 1.3} y1="20.3" x2={x + 1.3} y2="20.3" />
          <line x1={x} y1="19" x2={x} y2="21.6" />
        </g>
      ))}
    </g>
  );
}

function glyph(kind: Kind, isDay: boolean, maskId: string) {
  switch (kind) {
    case 'clear':
      return isDay ? <Sun cx={12} cy={12} r={5} /> : <Moon id={maskId} />;
    case 'partly':
      return (
        <>
          {isDay ? <Sun cx={8.5} cy={8} r={3.2} /> : <Moon id={maskId} />}
          <Cloud dy={1.5} />
        </>
      );
    case 'cloudy':
      return <Cloud dy={0.5} />;
    case 'fog':
      return (
        <>
          <Cloud dy={-1.5} dim />
          <g className="text-muted" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="6" y1="19" x2="18" y2="19" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </g>
        </>
      );
    case 'drizzle':
      return (
        <>
          <Cloud dy={-1.5} />
          <Drops short />
        </>
      );
    case 'rain':
      return (
        <>
          <Cloud dy={-1.5} />
          <Drops />
        </>
      );
    case 'snow':
      return (
        <>
          <Cloud dy={-1.5} />
          <Flakes />
        </>
      );
    case 'thunder':
      return (
        <>
          <Cloud dy={-1.5} />
          <path
            className="text-amber"
            fill="currentColor"
            d="M13.4 17.6 9.2 23.4h2.6l-0.8 2.4 4.2-5.8h-2.6z"
            transform="translate(0 -1.2)"
          />
        </>
      );
  }
}

export function WeatherIcon({
  code,
  isDay = true,
  size = 20,
  className = '',
}: {
  code: number;
  isDay?: boolean;
  size?: number;
  className?: string;
}) {
  const maskId = useId().replace(/:/g, '');
  const label = weatherLabel(code);

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={className}
    >
      <title>{label}</title>
      {glyph(kindFor(code), isDay, maskId)}
    </svg>
  );
}
