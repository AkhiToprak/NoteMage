/**
 * Dev seed for path-publishing Phase 1.
 *
 * Plants a DB state that downstream phases (P2 publish API, P3–P5
 * moderation pipeline, P6 admin dashboard, P7 human review, P8 library)
 * can boot against without manual fixture wiring.
 *
 * Idempotent: re-running upserts every row by stable cuid-style key
 * derived from email/username/title. Run with:
 *
 *   corepack pnpm --filter web exec tsx prisma/seed-path-publishing.ts
 *
 * Targets the DATABASE_URL of whatever environment you ran it against,
 * so do NOT run this against prod. See plans/path-publishing-community-
 * library.md §P1 ("Add a dev seed script").
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// Stable IDs keyed off the seed name so re-runs don't fan out duplicates.
// cuid format: 1 letter + 24 chars; we pad to keep prisma happy.
const ID = {
  adminUser: 'seedusrsharedpathadmin0001',
  userA: 'seedusrsharedpathauthor0001',
  userB: 'seedusrsharedpathauthor0002',
  plans: [
    'seedplnsharedpathseed00001',
    'seedplnsharedpathseed00002',
    'seedplnsharedpathseed00003',
    'seedplnsharedpathseed00004',
    'seedplnsharedpathseed00005',
    // P3 — L1-rejected fixture so the wordlist-reject branch of the
    // publication page is reachable in dev without invoking the API.
    'seedplnsharedpathseed00006',
  ] as const,
  sharedPaths: {
    pending: 'seedshpsharedpathpending01',
    auditingL2: 'seedshpsharedpathaudl2001',
    flagged: 'seedshpsharedpathflagged1',
    approved: 'seedshpsharedpathapproved',
    rejected: 'seedshpsharedpathrejected',
    // P3 — terminal-reject at L1 (wordlist) instead of L2.
    l1Rejected: 'seedshpsharedpathl1reject',
  },
  ticketFlagged: 'seedtktsharedpathflagged1',
  // P8 — variety set for the community library manual smoke test.
  // 16 approved fixtures spanning 4 languages × 4 subjects × 3 slot
  // buckets so the filter matrix + sort modes are exercisable in dev.
  // Stable cuid-shaped IDs keyed off (language, subject, idx) so the
  // upsert remains idempotent.
  librarySetPlanPrefix: 'seedplnlibrary',
  librarySetSharedPrefix: 'seedshplibrary',
} as const;

// P8 — community library fixtures. Sixteen approved rows so the
// /learn/community page has enough variety to manually exercise the
// subject × language × length matrix + the popular / recent / rating
// sort modes during the deploy-time walkthrough. Subjects are pulled
// from `path-subjects.ts` SUBJECT_IDS so the cards group cleanly with
// the existing subject filter strip. The plan's P8V "Pagination
// correctness against 100+ fixture rows" gate is covered numerically
// by the route's vitest suite (see `paths-list.test.ts § pages cleanly
// across a 100+ row fixture set`) — this seed gives dev/staging real
// rows for the manual leg, not a 100-row stress fixture.
const LIBRARY_FIXTURES: Array<{
  idx: number;
  language: 'en' | 'de' | 'fr' | 'es';
  subjects: string[];
  title: string;
  phaseCount: number;
  slotCount: number;
  downloadCount: number;
  viewCount: number;
  ratingAverage: number | null;
  ratingCount: number;
  seeded: boolean;
}> = [
  // EN — coding (short + medium + long)
  { idx: 0, language: 'en', subjects: ['coding'], title: 'TypeScript essentials', phaseCount: 3, slotCount: 9, downloadCount: 240, viewCount: 1620, ratingAverage: 4.7, ratingCount: 32, seeded: true },
  { idx: 1, language: 'en', subjects: ['coding'], title: 'React Server Components in practice', phaseCount: 4, slotCount: 16, downloadCount: 88, viewCount: 540, ratingAverage: 4.4, ratingCount: 14, seeded: false },
  { idx: 2, language: 'en', subjects: ['coding'], title: 'Compiler design fundamentals', phaseCount: 6, slotCount: 24, downloadCount: 19, viewCount: 220, ratingAverage: null, ratingCount: 0, seeded: false },
  // EN — math
  { idx: 3, language: 'en', subjects: ['math'], title: 'Linear algebra refresh', phaseCount: 4, slotCount: 12, downloadCount: 71, viewCount: 480, ratingAverage: 4.6, ratingCount: 9, seeded: false },
  // EN — language (Spanish for English speakers)
  { idx: 4, language: 'en', subjects: ['language'], title: 'Spanish A1 — survival kit', phaseCount: 3, slotCount: 9, downloadCount: 412, viewCount: 2310, ratingAverage: 4.8, ratingCount: 56, seeded: true },
  // DE — coding
  { idx: 5, language: 'de', subjects: ['coding'], title: 'Python für Einsteiger', phaseCount: 4, slotCount: 12, downloadCount: 156, viewCount: 980, ratingAverage: 4.5, ratingCount: 22, seeded: true },
  // DE — math
  { idx: 6, language: 'de', subjects: ['math'], title: 'Analysis I — Kompaktkurs', phaseCount: 5, slotCount: 18, downloadCount: 64, viewCount: 410, ratingAverage: 4.2, ratingCount: 7, seeded: false },
  // DE — science
  { idx: 7, language: 'de', subjects: ['science_natural'], title: 'Zellbiologie Schnelldurchlauf', phaseCount: 3, slotCount: 9, downloadCount: 31, viewCount: 220, ratingAverage: 4.0, ratingCount: 5, seeded: false },
  // DE — history
  { idx: 8, language: 'de', subjects: ['history_humanities'], title: 'Weimarer Republik', phaseCount: 4, slotCount: 12, downloadCount: 27, viewCount: 195, ratingAverage: null, ratingCount: 0, seeded: false },
  // DE — language (English for German speakers)
  { idx: 9, language: 'de', subjects: ['language'], title: 'Englisch B2 — Wirtschaftssprache', phaseCount: 5, slotCount: 19, downloadCount: 49, viewCount: 320, ratingAverage: 4.1, ratingCount: 6, seeded: false },
  // FR — coding
  { idx: 10, language: 'fr', subjects: ['coding'], title: 'JavaScript moderne (ES2024)', phaseCount: 3, slotCount: 9, downloadCount: 18, viewCount: 140, ratingAverage: null, ratingCount: 0, seeded: false },
  // FR — language
  { idx: 11, language: 'fr', subjects: ['language'], title: 'Allemand A2 — bases solides', phaseCount: 4, slotCount: 12, downloadCount: 22, viewCount: 165, ratingAverage: null, ratingCount: 0, seeded: false },
  // FR — social studies
  { idx: 12, language: 'fr', subjects: ['social_studies'], title: 'Droit constitutionnel français', phaseCount: 5, slotCount: 20, downloadCount: 11, viewCount: 90, ratingAverage: null, ratingCount: 0, seeded: false },
  // ES — language
  { idx: 13, language: 'es', subjects: ['language'], title: 'Inglés B1 — conversación cotidiana', phaseCount: 4, slotCount: 12, downloadCount: 36, viewCount: 240, ratingAverage: 4.3, ratingCount: 8, seeded: false },
  // ES — science
  { idx: 14, language: 'es', subjects: ['science_natural'], title: 'Física básica — mecánica', phaseCount: 3, slotCount: 9, downloadCount: 14, viewCount: 110, ratingAverage: null, ratingCount: 0, seeded: false },
  // ES — math
  { idx: 15, language: 'es', subjects: ['math'], title: 'Cálculo diferencial', phaseCount: 5, slotCount: 18, downloadCount: 9, viewCount: 75, ratingAverage: null, ratingCount: 0, seeded: false },
];

// 26 char IDs to satisfy the cuid-shaped stable-id convention used by
// the rest of the seed.
function libraryPlanId(idx: number): string {
  return `${ID.librarySetPlanPrefix}${String(idx).padStart(2, '0')}plan`;
}
function librarySharedId(idx: number): string {
  return `${ID.librarySetSharedPrefix}${String(idx).padStart(2, '0')}shp`;
}

// P12 — curated seed library. The free-tier switchover (plan §P12) can't
// ship until N≥20 seeded paths anchor the funnel (P0 §5.4). These are the
// dev/staging stand-ins so the precondition AND the P12V clone→study E2E
// are verifiable without hand-authoring 20 paths through the admin
// dashboard. All seeded=true → moderationStatus jumps straight to
// `approved`, `approvedAt`/`popularityTriggeredAt` are stamped (the
// popularity gate is pre-tripped for seeds per AC-Translate-14). Spread
// across the full popular language set (de/en/fr/es/it/tr) so the library
// language filter has real seeded coverage. Index 0 gets a full nested
// phase/slot/activity tree (see plantNestedContent) so a clone is
// immediately studiable; the rest are metadata-only, same as the P8 set.
const CURATED_SEED_FIXTURES: Array<{
  idx: number;
  language: 'en' | 'de' | 'fr' | 'es' | 'it' | 'tr';
  subjects: string[];
  title: string;
  phaseCount: number;
  slotCount: number;
  downloadCount: number;
  viewCount: number;
  ratingAverage: number | null;
  ratingCount: number;
}> = [
  { idx: 0, language: 'en', subjects: ['coding'], title: 'Git & GitHub from zero', phaseCount: 2, slotCount: 3, downloadCount: 980, viewCount: 5400, ratingAverage: 4.9, ratingCount: 124 },
  { idx: 1, language: 'en', subjects: ['coding'], title: 'SQL for everyday analysis', phaseCount: 4, slotCount: 14, downloadCount: 612, viewCount: 3120, ratingAverage: 4.7, ratingCount: 88 },
  { idx: 2, language: 'en', subjects: ['math'], title: 'Statistics you can actually use', phaseCount: 5, slotCount: 17, downloadCount: 433, viewCount: 2210, ratingAverage: 4.6, ratingCount: 51 },
  { idx: 3, language: 'en', subjects: ['language'], title: 'French A1 — first 1000 words', phaseCount: 4, slotCount: 12, downloadCount: 720, viewCount: 4010, ratingAverage: 4.8, ratingCount: 96 },
  { idx: 4, language: 'en', subjects: ['science_natural'], title: 'Chemistry: the mole & stoichiometry', phaseCount: 3, slotCount: 9, downloadCount: 188, viewCount: 1240, ratingAverage: 4.4, ratingCount: 27 },
  { idx: 5, language: 'de', subjects: ['coding'], title: 'JavaScript Grundlagen', phaseCount: 4, slotCount: 13, downloadCount: 540, viewCount: 2890, ratingAverage: 4.6, ratingCount: 73 },
  { idx: 6, language: 'de', subjects: ['math'], title: 'Lineare Algebra — Crashkurs', phaseCount: 5, slotCount: 18, downloadCount: 301, viewCount: 1670, ratingAverage: 4.5, ratingCount: 40 },
  { idx: 7, language: 'de', subjects: ['history_humanities'], title: 'Französische Revolution', phaseCount: 3, slotCount: 10, downloadCount: 142, viewCount: 980, ratingAverage: 4.3, ratingCount: 19 },
  { idx: 8, language: 'de', subjects: ['language'], title: 'Spanisch A2 — Alltag', phaseCount: 4, slotCount: 12, downloadCount: 233, viewCount: 1410, ratingAverage: 4.4, ratingCount: 31 },
  { idx: 9, language: 'fr', subjects: ['coding'], title: 'Python pour débutants', phaseCount: 4, slotCount: 12, downloadCount: 410, viewCount: 2230, ratingAverage: 4.7, ratingCount: 58 },
  { idx: 10, language: 'fr', subjects: ['math'], title: 'Probabilités — les bases', phaseCount: 3, slotCount: 9, downloadCount: 156, viewCount: 1020, ratingAverage: 4.2, ratingCount: 17 },
  { idx: 11, language: 'fr', subjects: ['science_natural'], title: 'Biologie cellulaire', phaseCount: 4, slotCount: 11, downloadCount: 121, viewCount: 870, ratingAverage: 4.5, ratingCount: 22 },
  { idx: 12, language: 'es', subjects: ['language'], title: 'Inglés A2 — viajar', phaseCount: 4, slotCount: 12, downloadCount: 388, viewCount: 2110, ratingAverage: 4.6, ratingCount: 49 },
  { idx: 13, language: 'es', subjects: ['coding'], title: 'HTML y CSS desde cero', phaseCount: 3, slotCount: 10, downloadCount: 274, viewCount: 1560, ratingAverage: 4.5, ratingCount: 36 },
  { idx: 14, language: 'es', subjects: ['history_humanities'], title: 'Historia del arte moderno', phaseCount: 5, slotCount: 16, downloadCount: 98, viewCount: 740, ratingAverage: 4.1, ratingCount: 12 },
  { idx: 15, language: 'it', subjects: ['language'], title: 'Inglese A1 — primi passi', phaseCount: 4, slotCount: 12, downloadCount: 205, viewCount: 1290, ratingAverage: 4.4, ratingCount: 28 },
  { idx: 16, language: 'it', subjects: ['math'], title: 'Analisi 1 — limiti e derivate', phaseCount: 5, slotCount: 19, downloadCount: 134, viewCount: 910, ratingAverage: 4.3, ratingCount: 16 },
  { idx: 17, language: 'tr', subjects: ['coding'], title: 'Programlamaya giriş (Python)', phaseCount: 4, slotCount: 12, downloadCount: 367, viewCount: 1980, ratingAverage: 4.8, ratingCount: 61 },
  { idx: 18, language: 'tr', subjects: ['language'], title: 'İngilizce A2 — günlük konuşma', phaseCount: 4, slotCount: 13, downloadCount: 290, viewCount: 1620, ratingAverage: 4.6, ratingCount: 44 },
  { idx: 19, language: 'tr', subjects: ['math'], title: 'Lise matematiği — fonksiyonlar', phaseCount: 3, slotCount: 9, downloadCount: 118, viewCount: 820, ratingAverage: 4.2, ratingCount: 14 },
  { idx: 20, language: 'en', subjects: ['social_studies'], title: 'Personal finance basics', phaseCount: 3, slotCount: 9, downloadCount: 845, viewCount: 4760, ratingAverage: 4.9, ratingCount: 110 },
];

function curatedPlanId(idx: number): string {
  return `seedcurpath${String(idx).padStart(2, '0')}plan`;
}
function curatedSharedId(idx: number): string {
  return `seedcurpath${String(idx).padStart(2, '0')}shp`;
}

// Plant a compact-but-complete phase/slot/activity tree on a curated seed
// plan so a clone is immediately studiable end-to-end (theory →
// flashcards → quiz). Idempotent: skips if the plan already has phases, so
// re-running the seed never fans out duplicate content. Mirrors the slot-
// kind composition rule (learning = theory+flashcards, review =
// flashcards+quiz, assessment = quiz only).
async function plantNestedContent(planId: string, ownerUserId: string) {
  const existing = await db.studyPhase.count({ where: { planId } });
  if (existing > 0) return;

  const start = new Date();
  const mid = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);

  const theoryBody = (text: string) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });

  await db.studyPhase.create({
    data: {
      planId,
      title: 'Foundations',
      description: 'Core concepts to get you moving.',
      sortOrder: 0,
      status: 'active',
      startDate: start,
      endDate: mid,
      slots: {
        create: [
          {
            title: 'Key ideas',
            description: 'Read the essentials, then drill them.',
            kind: 'learning',
            sortOrder: 0,
            activities: {
              create: [
                {
                  kind: 'theory',
                  title: 'Overview',
                  sortOrder: 0,
                  theory: {
                    create: {
                      title: 'Overview',
                      body: theoryBody(
                        'Welcome — this checkpoint introduces the core ideas you will build on throughout the path.',
                      ),
                    },
                  },
                },
                {
                  kind: 'flashcards',
                  title: 'Drill the basics',
                  sortOrder: 1,
                  flashcardSet: {
                    create: {
                      userId: ownerUserId,
                      title: 'Basics',
                      source: 'manual',
                      flashcards: {
                        create: [
                          { question: 'What does this path cover?', answer: 'The core fundamentals of the topic.', sortOrder: 0 },
                          { question: 'How do I pass a checkpoint?', answer: 'Complete each activity in the slot.', sortOrder: 1 },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
          {
            title: 'Check yourself',
            description: 'Review, then a quick quiz.',
            kind: 'review',
            sortOrder: 1,
            activities: {
              create: [
                {
                  kind: 'flashcards',
                  title: 'Review cards',
                  sortOrder: 0,
                  flashcardSet: {
                    create: {
                      userId: ownerUserId,
                      title: 'Review',
                      source: 'manual',
                      flashcards: {
                        create: [
                          { question: 'Recall: the first key idea?', answer: 'The fundamentals introduced in slot 1.', sortOrder: 0 },
                        ],
                      },
                    },
                  },
                },
                {
                  kind: 'quiz',
                  title: 'Quick check',
                  sortOrder: 1,
                  quizSet: {
                    create: {
                      userId: ownerUserId,
                      title: 'Quick check',
                      questions: {
                        create: [
                          {
                            kind: 'mc',
                            question: 'What is the goal of this checkpoint?',
                            options: ['Skip ahead', 'Reinforce the basics', 'Delete the path', 'Nothing'],
                            correctIndex: 1,
                            hint: 'Think about why review exists.',
                            correctExplanation: 'Right — review reinforces what you just learned.',
                            wrongExplanation: 'Not quite — review is about reinforcing the basics.',
                            sortOrder: 0,
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });

  await db.studyPhase.create({
    data: {
      planId,
      title: 'Put it together',
      description: 'A graded assessment to lock it in.',
      sortOrder: 1,
      status: 'upcoming',
      startDate: mid,
      endDate: end,
      slots: {
        create: [
          {
            title: 'Assessment',
            description: 'Pass to complete the path.',
            kind: 'assessment',
            sortOrder: 0,
            activities: {
              create: [
                {
                  kind: 'quiz',
                  title: 'Final check',
                  sortOrder: 0,
                  quizSet: {
                    create: {
                      userId: ownerUserId,
                      title: 'Final check',
                      questions: {
                        create: [
                          {
                            kind: 'mc',
                            question: 'Did you complete the foundations phase?',
                            options: ['Yes', 'No'],
                            correctIndex: 0,
                            hint: 'You did the work above.',
                            correctExplanation: 'Great — you are ready.',
                            wrongExplanation: 'Revisit the foundations phase first.',
                            sortOrder: 0,
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });
}

async function upsertUser(opts: {
  id: string;
  email: string;
  username: string;
  role: 'user' | 'admin';
  tier: 'FREE' | 'PRO';
}) {
  return db.user.upsert({
    where: { id: opts.id },
    update: {},
    create: {
      id: opts.id,
      email: opts.email,
      username: opts.username,
      role: opts.role,
      tier: opts.tier,
      onboardingComplete: true,
    },
  });
}

async function upsertPlan(opts: {
  id: string;
  userId: string;
  title: string;
  language: string;
  subjects?: string[];
}) {
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  return db.studyPlan.upsert({
    where: { id: opts.id },
    update: {},
    create: {
      id: opts.id,
      userId: opts.userId,
      title: opts.title,
      description: `Seed plan for ${opts.title}`,
      startDate: start,
      endDate: end,
      source: 'manual',
      generationStatus: 'ready',
      language: opts.language,
      subjects: opts.subjects ?? ['general'],
      subjectWeights: opts.subjects ? opts.subjects.map(() => 1) : [1],
    },
  });
}

async function upsertSharedPath(opts: {
  id: string;
  planId: string;
  sharedById: string;
  title: string;
  language: string;
  subjects: string[];
  moderationStatus:
    | 'pending'
    | 'auditing_l2'
    | 'flagged_pending_human'
    | 'approved'
    | 'rejected';
  seeded?: boolean;
  phaseCount?: number;
  slotCount?: number;
  approvedAt?: Date | null;
  rejectionReason?: string | null;
  popularityTriggeredAt?: Date | null;
}) {
  return db.sharedPath.upsert({
    where: { id: opts.id },
    update: {},
    create: {
      id: opts.id,
      planId: opts.planId,
      sharedById: opts.sharedById,
      title: opts.title,
      description: `Seed shared-path fixture in state ${opts.moderationStatus}`,
      language: opts.language,
      subjects: opts.subjects,
      phaseCount: opts.phaseCount ?? 3,
      slotCount: opts.slotCount ?? 9,
      moderationStatus: opts.moderationStatus,
      seeded: opts.seeded ?? false,
      approvedAt: opts.approvedAt ?? null,
      rejectionReason: opts.rejectionReason ?? null,
      popularityTriggeredAt: opts.popularityTriggeredAt ?? null,
    },
  });
}

async function main() {
  // 1 admin + 2 users — admin owns seeded path; userA owns the
  // pending/auditing/approved community paths; userB owns the
  // flagged and rejected community paths.
  const admin = await upsertUser({
    id: ID.adminUser,
    email: 'seed-admin@notemage.test',
    username: 'seed_admin',
    role: 'admin',
    tier: 'PRO',
  });
  const userA = await upsertUser({
    id: ID.userA,
    email: 'seed-userA@notemage.test',
    username: 'seed_user_a',
    role: 'user',
    tier: 'PRO',
  });
  const userB = await upsertUser({
    id: ID.userB,
    email: 'seed-userB@notemage.test',
    username: 'seed_user_b',
    role: 'user',
    tier: 'FREE',
  });

  // 5 plans — one per moderation state so SharedPath.@@unique(planId) holds.
  await Promise.all([
    upsertPlan({
      id: ID.plans[0],
      userId: admin.id,
      title: 'Seeded learning fundamentals',
      language: 'en',
      subjects: ['general'],
    }),
    upsertPlan({
      id: ID.plans[1],
      userId: userA.id,
      title: 'Algorithms warm-up',
      language: 'en',
      subjects: ['computer_science'],
    }),
    upsertPlan({
      id: ID.plans[2],
      userId: userA.id,
      title: 'Cell biology overview',
      language: 'de',
      subjects: ['biology'],
    }),
    upsertPlan({
      id: ID.plans[3],
      userId: userB.id,
      title: 'Possibly off-topic path',
      language: 'en',
      subjects: ['general'],
    }),
    upsertPlan({
      id: ID.plans[4],
      userId: userB.id,
      title: 'Already-rejected path',
      language: 'en',
      subjects: ['general'],
    }),
    upsertPlan({
      id: ID.plans[5],
      userId: userB.id,
      title: 'L1 wordlist-reject fixture',
      language: 'en',
      subjects: ['general'],
    }),
  ]);

  const now = new Date();

  // approved + seeded — anchor for the free-funnel; cache-warmed in P11.
  await upsertSharedPath({
    id: ID.sharedPaths.approved,
    planId: ID.plans[0],
    sharedById: admin.id,
    title: 'Seeded learning fundamentals',
    language: 'en',
    subjects: ['general'],
    moderationStatus: 'approved',
    seeded: true,
    approvedAt: now,
    popularityTriggeredAt: now,
  });

  // pending — fresh publish, L1 hasn't even run in the seed.
  await upsertSharedPath({
    id: ID.sharedPaths.pending,
    planId: ID.plans[1],
    sharedById: userA.id,
    title: 'Algorithms warm-up',
    language: 'en',
    subjects: ['computer_science'],
    moderationStatus: 'pending',
  });

  // auditing_l2 — passed L1, sitting in the async L2 queue.
  await upsertSharedPath({
    id: ID.sharedPaths.auditingL2,
    planId: ID.plans[2],
    sharedById: userA.id,
    title: 'Cell biology overview',
    language: 'de',
    subjects: ['biology'],
    moderationStatus: 'auditing_l2',
  });

  // flagged_pending_human — L2 flagged, L3 escalated; ticket exists.
  await upsertSharedPath({
    id: ID.sharedPaths.flagged,
    planId: ID.plans[3],
    sharedById: userB.id,
    title: 'Possibly off-topic path',
    language: 'en',
    subjects: ['general'],
    moderationStatus: 'flagged_pending_human',
  });

  // rejected — terminal state with a rejection reason composed from L2.
  await upsertSharedPath({
    id: ID.sharedPaths.rejected,
    planId: ID.plans[4],
    sharedById: userB.id,
    title: 'Already-rejected path',
    language: 'en',
    subjects: ['general'],
    moderationStatus: 'rejected',
    rejectionReason: 'l2.offtopic — content did not match a learnable topic',
  });

  // P3 — L1 wordlist-reject fixture. State is terminal-reject and the
  // ModerationAudit chain stops at layer 1 (no L2 row), mirroring what
  // runLayer1 produces on a real block hit. The rejection reason is
  // the copy composeAuthorMessage() generates for the adult category.
  await upsertSharedPath({
    id: ID.sharedPaths.l1Rejected,
    planId: ID.plans[5],
    sharedById: userB.id,
    title: 'L1 wordlist-reject fixture',
    language: 'en',
    subjects: ['general'],
    moderationStatus: 'rejected',
    rejectionReason:
      'wordlist.en.adult — your published path contains explicit or adult content not allowed in the community library (in: title).',
  });

  // Audit-chain fixtures so the admin dashboard (P6) has data to render.
  // We keep this simple: one L1 pass for every non-pending path, and the
  // appropriate L2/L3 rows for paths that progressed further.
  await db.moderationAudit.deleteMany({
    where: {
      sharedPathId: { in: Object.values(ID.sharedPaths) },
    },
  });
  await db.moderationAudit.createMany({
    data: [
      // approved/seeded: jumps straight to approved; record an L5 admin pass.
      {
        sharedPathId: ID.sharedPaths.approved,
        layer: 5,
        verdict: 'pass',
        reasonCode: null,
        reasoning: 'Seeded by admin — bypassed L1/L2/L3 per spec.',
        actorId: admin.id,
      },
      // auditing_l2: L1 pass exists, L2 hasn't returned yet.
      {
        sharedPathId: ID.sharedPaths.auditingL2,
        layer: 1,
        verdict: 'pass',
        reasonCode: null,
      },
      // flagged: L1 pass → L2 flag → L3 escalate.
      { sharedPathId: ID.sharedPaths.flagged, layer: 1, verdict: 'pass' },
      {
        sharedPathId: ID.sharedPaths.flagged,
        layer: 2,
        verdict: 'flag',
        reasonCode: 'l2.offtopic',
        reasoning: 'Borderline off-topic; needs human eyes.',
        model: 'gemini-2.5-flash',
      },
      {
        sharedPathId: ID.sharedPaths.flagged,
        layer: 3,
        verdict: 'escalate_to_human',
        reasonCode: 'l3.offtopic',
        reasoning: 'Confirms L2 — not auto-rejectable, send to human.',
        model: 'claude-sonnet-4-6',
      },
      // rejected: L1 pass → L2 reject.
      { sharedPathId: ID.sharedPaths.rejected, layer: 1, verdict: 'pass' },
      {
        sharedPathId: ID.sharedPaths.rejected,
        layer: 2,
        verdict: 'reject',
        reasonCode: 'l2.offtopic',
        reasoning: 'Content did not match a learnable topic.',
        model: 'gemini-2.5-flash',
      },
      // P3 — L1 reject (wordlist). Chain stops here; no L2 row.
      // reasoning mirrors composeAuditNotes()'s output shape.
      {
        sharedPathId: ID.sharedPaths.l1Rejected,
        layer: 1,
        verdict: 'reject',
        reasonCode: 'wordlist.en.adult',
        reasoning: 'block:en:fuck:adult@title×1',
      },
    ],
  });

  // One open moderation ticket for the flagged path. AdminDashboard P6
  // queries by status=open ORDER BY createdAt ASC, so this row drives it.
  await db.ticket.upsert({
    where: { id: ID.ticketFlagged },
    update: {},
    create: {
      id: ID.ticketFlagged,
      type: 'moderation_review',
      refType: 'SharedPath',
      refId: ID.sharedPaths.flagged,
      status: 'open',
    },
  });

  // P8 — community library variety set. Cycles ownership across the
  // three seed users so `filter=mine` lands on a non-empty result when
  // logged in as either userA, userB, or admin. The approve timestamps
  // step backwards by `idx` days so the `sort=recent` order is
  // deterministic across re-runs (newest fixture = idx 0).
  const libraryOwners = [admin.id, userA.id, userB.id];
  const baseApprovedAt = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  for (const fx of LIBRARY_FIXTURES) {
    const ownerId = libraryOwners[fx.idx % libraryOwners.length];
    const planId = libraryPlanId(fx.idx);
    const sharedId = librarySharedId(fx.idx);
    const approvedAt = new Date(baseApprovedAt - fx.idx * ONE_DAY_MS);

    await db.studyPlan.upsert({
      where: { id: planId },
      update: {},
      create: {
        id: planId,
        userId: ownerId,
        title: fx.title,
        description: `Seed library fixture (${fx.language}, ${fx.subjects[0]})`,
        startDate: new Date(approvedAt.getTime() - 30 * ONE_DAY_MS),
        endDate: new Date(approvedAt.getTime() + 30 * ONE_DAY_MS),
        source: 'manual',
        generationStatus: 'ready',
        language: fx.language,
        subjects: fx.subjects,
        subjectWeights: fx.subjects.map(() => 1),
      },
    });

    await db.sharedPath.upsert({
      where: { id: sharedId },
      update: {},
      create: {
        id: sharedId,
        planId,
        sharedById: ownerId,
        title: fx.title,
        description: `A ${fx.language.toUpperCase()} ${fx.subjects[0]} path — ${fx.phaseCount} phases, ${fx.slotCount} checkpoints.`,
        language: fx.language,
        subjects: fx.subjects,
        phaseCount: fx.phaseCount,
        slotCount: fx.slotCount,
        moderationStatus: 'approved',
        seeded: fx.seeded,
        approvedAt,
        downloadCount: fx.downloadCount,
        viewCount: fx.viewCount,
        ratingAverage: fx.ratingAverage,
        ratingCount: fx.ratingCount,
        popularityTriggeredAt: fx.seeded ? approvedAt : null,
      },
    });
  }

  // P12 — curated seed library (≥20 seeded paths). All admin-owned and
  // seeded=true so they satisfy the §5.4 switchover precondition. Index 0
  // gets the full nested content tree so the P12V clone→study E2E has a
  // genuinely studiable target; the rest are metadata-only.
  const curatedApprovedBase = Date.now();
  for (const fx of CURATED_SEED_FIXTURES) {
    const planId = curatedPlanId(fx.idx);
    const sharedId = curatedSharedId(fx.idx);
    const approvedAt = new Date(curatedApprovedBase - fx.idx * ONE_DAY_MS);

    await db.studyPlan.upsert({
      where: { id: planId },
      update: {},
      create: {
        id: planId,
        userId: admin.id,
        title: fx.title,
        description: `Curated seed path (${fx.language}, ${fx.subjects[0]})`,
        startDate: new Date(approvedAt.getTime() - 14 * ONE_DAY_MS),
        endDate: new Date(approvedAt.getTime() + 14 * ONE_DAY_MS),
        source: 'manual',
        generationStatus: 'ready',
        language: fx.language,
        subjects: fx.subjects,
        subjectWeights: fx.subjects.map(() => 1),
      },
    });

    await db.sharedPath.upsert({
      where: { id: sharedId },
      update: {},
      create: {
        id: sharedId,
        planId,
        sharedById: admin.id,
        title: fx.title,
        description: `A ${fx.language.toUpperCase()} ${fx.subjects[0]} path — ${fx.phaseCount} phases, ${fx.slotCount} checkpoints. Curated by the NoteMage team.`,
        language: fx.language,
        subjects: fx.subjects,
        phaseCount: fx.phaseCount,
        slotCount: fx.slotCount,
        moderationStatus: 'approved',
        seeded: true,
        approvedAt,
        downloadCount: fx.downloadCount,
        viewCount: fx.viewCount,
        ratingAverage: fx.ratingAverage,
        ratingCount: fx.ratingCount,
        // Seeded paths pre-trip the popularity gate (AC-Translate-14).
        popularityTriggeredAt: approvedAt,
      },
    });
  }

  // Give the first curated seed a real, studiable content tree.
  await plantNestedContent(curatedPlanId(0), admin.id);

  // ── P13 — Layer-4 reports + trust scoring fixtures ──────────────────
  // A NON-seeded approved community path (userA-owned) carrying two open
  // reports from two distinct reporters. Two is below the default
  // REPORT_REMODERATION_THRESHOLD of 3, so it has NOT auto-pulled — the
  // report dialog is reachable on a path you don't own, and adding a
  // third report (or lowering the threshold) trips the re-moderation.
  const P13_PLAN_ID = 'seedplnp13reported0000001';
  const P13_SHARED_ID = 'seedshpp13reported000shp1';
  await upsertPlan({
    id: P13_PLAN_ID,
    userId: userA.id,
    title: 'Reported path — community flags demo',
    language: 'en',
    subjects: ['general'],
  });
  await upsertSharedPath({
    id: P13_SHARED_ID,
    planId: P13_PLAN_ID,
    sharedById: userA.id,
    title: 'Reported path — community flags demo',
    language: 'en',
    subjects: ['general'],
    moderationStatus: 'approved',
    approvedAt: now,
  });
  for (const [reporterId, reason, detail] of [
    [admin.id, 'spam', 'Buy-now links in two checkpoint titles.'],
    [userB.id, 'low_quality', 'Flashcards have several wrong dates.'],
  ] as const) {
    await db.report.upsert({
      where: {
        sharedPathId_reporterId: { sharedPathId: P13_SHARED_ID, reporterId },
      },
      update: { reason, detail },
      create: {
        sharedPathId: P13_SHARED_ID,
        reporterId,
        reason,
        detail,
        status: 'open',
      },
    });
  }

  // Trust scores: userA trusted (future publishes fast-path through L2),
  // userB untrusted (their next L2-pass gets downgraded to the deep L3
  // audit). Explicit updates so re-runs converge regardless of prior
  // state (upsertUser's update clause is intentionally a no-op).
  await db.user.update({ where: { id: admin.id }, data: { publishTrustScore: 10 } });
  await db.user.update({ where: { id: userA.id }, data: { publishTrustScore: 3 } });
  await db.user.update({ where: { id: userB.id }, data: { publishTrustScore: 0 } });

  console.log('Seeded path-publishing fixtures:');
  console.log(`  users     → admin=${admin.username}, ${userA.username}, ${userB.username}`);
  console.log(
    `  plans     → ${ID.plans.length} (state machine) + ${LIBRARY_FIXTURES.length} (library) + ${CURATED_SEED_FIXTURES.length} (curated seed)`,
  );
  console.log(
    `  paths     → ${Object.keys(ID.sharedPaths).length} (state machine, incl. L1/L2-reject + flagged) + ${LIBRARY_FIXTURES.length} (approved library) + ${CURATED_SEED_FIXTURES.length} (curated seed, all seeded=true)`,
  );
  console.log(
    `  curated   → ${CURATED_SEED_FIXTURES.length} seeded paths (≥20 precondition for P12 switchover); idx 0 has full nested content for the clone→study E2E`,
  );
  console.log(`  tickets   → 1 open (refers to flagged path)`);
  console.log(
    `  reports   → 2 open on a non-seeded approved path (sub-threshold); trust scores set (admin=10, userA=3, userB=0)`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
