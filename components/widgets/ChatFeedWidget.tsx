'use client';

import type { ReactNode } from 'react';
import { config } from '@/dashboard.config';
import { Panel, Empty } from '@/components/Panel';
import { useEndpoint } from '@/lib/useEndpoint';
import { hhmm } from '@/lib/time';
import type { FeedSnapshot, Source } from '@/lib/providers/relay';

type Feed = {
  /** La route (/api/<source>) et le rythme (config.refresh.<source>) en decoulent. */
  source: Source;
  title: string;
  /** Page ouverte par le titre, et a garder ouverte pour l'extension. */
  site: string;
  siteLabel: string;
  /** Ce que « connecte-toi » veut dire sur ce site. */
  loginHint: string;
};

export function WhatsAppWidget() {
  return (
    <ChatFeedWidget
      feed={{
        source: 'whatsapp',
        title: 'WhatsApp',
        site: 'https://web.whatsapp.com/',
        siteLabel: 'web.whatsapp.com',
        loginHint: 'L’onglet WhatsApp attend que tu scannes son QR code.',
      }}
    />
  );
}

export function MessengerWidget() {
  return (
    <ChatFeedWidget
      feed={{
        source: 'messenger',
        title: 'Messenger',
        site: 'https://www.messenger.com/',
        siteLabel: 'messenger.com',
        loginHint: 'L’onglet Messenger attend que tu te connectes.',
      }}
    />
  );
}

function warning(feed: Feed, data: FeedSnapshot): ReactNode {
  const site = <SiteLink feed={feed}>{feed.siteLabel}</SiteLink>;
  switch (data.status) {
    case 'waiting':
      return (
        <>
          L&rsquo;extension ne s&rsquo;est pas encore manifestée. Vérifie qu&rsquo;elle est
          installée (voir le README) et qu&rsquo;un onglet {site} est ouvert.
        </>
      );
    case 'noTab':
      return (
        <>
          Aucun onglet {feed.title} ouvert. Ouvre {site} dans Chrome et laisse-le ouvert.
        </>
      );
    case 'login':
      return (
        <>
          {feed.loginHint} <SiteLink feed={feed}>Y aller</SiteLink>
        </>
      );
    case 'sleeping':
      return (
        <>
          Chrome a mis l&rsquo;onglet {feed.title} en veille. Clique dessus pour le réveiller, ou
          ajoute {feed.siteLabel} aux sites toujours actifs (Paramètres › Performances).
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

function ChatFeedWidget({ feed }: { feed: Feed }) {
  const { data, error } = useEndpoint<FeedSnapshot>(
    `/api/${feed.source}`,
    config.refresh[feed.source],
  );
  const ready = data?.status === 'ready';
  const problem = data ? warning(feed, data) : null;

  const meta = !data ? null : ready ? (
    <>
      <span className={`font-semibold ${data.conversations === 0 ? 'text-jade' : 'text-amber'}`}>
        {data.conversations}
      </span>{' '}
      non lues
    </>
  ) : (
    <span className="text-rose">hors ligne</span>
  );

  return (
    <Panel
      title={feed.title}
      grow
      href={feed.site}
      hrefLabel={`Ouvrir ${feed.title}`}
      meta={meta}
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
                          <span className="tnum flex shrink-0 items-baseline gap-2 font-mono text-[11px] text-muted">
                            {chat.when}
                            {chat.unread !== null && (
                              <span className="min-w-5 rounded-full bg-jade px-1.5 text-center font-semibold text-panel">
                                {chat.unread || '•'}
                              </span>
                            )}
                          </span>
                        </div>
                        <p className="truncate text-[13px] text-ink/75 group-hover:text-ink">
                          {chat.author && <span className="text-muted">{chat.author} : </span>}
                          {chat.preview}
                        </p>
                      </a>
                    </li>
                  ))}
                  {/* La page ne charge qu'une partie des discussions. */}
                  {data.conversations > data.chats.length && (
                    <li className="pt-1.5 font-mono text-[11px] text-muted">
                      +{data.conversations - data.chats.length} plus anciennes, à voir dans{' '}
                      {feed.title}
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

function SiteLink({ feed, children }: { feed: Feed; children: ReactNode }) {
  return (
    <a
      href={feed.site}
      target="_blank"
      rel="noreferrer"
      className="text-amber underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}
