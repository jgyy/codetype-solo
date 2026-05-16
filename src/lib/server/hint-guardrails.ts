// Pure guardrails for hint responses. Kept separate from the route handler
// so they can be unit-tested without DB/network setup.

export type HintLevel = 1 | 2 | 3;

export const FORBIDDEN_FENCE = /```(?:javascript|typescript|js|ts|jsx|tsx|python|py)\b/i;
export const FORBIDDEN_TOKENS =
	/\b(?:function\s+\w+\s*\(|def\s+\w+\s*\(|class\s+\w+|console\.log|=>|import\s+|from\s+\w+\s+import)/;

export function looksLikeFullCode(text: string, level: HintLevel): boolean {
	if (FORBIDDEN_FENCE.test(text)) return true;
	if (level < 3 && /```/.test(text)) return true;
	if (level < 3 && FORBIDDEN_TOKENS.test(text)) return true;
	return false;
}

export const HINT_WITHHELD_MESSAGE =
	'[Hint withheld: the model attempted to emit full code. Try requesting a lower-level hint or rephrase.]';
