import type { Metadata, Viewport } from 'next';
import { Archivo, Public_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-archivo',
  display: 'swap',
});

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-public-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Tableau du jour',
  description: 'Agenda, taches, meteo, trajets et courrier, en un coup d oeil.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef1f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
};

/**
 * Applique le theme enregistre avant le premier rendu. Sans ce script, la page
 * s'affiche une fraction de seconde dans le theme du systeme avant de basculer.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${archivo.variable} ${publicSans.variable} ${plexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
