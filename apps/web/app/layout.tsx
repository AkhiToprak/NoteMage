import type { Metadata, Viewport } from 'next';
import {
  Abril_Fatface,
  Bangers,
  Bungee_Shade,
  Cinzel,
  Epilogue,
  IM_Fell_English_SC,
  Inter,
  JetBrains_Mono,
  MedievalSharp,
  Orbitron,
  Oswald,
  Pacifico,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Poppins,
  Silkscreen,
  UnifrakturMaguntia,
} from 'next/font/google';
import './globals.css';
import 'katex/dist/katex.min.css';
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

// Inter — the typeface of the redesigned marketing landing (PathLanding). Exposed
// as --font-inter so the landing's scoped CSS can reference it without touching the
// app's semantic font tokens (Epilogue/Jakarta/Oswald), which the rest of the app uses.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

// Comic display face — used only by the "3 in a row!" streak takeover, so it is
// not preloaded (no <link rel=preload> on every page for a face most sessions
// never show). It loads on demand when the takeover mounts and resolves the var.
const bangers = Bangers({
  variable: '--font-bangers',
  preload: false,
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

// Rework surface font — Poppins is loaded for the .nm-rework scope only.
// preload: false so the face doesn't ship a <link rel=preload> on every page
// that never renders a .nm-rework surface; the CSS var resolves on demand.
const poppins = Poppins({
  variable: '--font-poppins',
  preload: false,
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

// Cosmetic-only fonts. Loaded here so the name-font unlockables in
// src/lib/cosmetics/catalog.ts actually render instead of falling back to
// Georgia / ui-monospace. Kept subset-light because only a handful of users
// will ever equip them.
const playfair = Playfair_Display({
  variable: '--font-playfair',
  // Cosmetic-only: not preloaded so the marketing entry (and every other page)
  // doesn't ship a <link rel=preload as=font> for a face only a handful of
  // users ever equip. The file still loads on demand when the CSS var resolves.
  preload: false,
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains',
  preload: false,
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
  preload: false,
  subsets: ['latin'],
  weight: ['500', '700', '900'],
  display: 'swap',
});

const unifraktur = UnifrakturMaguntia({
  variable: '--font-unifraktur',
  preload: false,
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

const medievalSharp = MedievalSharp({
  variable: '--font-medieval',
  preload: false,
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

const imFellSc = IM_Fell_English_SC({
  variable: '--font-imfell',
  preload: false,
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

const abrilFatface = Abril_Fatface({
  variable: '--font-abril',
  preload: false,
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

const bungeeShade = Bungee_Shade({
  variable: '--font-bungee',
  preload: false,
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

const pacifico = Pacifico({
  variable: '--font-pacifico',
  preload: false,
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

const orbitron = Orbitron({
  variable: '--font-orbitron',
  preload: false,
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
  preload: false,
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lock zoom so the app feels native on phone: no pinch-zoom, and no iOS
  // auto-zoom when focusing a sub-16px input (the app's inputs are 12–15px).
  // Honored fully in the iOS/Electron WebView shells; mobile Safari still
  // permits user pinch but no longer focus-zooms.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf7f0' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a36' },
  ],
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
    <html
      lang="en"
      data-theme="light"
      // next/font variable classes live on <html> (not <body>) so the CSS
      // custom properties they define (--font-epilogue, --font-jakarta, …) exist
      // at :root. The semantic font tokens (--font-sans/-display/-brand) are
      // declared at :root in globals.css and reference these — if the next/font
      // vars were only on <body>, those :root tokens would resolve to EMPTY
      // (var() of an undefined property) and every surface would fall back to
      // the system font stack.
      className={[
        epilogue.variable,
        oswald.variable,
        bangers.variable,
        poppins.variable,
        plusJakartaSans.variable,
        inter.variable,
        playfair.variable,
        jetbrainsMono.variable,
        cinzel.variable,
        unifraktur.variable,
        medievalSharp.variable,
        imFellSc.variable,
        abrilFatface.variable,
        bungeeShade.variable,
        pacifico.variable,
        orbitron.variable,
        silkscreen.variable,
      ].join(' ')}
      style={{ colorScheme: 'light' }}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            // FOUC-free theme resolver, runs before first paint. Explicit
            // 'light'/'dark' in localStorage wins; anything else (incl. a
            // storage exception) falls through to the OS preference. Only a
            // total failure leaves the SSR light default from <html>.
            __html: `try{var p=null;try{p=localStorage.getItem('notemage-theme')}catch(e){}var t=(p==='light'||p==='dark')?p:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){}`,
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
