'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LandingNavbar from '@/components/landing/LandingNavbar';
import Hero from '@/components/landing/Hero';
import NotetakingCanvasSpotlight from '@/components/landing/NotetakingCanvasSpotlight';
import MageSpotlight from '@/components/landing/MageSpotlight';
import CoworkSpotlight from '@/components/landing/CoworkSpotlight';
import LearningToolsCarousel from '@/components/landing/LearningToolsCarousel';
import BentoFeatures from '@/components/landing/BentoFeatures';
import HowItWorks from '@/components/landing/HowItWorks';
import FinalCta from '@/components/landing/FinalCta';
import LandingFooter from '@/components/landing/LandingFooter';
import { isInsideNativeShell } from '@/lib/native-bridge';

export default function LandingPage() {
  const router = useRouter();

  // Native shells (iOS WebView, Electron) are authenticated clients — they
  // boot directly into the app, never the marketing landing. The shell
  // initial URL is /auth/login; this guard catches deep links, programmatic
  // navs, or errant redirects that drop a native user back at /.
  useEffect(() => {
    if (isInsideNativeShell()) {
      router.replace('/auth/login');
    }
  }, [router]);

  return (
    <main
      className="nm-landing"
      // The marketing page renders dark in both themes. Without this the
      // landing inherits a light-mode visitor's [data-theme='light'] tokens
      // (near-black --on-surface text) onto its dark backdrop and reads blank.
      // The dark-island pattern re-establishes dark token values locally.
      data-theme="dark"
      style={{
        position: 'relative',
        isolation: 'isolate',
        background: '#0c0a1a',
        color: 'var(--on-surface)',
        colorScheme: 'dark',
        fontFamily: 'var(--font-sans)',
        minHeight: '100vh',
      }}
    >
      <LandingNavbar />
      <Hero />
      <NotetakingCanvasSpotlight />
      <MageSpotlight />
      <CoworkSpotlight />
      <LearningToolsCarousel />
      <BentoFeatures />
      <HowItWorks />
      <FinalCta />
      <LandingFooter />

      <style jsx global>{`
        .nm-landing a:focus-visible,
        .nm-landing button:focus-visible {
          outline: 2px solid #ffde59;
          outline-offset: 3px;
          border-radius: 8px;
        }
        .nm-landing a:focus:not(:focus-visible),
        .nm-landing button:focus:not(:focus-visible) {
          outline: none;
        }
      `}</style>
    </main>
  );
}
