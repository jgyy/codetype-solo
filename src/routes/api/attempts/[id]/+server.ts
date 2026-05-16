import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attempts } from '$lib/server/db/schema';
import { updateMasteryForAttempt } from '$lib/server/mastery';
import { isAttemptStatus, isTerminalStatus, type AttemptStatus } from '$lib/server/attempt-status';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'Invalid attempt id');

	const body = (await request.json().catch(() => null)) as {
		status?: string;
		code?: string;
		notes?: string;
	} | null;
	if (!body) throw error(400, 'Invalid JSON body');

	const updates: Partial<typeof attempts.$inferInsert> = {};
	if (body.status !== undefined) {
		if (!isAttemptStatus(body.status)) throw error(400, 'Invalid status');
		const next: AttemptStatus = body.status;
		updates.status = next;
		if (isTerminalStatus(next)) updates.endedAt = new Date();
	}
	if (body.code !== undefined) updates.code = body.code;
	if (body.notes !== undefined) updates.notes = body.notes;

	if (Object.keys(updates).length === 0) throw error(400, 'No fields to update');

	const updated = await db
		.update(attempts)
		.set(updates)
		.where(eq(attempts.id, id))
		.returning();

	if (!updated[0]) throw error(404, 'Attempt not found');

	if (updates.status && updates.status !== 'in_progress') {
		await updateMasteryForAttempt(id);
	}

	return json(updated[0]);
};
