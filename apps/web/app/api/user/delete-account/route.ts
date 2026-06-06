import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, forbiddenResponse, internalErrorResponse } from '@/lib/api-response';
import { cancelLemonSqueezySubscription } from '@/lib/lemonsqueezy';
import { deleteNotebookFiles, deleteDirectory } from '@/lib/storage';
import { supabase, BUCKET_PUBLIC } from '@/lib/supabase';

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return forbiddenResponse('Authentication required');

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        avatarUrl: true,
        entitlementSource: true,
        lemonSqueezySubscriptionId: true,
      },
    });

    // 1) Cancel any active Lemon Squeezy subscription BEFORE deleting the row.
    //    The User row holds the only handle to the subscription; once it's gone
    //    the billing webhook can't resolve the user, so renewals would keep
    //    charging with nothing left to cancel against. (Apple/RevenueCat subs
    //    can only be cancelled by the user in the App Store.)
    if (user?.entitlementSource === 'LEMON_SQUEEZY' && user.lemonSqueezySubscriptionId) {
      try {
        await cancelLemonSqueezySubscription(user.lemonSqueezySubscriptionId);
      } catch (err) {
        console.error('[delete-account] Lemon Squeezy cancel failed', err);
        // Continue — don't strand the user mid-deletion over a provider hiccup.
      }
    }

    // 2) Remove the user's Supabase Storage objects. Prisma's cascade only clears
    //    DB rows; uploaded PDFs / page images / flashcard images / the public
    //    avatar live in object storage and would otherwise orphan indefinitely
    //    (incomplete GDPR Art.17 erasure). Best-effort — never block deletion on
    //    a storage error.
    try {
      const notebooks = await db.notebook.findMany({
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
      if (user?.avatarUrl) {
        const marker = `/public/${BUCKET_PUBLIC}/`;
        const idx = user.avatarUrl.indexOf(marker);
        if (idx !== -1) {
          const objectPath = user.avatarUrl.slice(idx + marker.length);
          await supabase.storage.from(BUCKET_PUBLIC).remove([objectPath]);
        }
      }
    } catch (err) {
      console.error('[delete-account] storage cleanup failed', err);
    }

    // 3) Finally delete the user (cascade clears all related DB rows).
    await db.user.delete({ where: { id: userId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
