'use client';

/**
 * B2 Upload Bridge — web (Figma 62:6). 1440×1024 cream canvas.
 * Thin wrapper: delegates all layout to BridgeWeb in _bridge.tsx.
 */

import { BridgeWeb } from './_bridge';

export default function UploadBridgeWeb() {
  return (
    <BridgeWeb
      kind="file"
      bubbleLine="Got it, I'll read your file and turn it into a study path."
      defaultGoal="Understand"
      ghostLabel="Choose a different file"
    />
  );
}
