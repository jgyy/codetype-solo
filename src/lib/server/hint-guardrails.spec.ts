import { describe, it, expect } from 'vitest';
import { looksLikeFullCode, HINT_WITHHELD_MESSAGE } from './hint-guardrails';

describe('looksLikeFullCode — refuses to leak full solutions', () => {
	describe('level 1 (Socratic question)', () => {
		it('flags any fenced code block', () => {
			expect(looksLikeFullCode('Consider this:\n```\nfor x in arr\n```', 1)).toBe(true);
		});

		it('flags language-tagged fences', () => {
			expect(looksLikeFullCode('```python\nprint(1)\n```', 1)).toBe(true);
			expect(looksLikeFullCode('```javascript\nlet x = 1\n```', 1)).toBe(true);
			expect(looksLikeFullCode('```ts\nconst x = 1\n```', 1)).toBe(true);
		});

		it('flags arrow functions and function declarations', () => {
			expect(looksLikeFullCode('try arr.map(x=>x+1)', 1)).toBe(true);
			expect(looksLikeFullCode('write function solve(arr) here', 1)).toBe(true);
			expect(looksLikeFullCode('def solve(arr):', 1)).toBe(true);
		});

		it('flags console.log and import statements', () => {
			expect(looksLikeFullCode('use console.log to debug', 1)).toBe(true);
			expect(looksLikeFullCode('import sys then read input', 1)).toBe(true);
			expect(looksLikeFullCode('from collections import Counter', 1)).toBe(true);
		});

		it('allows a plain Socratic question', () => {
			const text = 'What property of the input lets you avoid recomputing the same value?';
			expect(looksLikeFullCode(text, 1)).toBe(false);
		});

		it('allows naming an algorithm in prose', () => {
			expect(looksLikeFullCode('Have you considered using a hash map?', 1)).toBe(false);
		});
	});

	describe('level 2 (high-level approach)', () => {
		it('still flags fenced code and code tokens', () => {
			expect(looksLikeFullCode('```\nfoo\n```', 2)).toBe(true);
			expect(looksLikeFullCode('def helper(x):', 2)).toBe(true);
		});

		it('allows prose-only approach descriptions', () => {
			const text =
				'Use a two-pointer technique. Move the left pointer when the window is invalid, ' +
				'and the right pointer to extend the window. Track the best length seen.';
			expect(looksLikeFullCode(text, 2)).toBe(false);
		});
	});

	describe('level 3 (pseudocode allowed)', () => {
		it('permits a ```pseudo fenced block', () => {
			const text = '```pseudo\nFOR EACH x IN arr\n  IF x > best THEN SET best ← x\nRETURN best\n```';
			expect(looksLikeFullCode(text, 3)).toBe(false);
		});

		it('still refuses real-language fences even at level 3', () => {
			expect(looksLikeFullCode('```python\nfor x in arr: pass\n```', 3)).toBe(true);
			expect(looksLikeFullCode('```ts\nconst x = 1\n```', 3)).toBe(true);
		});
	});

	it('withheld message matches snapshot', () => {
		expect(HINT_WITHHELD_MESSAGE).toMatchInlineSnapshot(
			`"[Hint withheld: the model attempted to emit full code. Try requesting a lower-level hint or rephrase.]"`
		);
		expect(HINT_WITHHELD_MESSAGE).toMatch(/withheld/i);
	});
});
