'use client';

import { Mascot } from '@/components/mascot/Mascot';
import type { MascotPose } from '@/components/mascot/poses';

// Phase 10.5 — decorative mascots placed between every 3rd–4th slot
// down the path. Absolutely positioned to the OPPOSITE side of the
// path's current offset (so they don't overlap the slot column), with
// `pointer-events: none` and a z-index below the slot buttons so they
// never intercept clicks.

// Pose cycle, in order. The plan called for `reading` — we fall back
// to `holding-scroll` since that's the closest pose in the project's
// mascot catalogue (`reading` isn't in poses.ts). `celebrate` and
// `sad` are deliberately excluded per memory:
// `project_mascot_pose_set` — both poses were dropped from the set.
const DECORATIVE_POSES: MascotPose[] = [
  'holding-scroll',
  'painting',
  'holding-wand',
  'thinking',
  'peek',
];

interface PathDecorationSpot {
  /** Slot index this mascot decorates between. The mascot appears
   *  AFTER the slot at `slotIndex` in the section's flat order. */
  afterSlotIndex: number;
  /** Which side to pin the mascot to. Opposite of the next slot's
   *  alignment so the mascot doesn't sit on top of the slot. */
  side: 'left' | 'right';
  /** Pose from the rotating catalogue. */
  pose: MascotPose;
}

/**
 * Compute the decoration spots for one section. Mascots appear after
 * every 3rd slot (i.e. between slot 2 and 3, 5 and 6, …), alternating
 * sides and cycling through the pose list. Returns an empty array
 * when the section has fewer than 3 slots.
 */
export function decorationsForSection(slotCount: number): PathDecorationSpot[] {
  if (slotCount < 3) return [];
  const spots: PathDecorationSpot[] = [];
  let poseIdx = 0;
  for (let i = 2; i < slotCount - 1; i += 3) {
    spots.push({
      afterSlotIndex: i,
      side: poseIdx % 2 === 0 ? 'left' : 'right',
      pose: DECORATIVE_POSES[poseIdx % DECORATIVE_POSES.length],
    });
    poseIdx++;
  }
  return spots;
}

interface PathDecorationProps {
  spot: PathDecorationSpot;
}

/**
 * Render a single decorative mascot. Absolutely positioned relative
 * to the slot row's wrapper so it floats in the column gutter. The
 * caller should mark the parent `position: relative` and place this
 * inside that relative container.
 */
export default function PathDecoration({ spot }: PathDecorationProps) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        [spot.side === 'left' ? 'left' : 'right']: '-12px',
        pointerEvents: 'none',
        zIndex: 1,
        opacity: 0.9,
      }}
    >
      <Mascot pose={spot.pose} size="sm" idle="float" />
    </div>
  );
}
