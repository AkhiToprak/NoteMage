import type { Metadata, Viewport } from 'next';
import {
  Abril_Fatface,
  Bungee_Shade,
  Cinzel,
  Epilogue,
  IM_Fell_English_SC,
  JetBrains_Mono,
  MedievalSharp,
  Orbitron,
  Oswald,
  Pacifico,
  Permanent_Marker,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Press_Start_2P,
  Silkscreen,
  UnifrakturMaguntia,
} from 'next/font/google';
import './globals.css';
import Providers from './providers';

const epilogue = Epilogue({
  variable: '--font-epilogue',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

const oswald = Oswald({
  variable: '--font-oswald',
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700'],
  display: 'swap',
});

// Cosmetic-only fonts. Loaded here so the name-font unlockables in
// src/lib/cosmetics/catalog.ts actually render instead of falling back to
// Georgia / ui-monospace. Kept subset-light because only a handful of users
// will ever equip them.
const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// ── Wild name-font unlockables ────────────────────────────────────────────
// These are all cosmetic-only: loaded so equippable name fonts in
// src/lib/cosmetics/catalog.ts have something to render. Each one is
// single-weight where possible to keep the initial CSS payload small.

const cinzel = Cinzel({
  variable: '--font-cinzel',
  subsets: ['latin'],
  weight: ['500', '700', '900'],
  display: 'swap',
});

const unifraktur = UnifrakturMaguntia({
  variable: '--font-unifraktur',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

const medievalSharp = MedievalSharp({
  variable: '--font-medieval',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

const imFellSc = IM_Fell_English_SC({
  variable: '--font-imfell',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

const abrilFatface = Abril_Fatface({
  variable: '--font-abril',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

const bungeeShade = Bungee_Shade({
  variable: '--font-bungee',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

const pacifico = Pacifico({
  variable: '--font-pacifico',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

const permanentMarker = Permanent_Marker({
  variable: '--font-marker',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

const pressStart = Press_Start_2P({
  variable: '--font-pressstart',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

const orbitron = Orbitron({
  variable: '--font-orbitron',
  subsets: ['latin'],
  weight: ['500', '700', '900'],
  display: 'swap',
});

// Admin-only: Silkscreen is the closest Google Fonts gets to Minecraft's
// chunky pixel font. Gated via `adminOnly: true` in the cosmetics catalog;
// only users with a matching UserCosmetic row (granted by the admin tools)
// can ever equip it.
const silkscreen = Silkscreen({
  variable: '--font-minecraft',
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Notemage',
  description: 'AI-powered study companion',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
        {/* Figma capture script - temporary for design export */}
        <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script>
      </head>
      <body
        className={[
          epilogue.variable,
          oswald.variable,
          plusJakartaSans.variable,
          playfair.variable,
          jetbrainsMono.variable,
          cinzel.variable,
          unifraktur.variable,
          medievalSharp.variable,
          imFellSc.variable,
          abrilFatface.variable,
          bungeeShade.variable,
          pacifico.variable,
          permanentMarker.variable,
          pressStart.variable,
          orbitron.variable,
          silkscreen.variable,
          'antialiased',
        ].join(' ')}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
