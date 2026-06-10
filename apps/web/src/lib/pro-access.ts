/**
 * PRO-level access = paid tier OR admin override (admins are tier=FREE in the DB
 * but unlimited, matching the server gate in usage-limits.ts). Single source of
 * truth so tier-aware copy/features don't drift across call sites. No Prisma
 * import, so it's safe in client components — and kept separate from
 * entitlement.ts's tier-only billing contract on purpose.
 */
export function hasProAccess(
  user: { tier?: string | null; role?: string | null } | null | undefined
): boolean {
  return user?.tier === 'PRO' || user?.role === 'admin';
}
