import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attempts } from '$lib/server/db/schema';
import { updateMasteryForAttempt } from '$lib/server/mastery';
import {
	canTransition,
	isAttemptStatus,
	isTerminalStatus,
	type AttemptStatus
} from '$lib/server/attempt-status';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'Invalid attempt id');

	const body = (await request.json().catch(() => null)) as {
		status?: string;
		code?: string;
		notes?: string;
	} | null;
	if (!body) throw error(400, 'Invalid JSON body');

	const updates: Partial<typeof attempts.$inferInsert> = {};
	let nextStatus: AttemptStatus | undefined;
	if (body.status !== undefined) {
		if (!isAttemptStatus(body.status)) throw error(400, 'Invalid status');
		nextStatus = body.status;
		updates.status = nextStatus;
		if (isTerminalStatus(nextStatus)) updates.endedAt = new Date();
	}
	if (body.code !== undefined) updates.code = body.code;
	if (body.notes !== undefined) updates.notes = body.notes;

	if (Object.keys(updates).length === 0) throw error(400, 'No fields to update');

	if (nextStatus !== undefined) {
		const current = await db.query.attempts.findFirst({ where: eq(attempts.id, id) });
		if (!current) throw error(404, 'Attempt not found');
		if (!isAttemptStatus(current.status) || !canTransition(current.status, nextStatus)) {
			throw error(409, `Illegal status transition: ${current.status} -> ${nextStatus}`);
		}
	}

	const updated = await db.update(attempts).set(updates).where(eq(attempts.id, id)).returning();

	if (!updated[0]) throw error(404, 'Attempt not found');

	if (updates.status && updates.status !== 'in_progress') {
		await updateMasteryForAttempt(id);
	}

	return json(updated[0]);
};
