'use client';

import { Component as MagicCursor } from '@/components/ui/magic-cursor';
import LandingNavbar from '@/components/landing/LandingNavbar';
import Hero from '@/components/landing/Hero';
import NotetakingCanvasSpotlight from '@/components/landing/NotetakingCanvasSpotlight';
import MageSpotlight from '@/components/landing/MageSpotlight';
import CoworkSpotlight from '@/components/landing/CoworkSpotlight';
import LearningToolsCarousel from '@/components/landing/LearningToolsCarousel';
import BentoFeatures from '@/components/landing/BentoFeatures';
import HowItWorks from '@/components/landing/HowItWorks';
import StatsStrip from '@/components/landing/StatsStrip';
import FinalCta from '@/components/landing/FinalCta';
import LandingFooter from '@/components/landing/LandingFooter';

export default function LandingPage() {
  return (
    <main
      className="nm-landing"
      style={{
        position: 'relative',
        background: '#09081a',
        color: '#ede9ff',
        fontFamily: 'var(--font-sans)',
        minHeight: '100vh',
      }}
    >
      <MagicCursor />
      <LandingNavbar />
      <Hero />
      <NotetakingCanvasSpotlight />
      <MageSpotlight />
      <CoworkSpotlight />
      <LearningToolsCarousel />
      <BentoFeatures />
      <HowItWorks />
      <StatsStrip />
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
