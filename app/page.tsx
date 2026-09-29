'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { usePresence } from '@/lib/usePresence';
import { DayColumn } from '@/components/DayColumn';
import { CommuteWidget } from '@/components/widgets/CommuteWidget';
import { WeatherWidget } from '@/components/widgets/WeatherWidget';
import { AudienceWidget } from '@/components/widgets/AudienceWidget';
import { MailWidget } from '@/components/widgets/MailWidget';
import { TasksWidget } from '@/components/widgets/TasksWidget';
import { MessengerWidget, WhatsAppWidget } from '@/components/widgets/ChatFeedWidget';

const AUTH_MESSAGES: Record<string, string> = {
  ok: 'Compte Google relié.',
  refuse: "Autorisation refusée : les widgets Google resteront vides.",
  incomplet: "Google n'a pas renvoyé de code d'autorisation. Relance la connexion.",
  echec: 'La connexion a échoué.',
};

export default function Dashboard() {
  // Un seul battement de coeur pour tous les widgets : evite N minuteries.
  // Il demarre a zero pour que le serveur et le navigateur rendent la meme chose ;
  // l'heure n'apparait qu'apres le montage.
  const [now, setNow] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const { atHome, mode, choose, ssid, detected, officeEvent } = usePresence(now);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get('auth');
    if (!auth) return;
    setNotice([AUTH_MESSAGES[auth] ?? auth, params.get('detail')].filter(Boolean).join(' '));
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  if (!now) {
    return (
      <div className="flex min-h-screen items-center justify-center font-mono text-sm text-muted">
        Préparation du tableau…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 p-4 lg:h-screen lg:p-6">
      <Header
        now={now}
        presenceMode={mode}
        onPresenceChange={choose}
        ssid={ssid}
        detected={detected}
        officeEvent={officeEvent}
      />

      {notice && (
        <p
          role="status"
          className="border border-rule bg-panel px-4 py-2 font-mono text-xs text-ink"
        >
          {notice}
        </p>
      )}

      <main className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* La colonne du jour a le plus de mou : l'audience se loge dessous. */}
        <div className="flex min-h-0 flex-col gap-4 lg:w-[24%] xl:w-[27%]">
          <div className="flex h-[65vh] min-h-0 flex-1 lg:h-auto">
            <DayColumn now={now} atHome={atHome} officeEvent={officeEvent} />
          </div>
          <AudienceWidget />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 lg:flex-row">
          {/* Ce qui arrive : courrier et messages, au centre et plus large que le reste. */}
          <div className="flex min-h-0 min-w-0 flex-col gap-4 lg:flex-[1.15] xl:flex-[1.35]">
            {/* Le courrier porte deux listes (non lus, suivis) : double part de hauteur. */}
            <div className="flex min-h-0 flex-col lg:flex-[2]">
              <MailWidget now={now} />
            </div>
            <WhatsAppWidget />
            <MessengerWidget />
          </div>
          {/* Le reste, sur le cote : ce qu'on planifie et ce qu'on consulte. */}
          <div className="flex min-h-0 min-w-0 flex-col gap-4 lg:flex-1">
            <TasksWidget />
            {/* A la maison le trajet n'a rien a dire ; la meteo, elle, garde
                la meme forme partout et prend simplement la place laissee. */}
            {!atHome && <CommuteWidget now={now} />}
            <WeatherWidget />
          </div>
        </div>
      </main>
    </div>
  );
}
