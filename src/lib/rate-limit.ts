/**
 * In-memory sliding-window counter for failed sign-ins.
 * DORA runs as a single Node process per installation, so process memory is the right scope;
 * a restart clears the counters (accounts keep their database lockout).
 */
type Bucket = { failures: number[]; blockedUntil: number };

export type LimitPolicy = { limit: number; windowMs: number; blockMs: number };

const MAX_BUCKETS = 10_000;
const buckets = new Map<string, Bucket>();

function prune(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.blockedUntil <= now && (bucket.failures.at(-1) ?? 0) < now - 24 * 60 * 60 * 1000) buckets.delete(key);
  }
  // Still full (an attack spreading over many keys): drop the oldest entries.
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

/** Milliseconds until the key may try again; 0 when it is not blocked. */
export function blockedFor(key: string, now = Date.now()): number {
  const bucket = buckets.get(key);
  return bucket && bucket.blockedUntil > now ? bucket.blockedUntil - now : 0;
}

/** Records one failure. Returns true when this failure puts the key into a block. */
export function recordFailure(key: string, policy: LimitPolicy, now = Date.now()): boolean {
  prune(now);
  const bucket = buckets.get(key) ?? { failures: [], blockedUntil: 0 };
  bucket.failures = bucket.failures.filter((at) => at > now - policy.windowMs);
  bucket.failures.push(now);
  buckets.delete(key);
  buckets.set(key, bucket);
  if (bucket.failures.length >= policy.limit) {
    bucket.blockedUntil = now + policy.blockMs;
    bucket.failures = [];
    return true;
  }
  return false;
}

export function clearFailures(key: string): void {
  buckets.delete(key);
}

/** For tests only. */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
