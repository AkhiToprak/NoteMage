/**
 * Returns the user's custom mage name, or "Mage" as the default.
 */
export function getMageName(scholarName?: string | null): string {
  return scholarName?.trim() || 'Mage';
}
