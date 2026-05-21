import type { Metadata } from 'next';
import LegalPageShell from '@/components/legal/LegalPageShell';
import { getLegalContent } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Refund Policy — Notemage',
  description:
    'Refund Policy / Rückerstattungsrichtlinie for Notemage, including a 14-day money-back guarantee on Pro subscriptions.',
};

export default function RefundPage() {
  return (
    <LegalPageShell
      eyebrow="Legal"
      titleEn="Refund Policy"
      titleDe="Rückerstattungsrichtlinie"
      enContent={getLegalContent('refund', 'en')}
      deContent={getLegalContent('refund', 'de')}
    />
  );
}
