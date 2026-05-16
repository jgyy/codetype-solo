import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { problems, attempts } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';

export type ProblemStatus = 'unsolved' | 'attempted' | 'solved';

export type ProblemRow = {
	id: number;
	slug: string;
	title: string;
	difficulty: 'easy' | 'medium' | 'hard';
	topics: string[];
	status: ProblemStatus;
};

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
const STATUSES = ['unsolved', 'attempted', 'solved'] as const;

export const load: PageServerLoad = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
	const difficulty = url.searchParams.getAll('difficulty').filter((d): d is (typeof DIFFICULTIES)[number] =>
		(DIFFICULTIES as readonly string[]).includes(d)
	);
	const topicFilter = url.searchParams.getAll('topic');
	const statusFilter = url.searchParams.getAll('status').filter((s): s is ProblemStatus =>
		(STATUSES as readonly string[]).includes(s)
	);

	const rows = await db
		.select({
			id: problems.id,
			slug: problems.slug,
			title: problems.title,
			difficulty: problems.difficulty,
			topics: problems.topics,
			attemptCount: sql<number>`count(${attempts.id})`,
			passedCount: sql<number>`sum(case when ${attempts.status} = 'passed' then 1 else 0 end)`
		})
		.from(problems)
		.leftJoin(attempts, eq(attempts.problemId, problems.id))
		.groupBy(problems.id)
		.orderBy(problems.id);

	const allTopics = new Set<string>();
	for (const r of rows) for (const t of r.topics ?? []) allTopics.add(t);

	const enriched: ProblemRow[] = rows.map((r) => {
		const status: ProblemStatus =
			Number(r.passedCount) > 0 ? 'solved' : Number(r.attemptCount) > 0 ? 'attempted' : 'unsolved';
		return {
			id: r.id,
			slug: r.slug,
			title: r.title,
			difficulty: r.difficulty,
			topics: r.topics ?? [],
			status
		};
	});

	const filtered = enriched.filter((p) => {
		if (q && !p.title.toLowerCase().includes(q)) return false;
		if (difficulty.length && !difficulty.includes(p.difficulty)) return false;
		if (statusFilter.length && !statusFilter.includes(p.status)) return false;
		if (topicFilter.length && !topicFilter.every((t) => p.topics.includes(t))) return false;
		return true;
	});

	return {
		problems: filtered,
		totalCount: enriched.length,
		allTopics: [...allTopics].sort(),
		filters: { q, difficulty, topic: topicFilter, status: statusFilter }
	};
};
