import type { GateStrategy } from '@prisma/client';

// Phase 5 — Learn Path gating. Pure functions, no I/O. Same input → same output.
// The same logic runs server-side (to enforce gates) and client-side (to render
// node state in PathView).

export interface MaterialLite {
  id: string;
  sortOrder: number;
  completed: boolean;
  prerequisiteMaterialIds: string[];
}

export interface PhaseLite {
  id: string;
  sortOrder: number;
  gateStrategy: GateStrategy;
  materials: MaterialLite[];
}

export type GateResult = { unlocked: boolean; reason?: string };

function sortPhases<P extends PhaseLite>(phases: P[]): P[] {
  return [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
}

function sortMaterials<M extends MaterialLite>(materials: M[]): M[] {
  return [...materials].sort((a, b) => a.sortOrder - b.sortOrder);
}

// A phase whose `gateStrategy === 'checkpoint'` has its LAST material (by
// sortOrder) as the checkpoint quiz. The AI prompt that generates plans makes
// sure that material is `type='quiz_set'`. Other strategies have no checkpoint.
export function getCheckpointMaterialId(phase: PhaseLite): string | null {
  if (phase.gateStrategy !== 'checkpoint') return null;
  const sorted = sortMaterials(phase.materials);
  const last = sorted[sorted.length - 1];
  return last?.id ?? null;
}

export function isCheckpointMaterial(phase: PhaseLite, materialId: string): boolean {
  return getCheckpointMaterialId(phase) === materialId;
}

// Phase 0 is always unlocked. Only `checkpoint` phases gate the next phase;
// `open` / `sequential` phases let the next one start immediately. This is
// what keeps legacy plans (gateStrategy='open' by default) fully unlocked in
// /learn — passing the no-breaking-change bar in the manual test plan.
export function isPhaseUnlocked(phases: PhaseLite[], phaseId: string): GateResult {
  const sorted = sortPhases(phases);
  const idx = sorted.findIndex((p) => p.id === phaseId);
  if (idx < 0) return { unlocked: false, reason: 'phase_not_found' };
  if (idx === 0) return { unlocked: true };

  const prev = sorted[idx - 1];
  if (prev.gateStrategy !== 'checkpoint') return { unlocked: true };

  const checkpointId = getCheckpointMaterialId(prev);
  const checkpoint = prev.materials.find((m) => m.id === checkpointId);
  if (!checkpoint) return { unlocked: false, reason: 'previous_phase_has_no_checkpoint' };
  return checkpoint.completed
    ? { unlocked: true }
    : { unlocked: false, reason: 'previous_checkpoint_not_passed' };
}

// Within an unlocked phase:
// - open: all materials unlocked.
// - sequential / checkpoint: material M unlocked iff sortOrder === 0 OR the
//   prior material (by sortOrder) is completed.
// Explicit prerequisiteMaterialIds always apply on top: if non-empty, every
// listed id must be completed regardless of strategy.
export function isMaterialUnlocked(
  phase: PhaseLite,
  materialId: string,
  phaseUnlocked: boolean
): GateResult {
  if (!phaseUnlocked) return { unlocked: false, reason: 'phase_locked' };

  const sorted = sortMaterials(phase.materials);
  const target = sorted.find((m) => m.id === materialId);
  if (!target) return { unlocked: false, reason: 'material_not_found' };

  if (target.prerequisiteMaterialIds.length > 0) {
    const byId = new Map(sorted.map((m) => [m.id, m]));
    const missing = target.prerequisiteMaterialIds.filter((pid) => !byId.get(pid)?.completed);
    if (missing.length > 0) return { unlocked: false, reason: 'prerequisites_incomplete' };
  }

  if (phase.gateStrategy === 'open') return { unlocked: true };

  const targetIdx = sorted.findIndex((m) => m.id === materialId);
  if (targetIdx === 0) return { unlocked: true };
  const prior = sorted[targetIdx - 1];
  return prior.completed
    ? { unlocked: true }
    : { unlocked: false, reason: 'prior_material_incomplete' };
}

// Bulk annotator used by GET /api/study-plans to precompute UI flags so the
// client never has to know the gating rules. Generic so callers that pass
// richer phase / material rows (e.g. Prisma results with title, type, etc.)
// keep those fields on the annotated output.
export type AnnotatedMaterial<M extends MaterialLite = MaterialLite> = M & {
  unlocked: boolean;
  isCheckpoint: boolean;
};

export interface AnnotatedPhase<P extends PhaseLite> {
  source: P;
  unlocked: boolean;
  unlockReason?: string;
  materials: AnnotatedMaterial<P['materials'][number]>[];
}

export function annotatePhases<P extends PhaseLite>(phases: P[]): AnnotatedPhase<P>[] {
  const sorted = sortPhases(phases);
  return sorted.map((phase) => {
    const phaseGate = isPhaseUnlocked(sorted, phase.id);
    const checkpointId = getCheckpointMaterialId(phase);
    const materials = sortMaterials(phase.materials).map((m) => {
      const matGate = isMaterialUnlocked(phase, m.id, phaseGate.unlocked);
      return {
        ...m,
        unlocked: matGate.unlocked,
        isCheckpoint: m.id === checkpointId,
      } as AnnotatedMaterial<P['materials'][number]>;
    });
    return {
      source: phase,
      unlocked: phaseGate.unlocked,
      unlockReason: phaseGate.reason,
      materials,
    };
  });
}
