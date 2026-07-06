import { db } from '@/lib/db';
import { cancelLemonSqueezySubscription } from '@/lib/lemonsqueezy';
import { deleteNotebookFiles, deleteDirectory } from '@/lib/storage';
import { supabase, BUCKET_PUBLIC } from '@/lib/supabase';

/**
 * Fully delete a user: cancel their billing, purge their object storage, then
 * delete the row (Prisma cascade clears the rest). Shared by the self-serve
 * delete-account route and the paused-account deletion sweep. Idempotent — a
 * missing user is a no-op. Storage cleanup is best-effort so a provider hiccup
 * never strands a half-deleted account.
 */
export async function deleteUserCompletely(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true, entitlementSource: true, lemonSqueezySubscriptionId: true },
  });
  if (!user) return;

  // 1) Cancel any active Lemon Squeezy subscription BEFORE deleting the row.
  //    The User row holds the only handle to the subscription; once it's gone the
  //    billing webhook can't resolve the user, so renewals would keep charging
  //    with nothing left to cancel against. (Apple/RevenueCat subs can only be
  //    cancelled by the user in the App Store.)
  if (user.entitlementSource === 'LEMON_SQUEEZY' && user.lemonSqueezySubscriptionId) {
    try {
      await cancelLemonSqueezySubscription(user.lemonSqueezySubscriptionId);
    } catch (err) {
      console.error('[account-deletion] Lemon Squeezy cancel failed', err);
      // Continue — don't strand the user mid-deletion over a provider hiccup.
    }
  }

  // 2) Remove the user's Supabase Storage objects. Prisma's cascade only clears
  //    DB rows; uploaded PDFs / page images / flashcard images / the public avatar
  //    live in object storage and would otherwise orphan (incomplete GDPR Art.17
  //    erasure). Best-effort — never block deletion on a storage error.
  try {
    const notebooks = await db.studyContainer.findMany({
      where: { userId },
      select: { id: true, sections: { select: { pages: { select: { id: true } } } } },
    });
    for (const nb of notebooks) {
      const pageIds = nb.sections.flatMap((s) => s.pages.map((p) => p.id));
      await deleteNotebookFiles(nb.id, pageIds);
    }
    const cards = await db.flashcard.findMany({
      where: { flashcardSet: { notebook: { userId } } },
      select: { id: true },
    });
    for (const card of cards) {
      await deleteDirectory(`flashcard-images/${card.id}`);
    }
    // Public-bucket avatar object (its path is embedded in the public URL).
    if (user.avatarUrl) {
      const marker = `/public/${BUCKET_PUBLIC}/`;
      const idx = user.avatarUrl.indexOf(marker);
      if (idx !== -1) {
        const objectPath = user.avatarUrl.slice(idx + marker.length);
        await supabase.storage.from(BUCKET_PUBLIC).remove([objectPath]);
      }
    }
  } catch (err) {
    console.error('[account-deletion] storage cleanup failed', err);
  }

  // 3) Finally delete the user (cascade clears all related DB rows).
  await db.user.delete({ where: { id: userId } });
}

/** Paused accounts are retained this long, then hard-deleted. */
export const PAUSED_RETENTION_DAYS = 90;

/**
 * Delete every paused account past its 3-month retention window. Called by the
 * daily 'accounts.deletion_sweep' job. Sequential + best-effort per user so one
 * failure doesn't abort the batch — the next daily run retries whatever remains.
 * A resubscribe clears `pausedAt` (activeGrant), so returning users are never swept.
 */
export async function sweepPausedAccountsForDeletion(
  now: Date = new Date(),
): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - PAUSED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const due = await db.user.findMany({
    where: { pausedAt: { lt: cutoff } },
    select: { id: true },
  });

  let deleted = 0;
  for (const u of due) {
    try {
      await deleteUserCompletely(u.id);
      deleted += 1;
    } catch (err) {
      console.error('[account-deletion] failed to delete paused user', u.id, err);
    }
  }
  return { deleted };
}
