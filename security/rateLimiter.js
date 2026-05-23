"use strict";

// In-memory rate limiter — resets on process restart (acceptable for PM2 managed process)
const buckets = new Map();

function checkRateLimit(id, action, max, windowMs) {
  const key = `${action}:${id}`;
  const now  = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  if (bucket.count > max) {
    return {
      allowed:    false,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  return { allowed: true };
}

// Prune stale buckets every 10 minutes so memory doesn't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, 10 * 60 * 1000);

module.exports = { checkRateLimit };
