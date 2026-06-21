'use client';

/**
 * B2 Upload Bridge — mobile (derived 393px reflow; web-only in Figma).
 * Thin wrapper: delegates all layout to BridgeMobile in _bridge.tsx.
 */

import { BridgeMobile } from './_bridge';

export default function UploadBridgeMobile() {
  return (
    <BridgeMobile
      kind="file"
      bubbleLine="Got it, I'll read your file and turn it into a study path."
      defaultGoal="Understand"
      ghostLabel="Choose a different file"
    />
  );
}
