import type { Metadata } from 'next';
import LegalPageShell from '@/components/legal/LegalPageShell';
import { getLegalContent } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Privacy Policy — Notemage',
  description:
    'Privacy Policy / Datenschutzerklärung for Notemage. How we handle your data on the waitlist and beyond.',
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      eyebrow="Legal"
      titleEn="Privacy Policy"
      titleDe="Datenschutzerklärung"
      enContent={getLegalContent('privacy', 'en')}
      deContent={getLegalContent('privacy', 'de')}
    />
  );
}
