import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

export const SESSION_COOKIE = 'ct_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
	const s = env.SESSION_SECRET;
	if (!s || s.length < 16) {
		throw new Error('SESSION_SECRET must be set (>=16 chars) in .env');
	}
	return s;
}

export function getPin(): string {
	const pin = env.APP_PIN;
	if (!pin) throw new Error('APP_PIN must be set in .env');
	return pin;
}

export function verifyPin(input: string): boolean {
	const expected = Buffer.from(getPin());
	const got = Buffer.from(input ?? '');
	if (expected.length !== got.length) return false;
	return timingSafeEqual(expected, got);
}

function sign(payload: string): string {
	return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function issueToken(now = Date.now()): string {
	const exp = Math.floor(now / 1000) + SESSION_MAX_AGE;
	const payload = String(exp);
	return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined, now = Date.now()): boolean {
	if (!token) return false;
	const [payload, sig] = token.split('.');
	if (!payload || !sig) return false;
	const expected = sign(payload);
	const a = Buffer.from(sig);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
	const exp = Number(payload);
	if (!Number.isFinite(exp)) return false;
	return exp * 1000 > now;
}
