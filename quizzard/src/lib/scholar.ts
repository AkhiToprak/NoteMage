/**
 * Returns the user's custom scholar name, or "Scholar" as the default.
 */
export function getScholarName(scholarName?: string | null): string {
  return scholarName?.trim() || 'Scholar';
}
