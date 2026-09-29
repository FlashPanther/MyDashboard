'use client';

import { useId } from 'react';
import { config } from '@/dashboard.config';
import { Panel, Empty } from '@/components/Panel';
import { PanelTabs, tabPanelProps } from '@/components/PanelTabs';
import { useEndpoint } from '@/lib/useEndpoint';
import { useStoredChoice } from '@/lib/storage';
import { relative } from '@/lib/time';
import type { MailItem } from '@/app/api/gmail/route';

type MailPayload = {
  unread: number;
  truncated: boolean;
  messages: MailItem[];
  starred: { count: number; truncated: boolean; messages: MailItem[] };
};

const TABS = ['unread', 'starred'] as const;

/** Page Gmail ouverte par le titre : la meme vue que l'onglet. */
const GMAIL = {
  unread: {
    href: `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(config.gmail.query)}`,
    label: 'Ouvrir Gmail sur ce même filtre',
  },
  starred: {
    href: 'https://mail.google.com/mail/u/0/#starred',
    label: 'Ouvrir les messages suivis dans Gmail',
  },
};

export function MailWidget({ now }: { now: number }) {
  const { data, error, notConnected } = useEndpoint<MailPayload>('/api/gmail', config.refresh.gmail);
  const [tab, setTab] = useStoredChoice('mail-tab', TABS);
  const id = useId();

  const starred = tab === 'starred';
  const messages = starred ? data?.starred.messages : data?.messages;
  const total = starred ? data?.starred.count : data?.unread;

  return (
    <Panel
      title="Courrier"
      grow
      href={GMAIL[tab].href}
      hrefLabel={GMAIL[tab].label}
      meta={
        <PanelTabs
          id={id}
          label="Courrier"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'unread', label: 'Non lus', count: data?.unread, more: data?.truncated },
            {
              key: 'starred',
              label: 'Suivis',
              count: data?.starred.count,
              more: data?.starred.truncated,
            },
          ]}
        />
      }
      error={error}
      notConnected={notConnected}
    >
      {/* Ecran etroit : la liste occupe une hauteur fixe et defile chez elle,
          pour que l'arrivee des mails ne repousse pas le bas de la page.
          Ecran large : le panneau tient deja la moitie de sa colonne. */}
      <div {...tabPanelProps(id, tab)} className="flex h-72 flex-col lg:h-full">
        {!messages ? (
          <p className="font-mono text-sm text-muted">Chargement…</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <Empty>{starred ? 'Aucun mail suivi.' : 'Boîte à zéro. Rien à lire.'}</Empty>
            ) : (
              <ul className="divide-y divide-rule">
                {messages.map((mail) => (
                  <li key={mail.id}>
                    <a
                      href={mail.url}
                      target="_blank"
                      rel="noreferrer"
                      title={mail.snippet}
                      className="group block py-1.5 transition-colors hover:bg-panel-soft"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        {/* Les suivis sont lus ou non : le gras dit lesquels restent a lire. */}
                        <span
                          className={`truncate text-[13px] text-ink ${
                            !starred || mail.unread ? 'font-semibold' : ''
                          }`}
                        >
                          {starred && <span className="mr-1 text-amber">&#9733;</span>}
                          {!starred && mail.important && (
                            <span className="mr-1 text-amber">&rsaquo;</span>
                          )}
                          {mail.from}
                        </span>
                        <span className="tnum shrink-0 font-mono text-[11px] text-muted">
                          {mail.date ? relative(mail.date, now) : ''}
                        </span>
                      </div>
                      <p className="truncate text-[13px] text-ink/75 group-hover:text-ink">
                        {mail.subject}
                      </p>
                    </a>
                  </li>
                ))}
                {total !== undefined && total > messages.length && (
                  <li className="pt-1.5 font-mono text-[11px] text-muted">
                    +{total - messages.length} autres, à voir dans Gmail
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
