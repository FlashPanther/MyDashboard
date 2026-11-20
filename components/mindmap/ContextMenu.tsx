'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type MenuItem = { label: string; run: () => void };

export function ContextMenu({
  at,
  items,
  onClose,
}: {
  at: { x: number; y: number };
  items: MenuItem[];
  onClose: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: at.x, top: at.y });

  useLayoutEffect(() => {
    const { offsetWidth, offsetHeight } = element.current!;
    setPlace({
      left: Math.max(8, Math.min(at.x, window.innerWidth - offsetWidth - 8)),
      top: Math.max(8, Math.min(at.y, window.innerHeight - offsetHeight - 8)),
    });
    element.current!.querySelector('button')?.focus();
  }, [at]);

  useEffect(() => {
    const onOutside = (event: Event) => {
      if (!element.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('wheel', onOutside, true);
    return () => {
      window.removeEventListener('pointerdown', onOutside, true);
      window.removeEventListener('wheel', onOutside, true);
    };
  }, [onClose]);

  return (
    <div
      ref={element}
      className="panel fixed z-10 flex flex-col p-1 shadow-lg"
      style={place}
      onKeyDown={(event) => {
        if (event.key === 'Escape') return onClose();
        const forward = event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey);
        const backward = event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey);
        if (!forward && !backward) return;
        event.preventDefault();
        const buttons = [...element.current!.querySelectorAll('button')];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(current + (forward ? 1 : -1) + buttons.length) % buttons.length].focus();
      }}
    >
      {items.map(({ label, run }) => (
        <button
          key={label}
          type="button"
          className="whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-panel-soft focus:bg-panel-soft"
          onClick={() => {
            run();
            onClose();
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
