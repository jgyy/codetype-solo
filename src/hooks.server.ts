import { redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, verifyToken } from '$lib/server/session';

const PUBLIC_PATHS = new Set(['/pin', '/api/health']);

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const token = event.cookies.get(SESSION_COOKIE);
	const authed = verifyToken(token);
	event.locals.authed = authed;

	if (PUBLIC_PATHS.has(pathname)) return resolve(event);

	if (!authed) {
		if (pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		throw redirect(303, `/pin?next=${encodeURIComponent(pathname + event.url.search)}`);
	}

	return resolve(event);
};
