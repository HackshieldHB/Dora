export function assertDecision<T extends string>(value: string, allowed: readonly T[], message = "Choose approve, reject, or return for revision."): T {
  if (!allowed.includes(value as T)) throw new Error(message);
  return value as T;
}
