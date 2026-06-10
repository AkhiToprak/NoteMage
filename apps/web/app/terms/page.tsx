import type { Metadata } from 'next';
import LegalPageShell from '@/components/legal/LegalPageShell';
import { getLegalContent } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Terms of Service — Notemage',
  description:
    'Terms of Service / Allgemeine Geschäftsbedingungen for Notemage — the terms that apply when you use Notemage.',
};

export default function TermsPage() {
  return (
    <LegalPageShell
      eyebrow="Legal"
      titleEn="Terms of Service"
      titleDe="Allgemeine Geschäftsbedingungen"
      enContent={getLegalContent('terms', 'en')}
      deContent={getLegalContent('terms', 'de')}
    />
  );
}
