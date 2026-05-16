import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { attempts, problems, topicMastery } from '$lib/server/db/schema';
import { asc, desc, eq, sql } from 'drizzle-orm';

export type RecentAttempt = {
	id: number;
	problemSlug: string;
	problemTitle: string;
	language: string;
	status: 'in_progress' | 'passed' | 'failed' | 'abandoned';
	startedAt: Date;
	endedAt: Date | null;
};

export type WeakTopic = {
	topic: string;
	score: number;
};

export type Suggestion = {
	topic: string;
	slug: string;
	title: string;
	difficulty: 'easy' | 'medium' | 'hard';
} | null;

function dayKey(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function computeStreak(days: Set<string>): number {
	let streak = 0;
	const cursor = new Date();
	if (!days.has(dayKey(cursor))) {
		cursor.setDate(cursor.getDate() - 1);
		if (!days.has(dayKey(cursor))) return 0;
	}
	while (days.has(dayKey(cursor))) {
		streak++;
		cursor.setDate(cursor.getDate() - 1);
	}
	return streak;
}

function difficultyForScore(score: number): 'easy' | 'medium' | 'hard' {
	if (score < 1) return 'easy';
	if (score < 2.5) return 'medium';
	return 'hard';
}

export const load: PageServerLoad = async () => {
	const attemptDays = await db.select({ startedAt: attempts.startedAt }).from(attempts);
	const days = new Set(attemptDays.map((r) => dayKey(r.startedAt)));
	const streak = computeStreak(days);

	const weakRows = await db
		.select({ topic: topicMastery.topic, score: topicMastery.score })
		.from(topicMastery)
		.orderBy(asc(topicMastery.score))
		.limit(3);
	const weakTopics: WeakTopic[] = weakRows;

	const recentRows = await db
		.select({
			id: attempts.id,
			language: attempts.language,
			status: attempts.status,
			startedAt: attempts.startedAt,
			endedAt: attempts.endedAt,
			problemSlug: problems.slug,
			problemTitle: problems.title
		})
		.from(attempts)
		.innerJoin(problems, eq(attempts.problemId, problems.id))
		.orderBy(desc(attempts.startedAt))
		.limit(5);
	const recent: RecentAttempt[] = recentRows;

	let suggestion: Suggestion = null;
	if (weakTopics.length > 0) {
		const target = weakTopics[0];
		const wantedDifficulty = difficultyForScore(target.score);
		const candidates = await db
			.select({
				slug: problems.slug,
				title: problems.title,
				difficulty: problems.difficulty,
				topics: problems.topics
			})
			.from(problems)
			.where(eq(problems.difficulty, wantedDifficulty));
		const match =
			candidates.find((p) => (p.topics ?? []).includes(target.topic)) ??
			(
				await db
					.select({
						slug: problems.slug,
						title: problems.title,
						difficulty: problems.difficulty,
						topics: problems.topics
					})
					.from(problems)
			).find((p) => (p.topics ?? []).includes(target.topic));
		if (match) {
			suggestion = {
				topic: target.topic,
				slug: match.slug,
				title: match.title,
				difficulty: match.difficulty
			};
		}
	}

	const [{ totalAttempts }] = await db
		.select({ totalAttempts: sql<number>`count(*)` })
		.from(attempts);

	return {
		streak,
		weakTopics,
		recent,
		suggestion,
		totalAttempts: Number(totalAttempts)
	};
};
