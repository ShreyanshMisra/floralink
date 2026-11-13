import { type NextRequest, NextResponse } from "next/server";

/**
 * Best-effort fixed-window rate limiter.
 *
 * State lives in the memory of each server instance, so limits apply per
 * instance rather than globally. That is enough to blunt casual abuse of the
 * anonymous write and lookup endpoints without adding infrastructure; a shared
 * store (e.g. Redis) or the Vercel Firewall would be the next step for a
 * production deployment.
 */

export interface RateLimitPolicy {
  /** Distinguishes buckets for different endpoints sharing a client key. */
  name: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_TRACKED_KEYS = 10_000;
const buckets = new Map<string, Bucket>();

function pruneExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkRateLimit(
  policy: RateLimitPolicy,
  clientKey: string,
  now = Date.now(),
): RateLimitResult {
  const key = `${policy.name}:${clientKey}`;
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_KEYS) pruneExpired(now);
    bucket = { count: 0, resetAt: now + policy.windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  const allowed = bucket.count <= policy.limit;
  return {
    allowed,
    remaining: Math.max(0, policy.limit - bucket.count),
    retryAfterSeconds: allowed ? 0 : Math.ceil((bucket.resetAt - now) / 1000),
  };
}

/** Identifies the caller by the first address in the proxy chain. */
export function clientKeyFromRequest(request: NextRequest | Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export const rateLimitPolicies = {
  submitReport: { name: "submit-report", limit: 10, windowMs: 10 * 60_000 },
  verification: { name: "verification", limit: 30, windowMs: 60_000 },
  taxaSearch: { name: "taxa-search", limit: 60, windowMs: 60_000 },
} satisfies Record<string, RateLimitPolicy>;

/** Standard 429 envelope matching FloraLink's API error shape. */
export function rateLimitedResponse(requestId: string, result: RateLimitResult) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Wait a moment and try again.",
        retryable: true,
      },
      requestId,
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(result.retryAfterSeconds),
      },
    },
  );
}

/** Test helper: clears all buckets. */
export function resetRateLimits() {
  buckets.clear();
}
