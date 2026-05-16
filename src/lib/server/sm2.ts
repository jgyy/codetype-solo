// SM-2 spaced repetition scheduler.
// Reference: https://super-memory.com/english/ol/sm2.htm

export type Outcome = 'unaided' | 'hinted' | 'gave_up';

export type MasteryState = {
	ease: number;
	intervalDays: number;
	repetitions: number;
};

export type SchedulerResult = MasteryState & {
	lastReviewedAt: Date;
	nextReviewAt: Date;
	scoreDelta: number;
};

export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;

export function classifyOutcome(status: string, hintCount: number): Outcome {
	if (status === 'failed' || status === 'abandoned') return 'gave_up';
	if (status === 'passed') return hintCount > 0 ? 'hinted' : 'unaided';
	return 'hinted';
}

// Map our 3-bucket outcomes to SM-2 quality scores (0-5):
//   unaided → 5 (perfect recall)
//   hinted  → 3 (correct with effort — boundary of pass/fail in SM-2)
//   gave_up → 1 (incorrect; restart repetition cycle)
export function qualityFor(outcome: Outcome): number {
	switch (outcome) {
		case 'unaided':
			return 5;
		case 'hinted':
			return 3;
		case 'gave_up':
			return 1;
	}
}

export function nextSchedule(
	prev: MasteryState | null,
	outcome: Outcome,
	now: Date = new Date()
): SchedulerResult {
	const state: MasteryState = prev ?? { ease: DEFAULT_EASE, intervalDays: 0, repetitions: 0 };
	const q = qualityFor(outcome);

	// SM-2 ease update: EF' = EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02))
	let ease = state.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
	if (ease < MIN_EASE) ease = MIN_EASE;

	let repetitions: number;
	let intervalDays: number;
	let scoreDelta: number;

	if (q < 3) {
		// Lapse: restart repetition cycle, due tomorrow.
		repetitions = 0;
		intervalDays = 1;
		scoreDelta = -1;
	} else {
		repetitions = state.repetitions + 1;
		if (repetitions === 1) intervalDays = 1;
		else if (repetitions === 2) intervalDays = 6;
		else intervalDays = Math.round(state.intervalDays * ease);
		scoreDelta = outcome === 'unaided' ? 1 : 0;
	}

	const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
	return { ease, intervalDays, repetitions, lastReviewedAt: now, nextReviewAt, scoreDelta };
}
