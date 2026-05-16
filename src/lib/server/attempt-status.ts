// Pure helpers for attempt status transitions.
// The PATCH route uses these; tests exercise them without DB setup.

export const STATUSES = ['in_progress', 'passed', 'failed', 'abandoned'] as const;
export type AttemptStatus = (typeof STATUSES)[number];

export function isAttemptStatus(v: unknown): v is AttemptStatus {
	return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

export function isTerminalStatus(s: AttemptStatus): boolean {
	return s !== 'in_progress';
}

// Allowed transitions: an attempt starts in_progress and may move to any
// terminal state exactly once. Terminal states are sticky (no resurrecting).
export function canTransition(from: AttemptStatus, to: AttemptStatus): boolean {
	if (from === to) return true;
	if (from === 'in_progress') return isTerminalStatus(to);
	return false;
}
