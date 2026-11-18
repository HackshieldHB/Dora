/** A session cannot last longer than this, counting from the moment it was created. */
export const SESSION_LIMIT_MS = 15 * 60 * 1000;

/** Earlier of the stored expiry and the 15-minute cap. Null once that moment has passed. */
export function sessionDeadline(createdAt: Date, expiresAt: Date, now = Date.now()): number | null {
  const ends = Math.min(expiresAt.getTime(), createdAt.getTime() + SESSION_LIMIT_MS);
  return ends > now ? ends : null;
}
