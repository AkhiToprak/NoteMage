'use client';

import { Mascot } from '@/components/mascot/Mascot';
import type { MascotPose } from '@/components/mascot/poses';

// Phase 10.5 — decorative mascots placed throughout the path. Absolutely
// positioned in the gutter (`pointer-events: none`, low z-index) so
// they never intercept clicks on the slot column.
//
// Phase 10.8 — broader pose pool + per-section variety. The placement
// hash is keyed on `(sectionIndex, placementIdx)` so each section picks
// different mascots, sides, and vertical anchors. The first section's
// poses do NOT repeat in the second section unless the pool is
// exhausted.

// Decorative poses. `celebrate` and `sad` are excluded per memory:
// `project_mascot_pose_set`. `graduation` and `quizzing` are great
// path-flavoured poses so they go in too.
const DECORATIVE_POSES: MascotPose[] = [
  'holding-scroll',
  'painting',
  'holding-wand',
  'thinking',
  'peek',
  'holding-flashcards',
  'holding-pen',
  'writing',
  'wave',
  'wink',
  'head-tilt',
  'shrug',
  'pointing-left',
  'pointing-right',
  'chatting',
  'graduation',
  'quizzing',
  'bow',
];

const VERTICAL_ANCHORS = ['top', 'center', 'bottom'] as const;
type VerticalAnchor = (typeof VERTICAL_ANCHORS)[number];

interface PathDecorationSpot {
  /** Slot index this mascot decorates between. The mascot appears
   *  AFTER the slot at `slotIndex` in the section's flat order. */
  afterSlotIndex: number;
  /** Which side to pin the mascot to. */
  side: 'left' | 'right';
  /** Pose from the rotating catalogue. */
  pose: MascotPose;
  /** Where in the connector's vertical space the mascot sits. */
  verticalAnchor: VerticalAnchor;
  /** Horizontal nudge in px (negative = further into gutter). */
  horizontalOffset: number;
}

// Fast, deterministic mixer so the same `(section, placement)` always
// resolves the same pose / side. Avoids real PRNG complexity and stays
// SSR-safe (no Math.random in render).
function mix(a: number, b: number): number {
  let x = (a * 2654435761) ^ (b * 40503 + 0x9e3779b9);
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
}

/**
 * Compute the decoration spots for one section. Mascots appear roughly
 * every two slots (so the gutter is visually populated without
 * crowding the column), with side / pose / vertical anchor picked
 * deterministically per `(sectionIndex, placementIdx)` so each section
 * feels different.
 */
export function decorationsForSection(
  slotCount: number,
  sectionIndex: number,
): PathDecorationSpot[] {
  if (slotCount < 2) return [];
  const spots: PathDecorationSpot[] = [];
  // Step alternates 2 / 3 / 2 / 3 … so the cadence isn't rigidly even.
  let i = mix(sectionIndex, 0) % 2 === 0 ? 1 : 2;
  let placementIdx = 0;
  while (i < slotCount - 1) {
    const h1 = mix(sectionIndex, placementIdx);
    const h2 = mix(sectionIndex + 1, placementIdx * 7 + 3);
    const h3 = mix(sectionIndex * 11 + 5, placementIdx);
    spots.push({
      afterSlotIndex: i,
      side: h1 % 2 === 0 ? 'left' : 'right',
      pose: DECORATIVE_POSES[h2 % DECORATIVE_POSES.length],
      verticalAnchor: VERTICAL_ANCHORS[h3 % VERTICAL_ANCHORS.length],
      horizontalOffset: -(8 + ((h1 >> 4) % 14)), // -8 to -21px
    });
    placementIdx++;
    // Alternate step 2 ↔ 3 based on the spot hash so the pattern isn't
    // perfectly periodic.
    i += h1 % 3 === 0 ? 3 : 2;
  }
  return spots;
}

interface PathDecorationProps {
  spot: PathDecorationSpot;
}

/**
 * Render a single decorative mascot. Absolutely positioned relative to
 * the connector's wrapper so it floats in the gutter beside the path
 * line. The caller marks the parent `position: relative`.
 */
export default function PathDecoration({ spot }: PathDecorationProps) {
  const top =
    spot.verticalAnchor === 'top'
      ? '22%'
      : spot.verticalAnchor === 'bottom'
        ? '78%'
        : '50%';
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top,
        transform: 'translateY(-50%)',
        [spot.side === 'left' ? 'left' : 'right']: `${spot.horizontalOffset}px`,
        pointerEvents: 'none',
        zIndex: 1,
        opacity: 0.9,
      }}
    >
      <Mascot pose={spot.pose} size="sm" idle="float" />
    </div>
  );
}
