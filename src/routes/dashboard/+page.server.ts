import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { topicMastery, problems } from '$lib/server/db/schema';
import { lte, or, isNull, asc, sql } from 'drizzle-orm';

export type DueTopic = {
	topic: string;
	score: number;
	ease: number;
	intervalDays: number;
	repetitions: number;
	lastReviewedAt: Date | null;
	nextReviewAt: Date | null;
	problemCount: number;
};

export const load: PageServerLoad = async () => {
	const endOfToday = new Date();
	endOfToday.setHours(23, 59, 59, 999);

	const dueRows = await db
		.select()
		.from(topicMastery)
		.where(or(lte(topicMastery.nextReviewAt, endOfToday), isNull(topicMastery.nextReviewAt)))
		.orderBy(asc(topicMastery.nextReviewAt), asc(topicMastery.score));

	const allProblems = await db
		.select({ topics: problems.topics, slug: problems.slug, title: problems.title })
		.from(problems);

	// Pre-compute topic→count once instead of filtering allProblems for every due row.
	const countByTopic = new Map<string, number>();
	for (const p of allProblems) {
		for (const topic of p.topics ?? []) {
			countByTopic.set(topic, (countByTopic.get(topic) ?? 0) + 1);
		}
	}

	const dueTopics: DueTopic[] = dueRows.map((r) => {
		const problemCount = countByTopic.get(r.topic) ?? 0;
		return {
			topic: r.topic,
			score: r.score,
			ease: r.ease,
			intervalDays: r.intervalDays,
			repetitions: r.repetitions,
			lastReviewedAt: r.lastReviewedAt,
			nextReviewAt: r.nextReviewAt,
			problemCount
		};
	});

	const weakest = dueTopics
		.slice()
		.sort((a, b) => a.score - b.score)
		.slice(0, 5);

	const [{ totalTopics }] = await db
		.select({ totalTopics: sql<number>`count(*)` })
		.from(topicMastery);

	return { dueTopics, weakest, totalTopics: Number(totalTopics) };
};
