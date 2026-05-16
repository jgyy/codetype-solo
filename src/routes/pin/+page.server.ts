import { fail, redirect, type Actions } from '@sveltejs/kit';
import { SESSION_COOKIE, SESSION_MAX_AGE, issueToken, verifyPin, verifyToken } from '$lib/server/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ cookies, url }) => {
	if (verifyToken(cookies.get(SESSION_COOKIE))) {
		throw redirect(303, url.searchParams.get('next') || '/');
	}
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const data = await request.formData();
		const pin = String(data.get('pin') ?? '');
		if (!verifyPin(pin)) return fail(401, { error: 'Incorrect PIN' });

		cookies.set(SESSION_COOKIE, issueToken(), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: SESSION_MAX_AGE
		});
		throw redirect(303, url.searchParams.get('next') || '/');
	}
};
