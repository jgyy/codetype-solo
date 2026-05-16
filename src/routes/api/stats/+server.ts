import { json } from '@sveltejs/kit';
import { gte, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attempts } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	const rows = await db
		.select({ count: sql<number>`count(*)`.mapWith(Number) })
		.from(attempts)
		.where(gte(attempts.startedAt, since));

	return json({ attemptsLast7Days: rows[0]?.count ?? 0, since: since.toISOString() });
};
