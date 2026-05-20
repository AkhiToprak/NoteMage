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
  ] as const,
  sharedPaths: {
    pending: 'seedshpsharedpathpending01',
    auditingL2: 'seedshpsharedpathaudl2001',
    flagged: 'seedshpsharedpathflagged1',
    approved: 'seedshpsharedpathapproved',
    rejected: 'seedshpsharedpathrejected',
  },
  ticketFlagged: 'seedtktsharedpathflagged1',
} as const;

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

  console.log('Seeded path-publishing fixtures:');
  console.log(`  users     → admin=${admin.username}, ${userA.username}, ${userB.username}`);
  console.log(`  plans     → ${ID.plans.length}`);
  console.log(`  paths     → ${Object.keys(ID.sharedPaths).length} (one per state)`);
  console.log(`  tickets   → 1 open (refers to flagged path)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
