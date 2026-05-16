import { db, schema } from '../src/lib/server/db/index.ts';

async function main() {
	const [problem] = await db
		.insert(schema.problems)
		.values({
			slug: 'two-sum',
			title: 'Two Sum',
			difficulty: 'easy',
			topics: ['array', 'hash-table'],
			url: 'https://leetcode.com/problems/two-sum/',
			descriptionMd:
				'# Two Sum\n\nGiven an array of integers `nums` and an integer `target`, return indices of the two numbers that add up to `target`.'
		})
		.onConflictDoNothing({ target: schema.problems.slug })
		.returning();

	await db
		.insert(schema.topicMastery)
		.values([
			{ topic: 'array', score: 0 },
			{ topic: 'hash-table', score: 0 }
		])
		.onConflictDoNothing();

	console.log('Seeded problem:', problem ?? '(already present)');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
