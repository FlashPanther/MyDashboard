'use client';

import { config } from '@/dashboard.config';
import { Panel, Empty } from '@/components/Panel';
import { useEndpoint } from '@/lib/useEndpoint';
import { relative } from '@/lib/time';
import type { MailItem } from '@/app/api/gmail/route';

type MailPayload = { unread: number; truncated: boolean; messages: MailItem[] };

export function MailWidget({ now }: { now: number }) {
  const { data, error, notConnected } = useEndpoint<MailPayload>('/api/gmail', config.refresh.gmail);

  return (
    <Panel
      title="Courrier"
      grow
      href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(config.gmail.query)}`}
      hrefLabel="Ouvrir Gmail sur ce même filtre"
      meta={
        data ? (
          <>
            <span className={`font-semibold ${data.unread === 0 ? 'text-jade' : 'text-amber'}`}>
              {data.unread}
              {data.truncated ? '+' : ''}
            </span>{' '}
            non lus
          </>
        ) : null
      }
      error={error}
      notConnected={notConnected}
    >
      {/* Ecran etroit : la liste occupe une hauteur fixe et defile chez elle,
          pour que l'arrivee des mails ne repousse pas le bas de la page.
          Ecran large : le panneau tient deja la moitie de sa colonne. */}
      {/* Hauteur reservee des le premier rendu, chiffre compris : rien ne bouge
          quand les mails arrivent. */}
      <div className="flex h-72 flex-col lg:h-full">
        {!data ? (
          <p className="font-mono text-sm text-muted">Chargement…</p>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {data.messages.length === 0 ? (
                <Empty>Boîte à zéro. Rien à lire.</Empty>
              ) : (
                <ul className="divide-y divide-rule">
                  {data.messages.map((mail) => (
                    <li key={mail.id}>
                      <a
                        href={mail.url}
                        target="_blank"
                        rel="noreferrer"
                        title={mail.snippet}
                        className="group block py-1.5 transition-colors hover:bg-panel-soft"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[13px] font-semibold text-ink">
                            {mail.important && <span className="mr-1 text-amber">&rsaquo;</span>}
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
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
