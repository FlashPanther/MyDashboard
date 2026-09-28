'use client';

import type { ReactNode } from 'react';
import { config } from '@/dashboard.config';
import { Panel, Empty } from '@/components/Panel';
import { useEndpoint } from '@/lib/useEndpoint';
import { hhmm } from '@/lib/time';
import type { MessengerChat, MessengerStatus } from '@/lib/providers/messenger';

type MessengerPayload = {
  status: MessengerStatus;
  conversations: number;
  chats: MessengerChat[];
  receivedAt: string | null;
};

const MESSENGER = 'https://www.messenger.com/';

function warning(data: MessengerPayload): ReactNode {
  switch (data.status) {
    case 'waiting':
      return (
        <>
          L&rsquo;extension ne s&rsquo;est pas encore manifestée. Vérifie qu&rsquo;elle est
          installée (voir le README) et qu&rsquo;un onglet{' '}
          <MessengerLink>messenger.com</MessengerLink> est ouvert.
        </>
      );
    case 'noTab':
      return (
        <>
          Aucun onglet Messenger ouvert. <MessengerLink>Ouvre messenger.com</MessengerLink> dans
          Chrome et laisse-le ouvert.
        </>
      );
    case 'login':
      return (
        <>
          L&rsquo;onglet Messenger attend que tu te connectes.{' '}
          <MessengerLink>Y aller</MessengerLink>
        </>
      );
    case 'sleeping':
      return (
        <>
          Chrome a mis l&rsquo;onglet Messenger en veille. Clique dessus pour le réveiller, ou
          ajoute messenger.com aux sites toujours actifs (Paramètres › Performances).
        </>
      );
    case 'stale':
      return (
        <>
          Plus de nouvelles de l&rsquo;extension
          {data.receivedAt ? ` depuis ${hhmm(data.receivedAt)}` : ''}. Chrome est-il ouvert ?
        </>
      );
    default:
      return null;
  }
}

export function MessengerWidget() {
  const { data, error } = useEndpoint<MessengerPayload>(
    '/api/messenger',
    config.refresh.messenger,
  );
  const ready = data?.status === 'ready';
  const problem = data ? warning(data) : null;

  return (
    <Panel
      title="Messenger"
      grow
      href={MESSENGER}
      hrefLabel="Ouvrir Messenger"
      meta={
        ready ? (
          <>
            <span
              className={`font-semibold ${data.conversations === 0 ? 'text-jade' : 'text-amber'}`}
            >
              {data.conversations}
            </span>{' '}
            non lues
          </>
        ) : data ? (
          <span className="text-rose">hors ligne</span>
        ) : null
      }
      error={error}
    >
      <div className="flex h-64 flex-col lg:h-full">
        {!data ? (
          <p className="font-mono text-sm text-muted">Chargement…</p>
        ) : (
          <>
            {problem && (
              <p role="status" className="mb-2 shrink-0 text-[13px] text-rose">
                {problem}
              </p>
            )}
            {/* Une liste perimee reste visible, estompee : mieux que rien. */}
            <div className={`min-h-0 flex-1 overflow-y-auto ${ready ? '' : 'opacity-50'}`}>
              {!data.chats.length ? (
                ready && <Empty>Tout est lu.</Empty>
              ) : (
                <ul className="divide-y divide-rule">
                  {data.chats.map((chat) => (
                    <li key={chat.id}>
                      <a
                        href={chat.url}
                        target="_blank"
                        rel="noreferrer"
                        title={chat.preview}
                        className="group block py-1.5 transition-colors hover:bg-panel-soft"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[13px] font-semibold text-ink">
                            {chat.name}
                          </span>
                          <span className="tnum shrink-0 font-mono text-[11px] text-muted">
                            {chat.when}
                          </span>
                        </div>
                        <p className="truncate text-[13px] text-ink/75 group-hover:text-ink">
                          {chat.preview}
                        </p>
                      </a>
                    </li>
                  ))}
                  {/* La page ne charge que les trente dernieres discussions. */}
                  {data.conversations > data.chats.length && (
                    <li className="pt-1.5 font-mono text-[11px] text-muted">
                      +{data.conversations - data.chats.length} plus anciennes, à voir dans
                      Messenger
                    </li>
                  )}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

function MessengerLink({ children }: { children: ReactNode }) {
  return (
    <a
      href={MESSENGER}
      target="_blank"
      rel="noreferrer"
      className="text-amber underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}
