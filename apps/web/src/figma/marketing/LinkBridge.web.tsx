'use client';

/**
 * B1 Link Bridge — web (Figma 62:4). 1440×1024 cream canvas.
 * Thin wrapper: delegates all layout to BridgeWeb in _bridge.tsx.
 */

import { BridgeWeb } from './_bridge';

export default function LinkBridgeWeb() {
  return (
    <BridgeWeb
      kind="video"
      bubbleLine="Nice! I can build a full study path straight from this video."
      defaultGoal="Exam"
      ghostLabel="Use a different link"
    />
  );
}
