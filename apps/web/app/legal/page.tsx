import type { Metadata } from 'next';
import LegalPageShell from '@/components/legal/LegalPageShell';
import { getLegalContent } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Legal Notice — Notemage',
  description: 'Legal Notice / Impressum. Operator and contact information for Notemage.',
};

export default function LegalNoticePage() {
  return (
    <LegalPageShell
      eyebrow="Legal"
      titleEn="Legal Notice"
      titleDe="Impressum"
      enContent={getLegalContent('legal-notice', 'en')}
      deContent={getLegalContent('legal-notice', 'de')}
    />
  );
}
