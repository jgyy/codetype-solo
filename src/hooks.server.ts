import { redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, verifyToken } from '$lib/server/session';

const PUBLIC_PATHS = new Set(['/pin', '/api/health']);

function isPublic(pathname: string): boolean {
	const normalized =
		pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
	return PUBLIC_PATHS.has(normalized);
}

function withSecurityHeaders(res: Response): Response {
	const h = res.headers;
	if (!h.has('content-security-policy')) {
		h.set(
			'content-security-policy',
			"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
		);
	}
	h.set('x-content-type-options', 'nosniff');
	h.set('x-frame-options', 'DENY');
	h.set('referrer-policy', 'strict-origin-when-cross-origin');
	return res;
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const token = event.cookies.get(SESSION_COOKIE);
	const authed = verifyToken(token);
	event.locals.authed = authed;

	if (isPublic(pathname)) return withSecurityHeaders(await resolve(event));

	if (!authed) {
		if (pathname.startsWith('/api/')) {
			return withSecurityHeaders(
				new Response(JSON.stringify({ error: 'unauthorized' }), {
					status: 401,
					headers: { 'content-type': 'application/json' }
				})
			);
		}
		throw redirect(303, `/pin?next=${encodeURIComponent(pathname + event.url.search)}`);
	}

	return withSecurityHeaders(await resolve(event));
};
