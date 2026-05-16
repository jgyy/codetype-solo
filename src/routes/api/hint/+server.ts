import { json, error } from '@sveltejs/kit';
import { eq, and, count } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { attempts, hintsUsed, problems } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

const MAX_HINTS_PER_ATTEMPT = 5;
const MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPTS: Record<1 | 2 | 3, string> = {
	1: `You are a coding mentor giving a LEVEL 1 hint.
Ask ONE clarifying question OR point out ONE key observation about the problem.
Rules:
- 1-3 sentences max.
- NEVER write code, pseudocode, or algorithm steps.
- NEVER name the data structure or algorithm to use.
- Help the learner notice something they may have missed.`,
	2: `You are a coding mentor giving a LEVEL 2 hint.
Describe a high-level approach in plain English.
Rules:
- 2-5 sentences.
- NEVER write code or pseudocode.
- You MAY name the algorithm/data structure category (e.g. "two pointers", "hash map").
- Do NOT enumerate concrete steps with variables.`,
	3: `You are a coding mentor giving a LEVEL 3 hint: PSEUDOCODE only.
Rules:
- Output language-agnostic pseudocode in a fenced block tagged \`\`\`pseudo.
- Use plain English verbs (SET, FOR EACH, IF, RETURN). No real syntax.
- NEVER use language-specific syntax: no \`def\`, \`function\`, \`=>\`, \`var\`, \`let\`, \`const\`, \`print\`, \`console.log\`, semicolons, or type annotations.
- Show the SHAPE of the solution, not a copy-pasteable implementation.
- Keep under 15 lines.`
};

const FORBIDDEN_FENCE = /```(?:javascript|typescript|js|ts|jsx|tsx|python|py)\b/i;
const FORBIDDEN_TOKENS = /\b(?:function\s+\w+\s*\(|def\s+\w+\s*\(|class\s+\w+|console\.log|=>|import\s+|from\s+\w+\s+import)/;

function looksLikeFullCode(text: string, level: 1 | 2 | 3): boolean {
	if (FORBIDDEN_FENCE.test(text)) return true;
	if (level < 3 && /```/.test(text)) return true;
	if (level < 3 && FORBIDDEN_TOKENS.test(text)) return true;
	return false;
}

function parseLevel(v: unknown): 1 | 2 | 3 {
	const n = Number(v);
	if (n === 1 || n === 2 || n === 3) return n;
	throw error(400, 'level must be 1, 2, or 3');
}

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
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
			system: systemPrompt,
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

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as {
		attemptId?: number;
		level?: number;
	} | null;
	if (!body?.attemptId) throw error(400, 'attemptId required');
	const level = parseLevel(body.level);

	const attempt = await db.query.attempts.findFirst({
		where: eq(attempts.id, body.attemptId)
	});
	if (!attempt) throw error(404, 'Attempt not found');

	const [{ value: used }] = await db
		.select({ value: count() })
		.from(hintsUsed)
		.where(eq(hintsUsed.attemptId, attempt.id));
	if (used >= MAX_HINTS_PER_ATTEMPT) {
		throw error(429, `Hint limit reached (${MAX_HINTS_PER_ATTEMPT} per attempt)`);
	}

	const alreadyAtLevel = await db.query.hintsUsed.findFirst({
		where: and(eq(hintsUsed.attemptId, attempt.id), eq(hintsUsed.level, level))
	});
	if (alreadyAtLevel) {
		return json({ level, response: alreadyAtLevel.response, cached: true, used });
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
		attempt.code ? `Learner's current code:\n\`\`\`${attempt.language}\n${attempt.code}\n\`\`\`` : 'Learner has not written code yet.',
		`Give a level ${level} hint.`
	]
		.filter(Boolean)
		.join('\n\n');

	let response = await callClaude(SYSTEM_PROMPTS[level], userPrompt);

	if (looksLikeFullCode(response, level)) {
		response = `[Hint withheld: the model attempted to emit full code. Try requesting a lower-level hint or rephrase.]`;
	}

	const inserted = await db
		.insert(hintsUsed)
		.values({
			attemptId: attempt.id,
			level,
			prompt: userPrompt,
			response
		})
		.returning();

	return json(
		{ level, response, hintId: inserted[0].id, used: used + 1, remaining: MAX_HINTS_PER_ATTEMPT - used - 1 },
		{ status: 201 }
	);
};
