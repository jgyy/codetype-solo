import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attempts } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

const STATUSES = ['in_progress', 'passed', 'failed', 'abandoned'] as const;
type Status = (typeof STATUSES)[number];

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
		if (!(STATUSES as readonly string[]).includes(body.status)) throw error(400, 'Invalid status');
		updates.status = body.status as Status;
		if (body.status !== 'in_progress') updates.endedAt = new Date();
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
	return json(updated[0]);
};
