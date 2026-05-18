import { db } from './db';
import { topicMastery, hintsUsed, problems, attempts } from './db/schema';
import { eq, sql } from 'drizzle-orm';
import { classifyOutcome, nextSchedule, type Outcome } from './sm2';

export async function updateMasteryForAttempt(attemptId: number): Promise<void> {
	const attempt = await db.query.attempts.findFirst({ where: eq(attempts.id, attemptId) });
	if (!attempt) return;

	const problem = await db.query.problems.findFirst({ where: eq(problems.id, attempt.problemId) });
	if (!problem) return;

	const topics = problem.topics ?? [];
	if (topics.length === 0) return;

	const [{ hintCount }] = await db
		.select({ hintCount: sql<number>`count(*)` })
		.from(hintsUsed)
		.where(eq(hintsUsed.attemptId, attemptId));

	const hintCountNum = Number(hintCount);
	if (!Number.isFinite(hintCountNum) || hintCountNum < 0) {
		throw new Error(`mastery: unexpected hintCount value ${String(hintCount)}`);
	}
	const outcome: Outcome = classifyOutcome(attempt.status, hintCountNum);
	const now = new Date();

	for (const topic of topics) {
		const existing = await db.query.topicMastery.findFirst({
			where: eq(topicMastery.topic, topic)
		});
		const prevState = existing
			? {
					ease: existing.ease,
					intervalDays: existing.intervalDays,
					repetitions: existing.repetitions
				}
			: null;

		const next = nextSchedule(prevState, outcome, now);
		// Floor at 0 — negative scores aren't a defined concept in the dashboard
		// and would persist indefinitely once a topic has had many lapses.
		const newScore = Math.max(0, (existing?.score ?? 0) + next.scoreDelta);

		await db
			.insert(topicMastery)
			.values({
				topic,
				score: newScore,
				ease: next.ease,
				intervalDays: next.intervalDays,
				repetitions: next.repetitions,
				lastReviewedAt: next.lastReviewedAt,
				nextReviewAt: next.nextReviewAt
			})
			.onConflictDoUpdate({
				target: topicMastery.topic,
				set: {
					score: newScore,
					ease: next.ease,
					intervalDays: next.intervalDays,
					repetitions: next.repetitions,
					lastReviewedAt: next.lastReviewedAt,
					nextReviewAt: next.nextReviewAt
				}
			});
	}
}
