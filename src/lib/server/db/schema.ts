import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const problems = sqliteTable('problems', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	slug: text('slug').notNull().unique(),
	title: text('title').notNull(),
	difficulty: text('difficulty', { enum: ['easy', 'medium', 'hard'] }).notNull(),
	topics: text('topics', { mode: 'json' })
		.$type<string[]>()
		.notNull()
		.default(sql`'[]'`),
	url: text('url'),
	descriptionMd: text('description_md').notNull().default('')
});

export const attempts = sqliteTable('attempts', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	problemId: integer('problem_id')
		.notNull()
		.references(() => problems.id, { onDelete: 'cascade' }),
	startedAt: integer('started_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
	endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
	language: text('language').notNull(),
	status: text('status', { enum: ['in_progress', 'passed', 'failed', 'abandoned'] }).notNull(),
	code: text('code').notNull().default(''),
	notes: text('notes'),
	aiSummary: text('ai_summary')
});

export const hintsUsed = sqliteTable('hints_used', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	attemptId: integer('attempt_id')
		.notNull()
		.references(() => attempts.id, { onDelete: 'cascade' }),
	level: integer('level').notNull(),
	prompt: text('prompt').notNull(),
	response: text('response').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`)
});

export const topicMastery = sqliteTable(
	'topic_mastery',
	{
		topic: text('topic').notNull(),
		score: real('score').notNull().default(0),
		ease: real('ease').notNull().default(2.5),
		intervalDays: real('interval_days').notNull().default(0),
		repetitions: integer('repetitions').notNull().default(0),
		lastReviewedAt: integer('last_reviewed_at', { mode: 'timestamp_ms' }),
		nextReviewAt: integer('next_review_at', { mode: 'timestamp_ms' })
	},
	(t) => [primaryKey({ columns: [t.topic] })]
);

export type Problem = typeof problems.$inferSelect;
export type NewProblem = typeof problems.$inferInsert;
export type Attempt = typeof attempts.$inferSelect;
export type NewAttempt = typeof attempts.$inferInsert;
export type HintUsed = typeof hintsUsed.$inferSelect;
export type NewHintUsed = typeof hintsUsed.$inferInsert;
export type TopicMastery = typeof topicMastery.$inferSelect;
export type NewTopicMastery = typeof topicMastery.$inferInsert;
