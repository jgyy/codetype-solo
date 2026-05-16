import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attempts, problems } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

const LANGUAGES = ['javascript', 'typescript', 'python'] as const;
type Language = (typeof LANGUAGES)[number];

function parseLanguage(v: unknown): Language {
	return (LANGUAGES as readonly string[]).includes(String(v)) ? (v as Language) : 'javascript';
}

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as {
		problemId?: number;
		slug?: string;
		language?: string;
		code?: string;
	} | null;
	if (!body) throw error(400, 'Invalid JSON body');

	let problemId = body.problemId;
	if (!problemId && body.slug) {
		const p = await db.query.problems.findFirst({ where: eq(problems.slug, body.slug) });
		if (!p) throw error(404, 'Problem not found');
		problemId = p.id;
	}
	if (!problemId) throw error(400, 'problemId or slug required');

	const inserted = await db
		.insert(attempts)
		.values({
			problemId,
			language: parseLanguage(body.language),
			status: 'in_progress',
			code: body.code ?? ''
		})
		.returning();

	return json(inserted[0], { status: 201 });
};
