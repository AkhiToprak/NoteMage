'use client';

/* Mage Revolution Phase 10 — auto-open the panel when a route carries
 * `?mage=open`. That is the redirect target for the retired /learn/chats links
 * (see next.config redirects), so an old bookmark / notification deep-link lands
 * in the global panel instead of a dead route.
 *
 * Reads `window.location.search` inside an effect rather than `useSearchParams()`
 * — the latter opts every dashboard route out of static rendering. After opening
 * it strips the `mage` param so a reload / back-button doesn't reopen the panel.
 */

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useMage } from './MageProvider';

export function MageAutoOpen() {
  const { open } = useMage();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('mage') !== 'open') return;
    open();
    params.delete('mage');
    const qs = params.toString();
    router.replace(`${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [open, router, pathname]);

  return null;
}

export default MageAutoOpen;
