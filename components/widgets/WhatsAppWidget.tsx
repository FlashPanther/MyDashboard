'use client';

import { useEffect, useState } from 'react';
import { config } from '@/dashboard.config';
import { Panel, Empty } from '@/components/Panel';
import { useEndpoint } from '@/lib/useEndpoint';
import { relative } from '@/lib/time';
import type { WhatsAppChat, WhatsAppStatus } from '@/lib/providers/whatsapp';

type WhatsAppPayload = {
  status: WhatsAppStatus;
  qr?: string | null;
  error?: string | null;
  conversations?: number;
  messages?: number;
  chats?: WhatsAppChat[];
};

export function WhatsAppWidget({ now }: { now: number }) {
  // Tant que le compte n'est pas relie, on regarde souvent : le QR code change
  // toutes les 20 s et la liste doit apparaitre des le scan.
  const [pairing, setPairing] = useState(true);
  const { data: state, error } = useEndpoint<WhatsAppPayload>(
    '/api/whatsapp',
    pairing ? 4 : config.refresh.whatsapp,
  );
  const ready = state?.status === 'ready';

  useEffect(() => {
    if (state) setPairing(!ready);
  }, [state, ready]);

  return (
    <Panel
      title="WhatsApp"
      grow
      href="https://web.whatsapp.com/"
      hrefLabel="Ouvrir WhatsApp Web"
      meta={
        ready ? (
          <>
            <span
              className={`font-semibold ${state.conversations === 0 ? 'text-jade' : 'text-amber'}`}
            >
              {state.messages}
            </span>{' '}
            non lus
            {state.conversations ? ` · ${state.conversations} conv.` : ''}
          </>
        ) : null
      }
      error={error ?? state?.error}
    >
      <div className="flex h-64 flex-col lg:h-full">
        {!state || state.status === 'starting' ? (
          <p className="font-mono text-sm text-muted">Démarrage de WhatsApp…</p>
        ) : state.status === 'qr' ? (
          <Pairing qr={state.qr ?? null} />
        ) : ready ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!state.chats?.length ? (
              <Empty>Tout est lu.</Empty>
            ) : (
              <ul className="divide-y divide-rule">
                {state.chats.map((chat) => (
                  <li key={chat.id}>
                    <a
                      href={chat.url}
                      target="_blank"
                      rel="noreferrer"
                      title={
                        chat.isGroup
                          ? `${chat.preview}\n(groupe : WhatsApp Web s'ouvre sur l'accueil)`
                          : chat.preview
                      }
                      className="group block py-1.5 transition-colors hover:bg-panel-soft"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13px] font-semibold text-ink">
                          {chat.name}
                        </span>
                        <span className="tnum flex shrink-0 items-baseline gap-2 font-mono text-[11px] text-muted">
                          {chat.date ? relative(chat.date, now) : ''}
                          <span
                            className={`min-w-5 rounded-full px-1.5 text-center font-semibold ${
                              chat.isMuted ? 'bg-muted/30 text-ink' : 'bg-jade text-panel'
                            }`}
                          >
                            {chat.unread || '•'}
                          </span>
                        </span>
                      </div>
                      <p className="truncate text-[13px] text-ink/75 group-hover:text-ink">
                        {chat.author && <span className="text-muted">{chat.author} : </span>}
                        {chat.preview}
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function Pairing({ qr }: { qr: string | null }) {
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      {qr ? (
        // Image generee a la volee (data URL) : next/image n'apporterait rien.
        <img src={qr} alt="QR code WhatsApp" className="size-48 bg-white p-2" />
      ) : (
        <p className="font-mono text-sm text-muted">QR code en préparation…</p>
      )}
      <p className="max-w-xs text-[13px] text-muted">
        Sur ton téléphone : WhatsApp &rsaquo; Appareils connectés &rsaquo; Connecter un
        appareil, puis scanne ce code. Le tableau ne fait que lire.
      </p>
    </div>
  );
}
