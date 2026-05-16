import { describe, it, expect } from 'vitest';
import {
	STATUSES,
	isAttemptStatus,
	isTerminalStatus,
	canTransition,
	type AttemptStatus
} from './attempt-status';

describe('isAttemptStatus', () => {
	it('accepts the four canonical statuses', () => {
		for (const s of STATUSES) expect(isAttemptStatus(s)).toBe(true);
	});

	it('rejects unknown strings and non-strings', () => {
		expect(isAttemptStatus('done')).toBe(false);
		expect(isAttemptStatus('')).toBe(false);
		expect(isAttemptStatus(undefined)).toBe(false);
		expect(isAttemptStatus(null)).toBe(false);
		expect(isAttemptStatus(0)).toBe(false);
		expect(isAttemptStatus({ status: 'passed' })).toBe(false);
	});
});

describe('isTerminalStatus', () => {
	it('only in_progress is non-terminal', () => {
		expect(isTerminalStatus('in_progress')).toBe(false);
		expect(isTerminalStatus('passed')).toBe(true);
		expect(isTerminalStatus('failed')).toBe(true);
		expect(isTerminalStatus('abandoned')).toBe(true);
	});
});

describe('canTransition', () => {
	const terminals: AttemptStatus[] = ['passed', 'failed', 'abandoned'];

	it('in_progress → any terminal is allowed', () => {
		for (const t of terminals) expect(canTransition('in_progress', t)).toBe(true);
	});

	it('idempotent transitions (same → same) are allowed', () => {
		for (const s of STATUSES) expect(canTransition(s, s)).toBe(true);
	});

	it('terminal → in_progress is forbidden (no resurrecting)', () => {
		for (const t of terminals) expect(canTransition(t, 'in_progress')).toBe(false);
	});

	it('terminal → other terminal is forbidden (sticky)', () => {
		expect(canTransition('passed', 'failed')).toBe(false);
		expect(canTransition('failed', 'passed')).toBe(false);
		expect(canTransition('abandoned', 'passed')).toBe(false);
	});
});
