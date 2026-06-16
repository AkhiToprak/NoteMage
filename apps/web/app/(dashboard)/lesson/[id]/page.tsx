'use client';

import { useParams, useRouter } from 'next/navigation';
import { LessonView } from '@/components/rework/LessonView';
import type { LessonContent } from '@/components/rework/LessonView';

// ─── Sample lesson map ─────────────────────────────────────────────────────────
// Placeholder content — replace with real path-theory data once the lesson API
// is wired. Each entry is keyed by a slug / theory-activity id.

const LESSONS: Record<string, LessonContent> = {
  diffusion: {
    difficulty: 'medium',
    title: 'Diffusion',
    simple:
      'Diffusion is the movement of particles from an area of high concentration to an area of low concentration.',
    why: 'Cells use diffusion to move small particles without using energy.',
    example:
      'If perfume is sprayed in one corner of a room, it spreads out until the smell is everywhere.',
    examWording: 'Particles move down the concentration gradient.',
    commonMistake: 'Diffusion does not require energy. Active transport does.',
    quickCheck: {
      question: 'Does diffusion require energy?',
      options: [
        'Yes, always',
        'No — it moves down the concentration gradient',
        'Only in animal cells',
        'Only at night',
      ],
      answerIndex: 1,
      explanation:
        'Diffusion is passive — particles move down the gradient with no energy input.',
    },
  },

  intro: {
    difficulty: 'easy',
    title: 'Introduction to Cells',
    simple:
      'The cell is the basic unit of life. Every living organism is made of one or more cells.',
    why:
      'Understanding cells is the foundation of biology — from how medicines work to why organisms grow.',
    example:
      'A human red blood cell is around 7 µm wide. A single teaspoon of blood holds roughly 25 billion of them.',
    examWording: 'Cells are the structural and functional units of all living organisms.',
    commonMistake:
      'Plant cells have a cell wall; animal cells do not. Don\'t confuse the cell wall (rigid, outside) with the cell membrane (flexible, present in both).',
    quickCheck: {
      question: 'Which structure is found in plant cells but NOT animal cells?',
      options: [
        'Cell membrane',
        'Mitochondria',
        'Cell wall',
        'Nucleus',
      ],
      answerIndex: 2,
      explanation:
        'Plant cells have a rigid cell wall made of cellulose outside the membrane. Animal cells have only a cell membrane.',
    },
  },

  osmosis: {
    difficulty: 'medium',
    title: 'Osmosis',
    simple:
      'Osmosis is the movement of water molecules across a partially permeable membrane from an area of high water potential to low water potential.',
    why:
      'Osmosis controls water balance in cells — too little or too much water can cause a cell to shrink or burst.',
    example:
      'Placing a red blood cell in pure water causes it to swell and potentially burst as water floods in by osmosis.',
    examWording:
      'Water moves from a dilute solution (high water potential) to a concentrated solution (low water potential) through a partially permeable membrane.',
    commonMistake:
      'Osmosis is specifically the movement of water, not solutes. For solute movement, think diffusion or active transport.',
    quickCheck: {
      question: 'What moves during osmosis?',
      options: [
        'Glucose molecules',
        'Water molecules',
        'Sodium ions',
        'Oxygen gas',
      ],
      answerIndex: 1,
      explanation:
        'Osmosis moves water molecules through a partially permeable membrane — from high to low water potential.',
    },
  },
};

const FALLBACK_ID = 'diffusion';

// ─── Route component ───────────────────────────────────────────────────────────

export default function LessonPage() {
  const params = useParams();
  const router = useRouter();

  const rawId = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? '');
  const lessonId = rawId && rawId in LESSONS ? rawId : FALLBACK_ID;
  const lesson = LESSONS[lessonId];

  // Determine position in a fixed ordered list for progress display
  const orderedIds = ['intro', 'diffusion', 'osmosis'];
  const listIndex = orderedIds.indexOf(lessonId);
  const index = listIndex >= 0 ? listIndex + 1 : 2;
  const total = orderedIds.length;

  return (
    <LessonView
      lesson={lesson}
      index={index}
      total={total}
      backHref="/my-path"
      onContinue={() => router.push('/my-path')}
    />
  );
}
