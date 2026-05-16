import { describe, it, expect } from 'vitest';
import { nextSchedule, classifyOutcome, DEFAULT_EASE, MIN_EASE } from './sm2';

describe('classifyOutcome', () => {
	it('passed with zero hints is unaided', () => {
		expect(classifyOutcome('passed', 0)).toBe('unaided');
	});
	it('passed with hints is hinted', () => {
		expect(classifyOutcome('passed', 2)).toBe('hinted');
	});
	it('failed or abandoned is gave_up', () => {
		expect(classifyOutcome('failed', 0)).toBe('gave_up');
		expect(classifyOutcome('abandoned', 5)).toBe('gave_up');
	});
});

describe('nextSchedule', () => {
	const now = new Date('2026-05-16T12:00:00Z');

	it('unaided on a fresh topic: ease grows, interval = 1 day', () => {
		const r = nextSchedule(null, 'unaided', now);
		expect(r.ease).toBeGreaterThan(DEFAULT_EASE);
		expect(r.intervalDays).toBe(1);
		expect(r.repetitions).toBe(1);
		expect(r.scoreDelta).toBe(1);
		expect(r.nextReviewAt.getTime() - now.getTime()).toBe(24 * 60 * 60 * 1000);
	});

	it('unaided second rep: interval = 6 days', () => {
		const r = nextSchedule({ ease: DEFAULT_EASE, intervalDays: 1, repetitions: 1 }, 'unaided', now);
		expect(r.intervalDays).toBe(6);
		expect(r.repetitions).toBe(2);
	});

	it('unaided third rep: interval = round(prev * ease)', () => {
		const r = nextSchedule({ ease: 2.6, intervalDays: 6, repetitions: 2 }, 'unaided', now);
		expect(r.intervalDays).toBe(Math.round(6 * r.ease));
	});

	it('hinted is neutral: ease unchanged-ish, no score delta', () => {
		const r = nextSchedule({ ease: DEFAULT_EASE, intervalDays: 6, repetitions: 2 }, 'hinted', now);
		// q=3 → ease change = 0.1 - 2*(0.08 + 2*0.02) = 0.1 - 0.24 = -0.14
		expect(r.ease).toBeCloseTo(DEFAULT_EASE - 0.14, 5);
		expect(r.scoreDelta).toBe(0);
		expect(r.repetitions).toBe(3);
	});

	it('gave_up: interval resets to 1 day, repetitions reset, score drops', () => {
		const r = nextSchedule({ ease: 2.8, intervalDays: 30, repetitions: 5 }, 'gave_up', now);
		expect(r.intervalDays).toBe(1);
		expect(r.repetitions).toBe(0);
		expect(r.scoreDelta).toBe(-1);
		expect(r.ease).toBeLessThan(2.8);
	});

	it('ease never drops below MIN_EASE', () => {
		let state = { ease: MIN_EASE, intervalDays: 1, repetitions: 0 };
		for (let i = 0; i < 10; i++) {
			const r = nextSchedule(state, 'gave_up', now);
			state = { ease: r.ease, intervalDays: r.intervalDays, repetitions: r.repetitions };
		}
		expect(state.ease).toBe(MIN_EASE);
	});
});
