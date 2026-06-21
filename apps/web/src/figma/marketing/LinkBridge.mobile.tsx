'use client';

/**
 * B1 Link Bridge — mobile (derived 393px reflow; web-only in Figma).
 * Thin wrapper: delegates all layout to BridgeMobile in _bridge.tsx.
 */

import { BridgeMobile } from './_bridge';

export default function LinkBridgeMobile() {
  return (
    <BridgeMobile
      kind="video"
      bubbleLine="Nice! I can build a full study path straight from this video."
      defaultGoal="Exam"
      ghostLabel="Use a different link"
    />
  );
}
