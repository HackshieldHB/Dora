export function placementError(branchId: string, locationBranchId: string | null, sameAsStored: boolean) {
  if (sameAsStored) return "";
  if (!branchId) return "Choose a branch before the work location.";
  if (locationBranchId !== branchId) return "That work location does not belong to the selected branch.";
  return "";
}
