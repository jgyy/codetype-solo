import { json, error } from '@sveltejs/kit';
import { importBackup, type Backup } from '$lib/server/backup';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url }) => {
	// Same-origin check — destructive endpoint, defends against CSRF even though
	// the session cookie is SameSite=lax.
	// Require Origin on this destructive endpoint — a missing header must NOT be
	// treated as same-origin, since browsers always set it on cross-site POSTs.
	const origin = request.headers.get('origin');
	if (!origin || new URL(origin).host !== url.host) {
		throw error(403, 'Cross-origin import blocked');
	}
	if (url.searchParams.get('confirm') !== 'true') {
		throw error(400, 'Destructive import requires ?confirm=true');
	}
	let body: Backup;
	try {
		body = (await request.json()) as Backup;
	} catch {
		throw error(400, 'Invalid JSON');
	}
	try {
		const { counts } = await importBackup(body);
		return json({ ok: true, counts });
	} catch (e) {
		throw error(400, e instanceof Error ? e.message : 'Import failed');
	}
};
