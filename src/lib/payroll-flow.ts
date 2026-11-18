const EDITABLE = new Set(["DRAFT", "PROCESSED", "NEEDS_REVISION"]);

export function canEditPayroll(status: string, preparerId: string, userId: string) {
  if (!EDITABLE.has(status)) return false;
  return !preparerId || preparerId === userId;
}

export function canSubmitPayroll(status: string, needsRecalc: boolean) {
  return (status === "PROCESSED" || status === "NEEDS_REVISION") && !needsRecalc;
}

export function componentBefore(listed: number, applied: number, pending: number) {
  return Math.max(0, listed - applied) + applied + pending;
}
