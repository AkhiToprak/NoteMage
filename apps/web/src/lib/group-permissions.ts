/**
 * Check if a user can perform a permission-gated action in a group.
 * Teachers, owners, and admins always bypass permission checks.
 * For classes, members (students) are restricted by the permission flag.
 * For study groups, all members can always act.
 */
export function canPerformAction(
  groupType: string,
  userRole: string,
  permissionField: boolean
): boolean {
  // Teachers, owners, admins always can
  if (['owner', 'admin', 'teacher'].includes(userRole)) return true;
  // For classes, check the permission flag
  if (groupType === 'class') return permissionField;
  // Study groups: always allowed
  return true;
}
