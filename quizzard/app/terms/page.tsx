import type { Metadata } from 'next';
import LegalPageShell from '@/components/legal/LegalPageShell';
import { getLegalContent } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Waitlist Terms — Notemage',
  description:
    'Waitlist Terms / AGB für die Warteliste. The terms that apply when you join the Notemage waitlist.',
};

export default function TermsPage() {
  return (
    <LegalPageShell
      eyebrow="Legal"
      titleEn="Waitlist Terms"
      titleDe="AGB für die Warteliste"
      enContent={getLegalContent('terms', 'en')}
      deContent={getLegalContent('terms', 'de')}
    />
  );
}
