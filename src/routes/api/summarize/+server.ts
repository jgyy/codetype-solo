import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { attempts, problems } from '$lib/server/db/schema';
import { take } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

const MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You are a coding mentor summarising a learner's solved problem.
Read the learner's free-form notes and their final code, then produce exactly THREE bullet-point takeaways.
Rules:
- Output exactly 3 bullets, each starting with "- ".
- Each bullet: one sentence, <= 25 words.
- Focus on: (1) the core insight that unlocked the solution, (2) the algorithm/data-structure pattern, (3) a pitfall or thing to remember next time.
- Plain prose. No code. No headers. No preamble or closing remarks.`;

async function callClaude(userPrompt: string): Promise<string> {
	const apiKey = env.ANTHROPIC_API_KEY;
	if (!apiKey) throw error(500, 'ANTHROPIC_API_KEY not configured');

	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: MODEL,
			max_tokens: 400,
			system: SYSTEM_PROMPT,
			messages: [{ role: 'user', content: userPrompt }]
		})
	});

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw error(502, `Anthropic API error: ${res.status} ${detail.slice(0, 200)}`);
	}

	const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
	const text = data.content?.find((b) => b.type === 'text')?.text?.trim();
	if (!text) throw error(502, 'Empty response from model');
	return text;
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	let ip = 'unknown';
	try {
		ip = getClientAddress();
	} catch {
		const fwd = request.headers.get('x-forwarded-for');
		if (fwd) ip = fwd.split(',')[0].trim();
	}
	if (!take(`summarize:${ip}`, 6, 60_000))
		throw error(429, 'Too many summary requests, slow down.');

	const body = (await request.json().catch(() => null)) as { attemptId?: number } | null;
	if (!body?.attemptId) throw error(400, 'attemptId required');

	const attempt = await db.query.attempts.findFirst({
		where: eq(attempts.id, body.attemptId)
	});
	if (!attempt) throw error(404, 'Attempt not found');
	if (attempt.status !== 'passed') {
		throw error(400, 'Summary is only available after the attempt is submitted as passed.');
	}

	const problem = await db.query.problems.findFirst({
		where: eq(problems.id, attempt.problemId)
	});
	if (!problem) throw error(404, 'Problem not found');

	const userPrompt = [
		`Problem: ${problem.title} (${problem.difficulty})`,
		`Topics: ${problem.topics.join(', ') || 'n/a'}`,
		problem.descriptionMd ? `Description:\n${problem.descriptionMd}` : '',
		`Language: ${attempt.language}`,
		attempt.notes ? `Learner's notes:\n${attempt.notes}` : 'Learner did not write notes.',
		`Final code:\n\`\`\`${attempt.language}\n${attempt.code}\n\`\`\``,
		'Produce the 3-bullet takeaway now.'
	]
		.filter(Boolean)
		.join('\n\n');

	const summary = await callClaude(userPrompt);

	await db.update(attempts).set({ aiSummary: summary }).where(eq(attempts.id, attempt.id));

	return json({ attemptId: attempt.id, summary }, { status: 201 });
};
