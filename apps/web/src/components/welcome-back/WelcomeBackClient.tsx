'use client';

import { useState } from 'react';
import { WelcomeBackOverlay } from './WelcomeBackOverlay';

/** Holds the open state for the takeover so it can dismiss itself. Rendered by
 *  the server gate only when the user is actually returning. */
export function WelcomeBackClient() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return <WelcomeBackOverlay onDismiss={() => setOpen(false)} />;
}

export default WelcomeBackClient;
