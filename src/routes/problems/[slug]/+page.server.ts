import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { problems, attempts, hintsUsed } from '$lib/server/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { updateMasteryForAttempt } from '$lib/server/mastery';

const LANGUAGES = ['javascript', 'typescript', 'python'] as const;
type Language = (typeof LANGUAGES)[number];

export const load: PageServerLoad = async ({ params }) => {
	const problem = await db.query.problems.findFirst({
		where: eq(problems.slug, params.slug)
	});
	if (!problem) throw error(404, `Problem "${params.slug}" not found`);

	const latestAttempt = await db
		.select()
		.from(attempts)
		.where(eq(attempts.problemId, problem.id))
		.orderBy(desc(attempts.startedAt))
		.limit(1);

	const latest = latestAttempt[0] ?? null;
	const activeAttempt = latest?.status === 'in_progress' ? latest : null;
	const lastSolvedAttempt = latest?.status === 'passed' ? latest : null;

	return { problem, activeAttempt, lastSolvedAttempt };
};

function parseLanguage(value: FormDataEntryValue | null): Language {
	const v = String(value ?? '');
	return (LANGUAGES as readonly string[]).includes(v) ? (v as Language) : 'javascript';
}

export const actions: Actions = {
	start: async ({ request, params }) => {
		const data = await request.formData();
		const language = parseLanguage(data.get('language'));
		const code = String(data.get('code') ?? '');

		const problem = await db.query.problems.findFirst({
			where: eq(problems.slug, params.slug)
		});
		if (!problem) return fail(404, { error: 'Problem not found' });

		const existing = await db
			.select()
			.from(attempts)
			.where(and(eq(attempts.problemId, problem.id), eq(attempts.status, 'in_progress')))
			.limit(1);
		if (existing[0]) return { attemptId: existing[0].id };

		const inserted = await db
			.insert(attempts)
			.values({ problemId: problem.id, language, status: 'in_progress', code })
			.returning({ id: attempts.id });
		return { attemptId: inserted[0].id };
	},

	submit: async ({ request, params }) => {
		const data = await request.formData();
		const code = String(data.get('code') ?? '');
		const language = parseLanguage(data.get('language'));
		const attemptIdRaw = data.get('attemptId');
		const attemptId = attemptIdRaw ? Number(attemptIdRaw) : null;

		const problem = await db.query.problems.findFirst({
			where: eq(problems.slug, params.slug)
		});
		if (!problem) return fail(404, { error: 'Problem not found' });

		if (attemptId) {
			// Verify the attempt belongs to this problem and is still open
			// before marking it passed — prevents arbitrary attempt IDs from
			// being mutated and stops double-submission.
			const existing = await db.query.attempts.findFirst({
				where: eq(attempts.id, attemptId)
			});
			if (!existing || existing.problemId !== problem.id) {
				return fail(400, { error: 'Invalid attempt' });
			}
			if (existing.status !== 'in_progress') {
				return { submitted: true, attemptId };
			}
			await db
				.update(attempts)
				.set({ code, language, status: 'passed', endedAt: new Date() })
				.where(eq(attempts.id, attemptId));
			await updateMasteryForAttempt(attemptId);
			return { submitted: true, attemptId };
		}

		const inserted = await db
			.insert(attempts)
			.values({
				problemId: problem.id,
				language,
				status: 'passed',
				code,
				endedAt: new Date()
			})
			.returning({ id: attempts.id });
		await updateMasteryForAttempt(inserted[0].id);
		return { submitted: true, attemptId: inserted[0].id };
	},

	// NOTE: The "Get Hint" UI now POSTs directly to /api/hint, which calls
	// Claude with the real problem/code context. The form action below is
	// retained only to keep no-JS clients functional, but it delegates to
	// the same DB insert path with a static fallback message instead of the
	// previous Two-Sum-only hardcoded strings.
	hint: async ({ request, fetch }) => {
		const data = await request.formData();
		const attemptIdRaw = data.get('attemptId');
		const attemptId = attemptIdRaw ? Number(attemptIdRaw) : null;
		if (!attemptId) return fail(400, { error: 'Start an attempt first to request a hint.' });

		const prior = await db
			.select()
			.from(hintsUsed)
			.where(eq(hintsUsed.attemptId, attemptId))
			.orderBy(desc(hintsUsed.level))
			.limit(1);
		const level = Math.min(3, (prior[0]?.level ?? 0) + 1) as 1 | 2 | 3;

		const res = await fetch('/api/hint', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ attemptId, level })
		});
		if (!res.ok) {
			const detail = await res.text().catch(() => '');
			return fail(res.status, { error: detail || 'Hint service failed' });
		}
		const payload = (await res.json()) as { level: number; response: string };
		return { hint: { level: payload.level, response: payload.response } };
	},

	saveNotes: async ({ request, params }) => {
		const data = await request.formData();
		const attemptIdRaw = data.get('attemptId');
		const attemptId = attemptIdRaw ? Number(attemptIdRaw) : null;
		if (!attemptId) return fail(400, { error: 'No attempt to attach notes to.' });

		const problem = await db.query.problems.findFirst({
			where: eq(problems.slug, params.slug)
		});
		if (!problem) return fail(404, { error: 'Problem not found' });
		const existing = await db.query.attempts.findFirst({
			where: eq(attempts.id, attemptId)
		});
		if (!existing || existing.problemId !== problem.id) {
			return fail(400, { error: 'Invalid attempt' });
		}

		const notes = String(data.get('notes') ?? '');
		const aiSummaryRaw = data.get('aiSummary');
		const updates: { notes: string; aiSummary?: string | null } = { notes };
		if (aiSummaryRaw !== null) updates.aiSummary = String(aiSummaryRaw) || null;
		await db.update(attempts).set(updates).where(eq(attempts.id, attemptId));
		return { notesSaved: true, attemptId };
	}
};
