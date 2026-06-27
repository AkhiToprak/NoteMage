import PricingPageClient from './PricingPageClient';

export default function PricingPage() {
  return (
    // Light cream island — mirrors the landing wrapper so a dark-theme visitor's
    // tokens never bleed onto the redesigned pricing surface.
    <div
      className="nm-landing"
      data-theme="light"
      style={{
        position: 'relative',
        isolation: 'isolate',
        background: '#faf7f0',
        color: '#18202f',
        colorScheme: 'light',
        fontFamily: 'var(--font-inter), var(--font-sans)',
        minHeight: '100vh',
      }}
    >
      <PricingPageClient />
    </div>
  );
}
