import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, schema } from '../src/lib/server/db/index.ts';

type SeedProblem = {
	slug: string;
	title: string;
	difficulty: 'easy' | 'medium' | 'hard';
	topics: string[];
	url?: string;
	descriptionMd?: string;
};

const SEED_PATH = resolve(process.cwd(), 'data/seed-problems.json');
const LEETCODE_BASE = 'https://leetcode.com/problems/';

function loadSeed(): SeedProblem[] {
	const raw = readFileSync(SEED_PATH, 'utf8');
	const parsed = JSON.parse(raw) as SeedProblem[];
	if (!Array.isArray(parsed)) throw new Error('seed-problems.json must be an array');
	return parsed;
}

async function main() {
	const seed = loadSeed();

	const rows = seed.map((p) => ({
		slug: p.slug,
		title: p.title,
		difficulty: p.difficulty,
		topics: p.topics,
		url: p.url ?? `${LEETCODE_BASE}${p.slug}/`,
		descriptionMd: p.descriptionMd ?? `# ${p.title}\n\nSee problem at ${LEETCODE_BASE}${p.slug}/`
	}));

	// SQLite limits parameters per statement; chunk to stay well under the cap.
	const CHUNK = 100;
	let inserted = 0;
	for (let i = 0; i < rows.length; i += CHUNK) {
		const chunk = rows.slice(i, i + CHUNK);
		const result = await db
			.insert(schema.problems)
			.values(chunk)
			.onConflictDoNothing({ target: schema.problems.slug })
			.returning({ id: schema.problems.id });
		inserted += result.length;
	}

	const topics = Array.from(new Set(seed.flatMap((p) => p.topics))).map((topic) => ({
		topic,
		score: 0
	}));
	if (topics.length > 0) {
		await db.insert(schema.topicMastery).values(topics).onConflictDoNothing();
	}

	const total = await db.$count(schema.problems);
	console.log(
		`Seeded problems: total in DB=${total}, attempted=${rows.length}, newly inserted=${inserted}, topics tracked=${topics.length}`
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
