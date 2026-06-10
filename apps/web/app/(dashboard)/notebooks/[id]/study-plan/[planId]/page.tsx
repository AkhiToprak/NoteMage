import { permanentRedirect } from 'next/navigation';

// Phase 9.4 — study plan detail moved to /learn/paths/[planId]. The new
// page renders the same notebook-scoped editing experience for plans with
// a primary notebook, and a read-only view for cross-notebook plans. The
// notebook id is unused under the new URL.

type Params = { params: Promise<{ id: string; planId: string }> };

export default async function Page({ params }: Params) {
  const { planId } = await params;
  permanentRedirect(`/learn/paths/${planId}`);
}
