'use client';

import { config } from '@/dashboard.config';
import { Mail } from 'lucide-react';
import { Panel, Empty } from '@/components/Panel';
import { useEndpoint } from '@/lib/useEndpoint';
import { useStoredChoice } from '@/lib/storage';
import { relative } from '@/lib/time';
import type { MailItem } from '@/app/api/gmail/route';

type MailList = { count: number; truncated: boolean; messages: MailItem[] };
type MailPayload = { unread: number; truncated: boolean; messages: MailItem[]; starred: MailList };

/** Ce qui change d'un onglet a l'autre ; le titre ouvre la meme vue dans Gmail. */
const VIEWS = {
  unread: {
    label: 'Non lus',
    href: `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(config.gmail.query)}`,
    hrefLabel: 'Ouvrir Gmail sur ce même filtre',
    empty: 'Boîte à zéro. Rien à lire.',
  },
  starred: {
    label: 'Suivis',
    href: 'https://mail.google.com/mail/u/0/#starred',
    hrefLabel: 'Ouvrir les messages suivis dans Gmail',
    empty: 'Aucun mail suivi.',
  },
};
const TABS = ['unread', 'starred'] as const;

export function MailWidget({ now }: { now: number }) {
  const { data, error, notConnected } = useEndpoint<MailPayload>('/api/gmail', config.refresh.gmail);
  const [tab, setTab] = useStoredChoice('mail-tab', TABS);

  const lists = data && {
    unread: { count: data.unread, truncated: data.truncated, messages: data.messages },
    starred: data.starred,
  };
  const list = lists?.[tab];
  const starred = tab === 'starred';

  return (
    <Panel
      title="Courrier"
      icon={Mail}
      grow
      href={VIEWS[tab].href}
      hrefLabel={VIEWS[tab].hrefLabel}
      tabs={{
        label: 'Courrier',
        value: tab,
        onChange: setTab,
        items: TABS.map((key) => ({
          key,
          label: VIEWS[key].label,
          count: lists?.[key].count,
          more: lists?.[key].truncated,
        })),
      }}
      error={error}
      notConnected={notConnected}
    >
      {/* Ecran etroit : la liste occupe une hauteur fixe et defile chez elle,
          pour que l'arrivee des mails ne repousse pas le bas de la page.
          Ecran large : le panneau tient deja la moitie de sa colonne. */}
      <div className="flex h-72 flex-col lg:h-full">
        {!list ? (
          <p className="font-mono text-sm text-muted">Chargement…</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.messages.length === 0 ? (
              <Empty>{VIEWS[tab].empty}</Empty>
            ) : (
              <ul className="divide-y divide-rule">
                {list.messages.map((mail) => {
                  const mark = starred ? '★' : mail.important ? '›' : null;
                  return (
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
                            {mark && <span className="mr-1 text-amber">{mark}</span>}
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
                  );
                })}
                {list.count > list.messages.length && (
                  <li className="pt-1.5 font-mono text-[11px] text-muted">
                    +{list.count - list.messages.length} autres, à voir dans Gmail
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
