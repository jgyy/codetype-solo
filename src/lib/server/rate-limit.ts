// In-memory rate limiter. Solo app runs as one Node process, so per-process
// state is sufficient. NOT suitable for serverless multi-instance deploys.

type Bucket = { count: number; resetAt: number };
const BUCKETS = new Map<string, Bucket>();

export function take(key: string, maxPerWindow: number, windowMs: number): boolean {
	const now = Date.now();
	const b = BUCKETS.get(key);
	if (!b || now > b.resetAt) {
		BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
		return true;
	}
	if (b.count >= maxPerWindow) return false;
	b.count += 1;
	return true;
}

// Exponential backoff window for PIN attempts. After N failures, the next
// attempt is delayed; on success the bucket is cleared.
type Failures = { count: number; firstAt: number; lastAt: number };
const PIN_FAILS = new Map<string, Failures>();
const PIN_WINDOW_MS = 15 * 60 * 1000;

export function recordPinFailure(key: string): void {
	const now = Date.now();
	const f = PIN_FAILS.get(key);
	if (!f || now - f.firstAt > PIN_WINDOW_MS) {
		PIN_FAILS.set(key, { count: 1, firstAt: now, lastAt: now });
		return;
	}
	f.count += 1;
	f.lastAt = now;
}

export function clearPinFailures(key: string): void {
	PIN_FAILS.delete(key);
}

/** Returns ms the caller must wait before another attempt, 0 if allowed. */
export function pinBackoffMs(key: string): number {
	const f = PIN_FAILS.get(key);
	if (!f) return 0;
	const now = Date.now();
	if (now - f.firstAt > PIN_WINDOW_MS) {
		PIN_FAILS.delete(key);
		return 0;
	}
	if (f.count < 5) return 0;
	// 1s, 2s, 4s, 8s, 16s, ... capped at 60s. Anchor to the most recent failure
	// so each fresh attempt during cooldown resets the timer — otherwise the
	// backoff is only enforced once per window.
	const backoff = Math.min(60_000, 1000 * 2 ** (f.count - 5));
	const allowedAt = f.lastAt + backoff;
	return Math.max(0, allowedAt - now);
}
