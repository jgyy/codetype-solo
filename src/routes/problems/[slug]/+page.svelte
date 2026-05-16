<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { marked } from 'marked';
	import CodeEditor from '$lib/components/CodeEditor.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type Language = 'javascript' | 'typescript' | 'python';
	const LANGUAGES: Language[] = ['javascript', 'typescript', 'python'];
	const STARTERS: Record<Language, string> = {
		javascript: '// Write your solution here\nfunction solve() {\n\t\n}\n',
		typescript: '// Write your solution here\nfunction solve(): void {\n\t\n}\n',
		python: '# Write your solution here\ndef solve():\n\tpass\n'
	};

	const problem = $derived(data.problem);
	const descriptionHtml = $derived(
		marked.parse(data.problem.descriptionMd || '*No description provided yet.*')
	);

	let language: Language = $state(
		(data.activeAttempt?.language as Language) ?? 'javascript'
	);
	let code: string = $state(data.activeAttempt?.code ?? STARTERS[(data.activeAttempt?.language as Language) ?? 'javascript']);
	let attemptId: number | null = $state(data.activeAttempt?.id ?? null);

	let timerStartMs: number | null = $state(null);
	let elapsedMs: number = $state(0);
	let timerInterval: ReturnType<typeof setInterval> | undefined;
	let hydrated = $state(false);
	let hintMessage: string | null = $state(null);
	let submitMessage: string | null = $state(null);

	function draftKey(lang: Language) {
		return `codetype-solo:draft:${problem.slug}:${lang}`;
	}

	function timerKey() {
		return `codetype-solo:timerStart:${problem.slug}`;
	}

	function startTimer() {
		if (timerStartMs !== null) return;
		const now = Date.now();
		timerStartMs = now;
		localStorage.setItem(timerKey(), String(now));
	}

	function stopTimer() {
		if (timerInterval) clearInterval(timerInterval);
		timerInterval = undefined;
	}

	function formatElapsed(ms: number) {
		const total = Math.max(0, Math.floor(ms / 1000));
		const m = Math.floor(total / 60).toString().padStart(2, '0');
		const s = (total % 60).toString().padStart(2, '0');
		return `${m}:${s}`;
	}

	onMount(() => {
		const saved = localStorage.getItem(draftKey(language));
		if (saved !== null) code = saved;

		const savedTimer = localStorage.getItem(timerKey());
		if (savedTimer) {
			timerStartMs = Number(savedTimer);
		}
		timerInterval = setInterval(() => {
			if (timerStartMs !== null) elapsedMs = Date.now() - timerStartMs;
		}, 250);
		hydrated = true;
		return () => stopTimer();
	});

	$effect(() => {
		if (!hydrated) return;
		localStorage.setItem(draftKey(language), code);
	});

	function onLanguageChange(next: Language) {
		const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(draftKey(next)) : null;
		language = next;
		code = saved ?? STARTERS[next];
	}

	function onFirstKeystroke() {
		startTimer();
	}

	$effect(() => {
		if (form && 'attemptId' in form && form.attemptId) {
			attemptId = form.attemptId as number;
		}
		if (form && 'hint' in form && form.hint) {
			hintMessage = `Hint ${form.hint.level}: ${form.hint.response}`;
		}
		if (form && 'submitted' in form && form.submitted) {
			submitMessage = 'Submission recorded as passed.';
			stopTimer();
		}
	});
</script>

<svelte:head>
	<title>{problem.title} — CodeType</title>
</svelte:head>

<div class="page">
	<header class="topbar">
		<a class="back" href="/problems">← All problems</a>
		<h1>{problem.title}</h1>
		<span class="badge badge-{problem.difficulty}">{problem.difficulty}</span>
		<div class="topics">
			{#each problem.topics as topic}
				<span class="topic">{topic}</span>
			{/each}
		</div>
		<div class="spacer"></div>
		<div class="timer" aria-label="elapsed time">⏱ {formatElapsed(elapsedMs)}</div>
	</header>

	<div class="split">
		<section class="description">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<article>{@html descriptionHtml}</article>
		</section>

		<section class="editor-pane">
			<div class="editor-toolbar">
				<label>
					Language
					<select
						value={language}
						onchange={(e) => onLanguageChange((e.currentTarget as HTMLSelectElement).value as Language)}
					>
						{#each LANGUAGES as lang}
							<option value={lang}>{lang}</option>
						{/each}
					</select>
				</label>
				{#if attemptId}
					<span class="attempt-pill">Attempt #{attemptId}</span>
				{/if}
			</div>
			<div class="editor-wrap">
				<CodeEditor bind:value={code} {language} {onFirstKeystroke} />
			</div>
		</section>
	</div>

	<footer class="actionbar">
		{#if submitMessage}
			<span class="msg ok">{submitMessage}</span>
		{/if}
		{#if hintMessage}
			<span class="msg hint">{hintMessage}</span>
		{/if}
		<div class="actions">
			<form method="POST" action="?/start" use:enhance>
				<input type="hidden" name="language" value={language} />
				<input type="hidden" name="code" value={code} />
				<button type="submit" disabled={attemptId !== null}>Start Attempt</button>
			</form>

			<form method="POST" action="?/hint" use:enhance>
				<input type="hidden" name="attemptId" value={attemptId ?? ''} />
				<button type="submit" disabled={attemptId === null}>Get Hint</button>
			</form>

			<form method="POST" action="?/submit" use:enhance>
				<input type="hidden" name="attemptId" value={attemptId ?? ''} />
				<input type="hidden" name="language" value={language} />
				<input type="hidden" name="code" value={code} />
				<button type="submit" class="primary">Submit</button>
			</form>
		</div>
	</footer>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: #0f1115;
		color: #e6e6e6;
	}
	.topbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #222;
		flex-wrap: wrap;
	}
	.back {
		color: #9ab;
		text-decoration: none;
		font-size: 0.875rem;
	}
	.back:hover {
		text-decoration: underline;
	}
	h1 {
		font-size: 1.1rem;
		margin: 0;
	}
	.badge {
		font-size: 0.75rem;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		text-transform: capitalize;
	}
	.badge-easy {
		background: #114d2a;
		color: #6cf09f;
	}
	.badge-medium {
		background: #4d3a11;
		color: #f0c66c;
	}
	.badge-hard {
		background: #4d1818;
		color: #f06c6c;
	}
	.topics {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.topic {
		background: #1a1d24;
		border: 1px solid #2a2f3a;
		padding: 0.1rem 0.45rem;
		border-radius: 4px;
		font-size: 0.75rem;
		color: #9ab;
	}
	.spacer {
		flex: 1;
	}
	.timer {
		font-variant-numeric: tabular-nums;
		font-size: 0.95rem;
		color: #cdd;
	}
	.split {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 1fr;
		min-height: 0;
	}
	.description {
		overflow: auto;
		padding: 1rem 1.25rem;
		border-right: 1px solid #222;
	}
	.description :global(h1),
	.description :global(h2),
	.description :global(h3) {
		color: #fff;
	}
	.description :global(pre) {
		background: #1a1d24;
		padding: 0.75rem;
		border-radius: 6px;
		overflow: auto;
	}
	.description :global(code) {
		font-family: ui-monospace, monospace;
		font-size: 0.9em;
	}
	.editor-pane {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.editor-toolbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid #222;
	}
	.editor-toolbar label {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
		font-size: 0.85rem;
		color: #aab;
	}
	.editor-toolbar select {
		background: #1a1d24;
		color: #e6e6e6;
		border: 1px solid #2a2f3a;
		border-radius: 4px;
		padding: 0.2rem 0.4rem;
	}
	.attempt-pill {
		font-size: 0.75rem;
		background: #1a1d24;
		border: 1px solid #2a2f3a;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		color: #9ab;
	}
	.editor-wrap {
		flex: 1;
		min-height: 0;
	}
	.actionbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 1rem;
		border-top: 1px solid #222;
		flex-wrap: wrap;
	}
	.actions {
		margin-left: auto;
		display: flex;
		gap: 0.5rem;
	}
	.actionbar form {
		display: inline;
	}
	button {
		background: #1a1d24;
		color: #e6e6e6;
		border: 1px solid #2a2f3a;
		padding: 0.45rem 0.85rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.875rem;
	}
	button:hover:not(:disabled) {
		background: #232733;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	button.primary {
		background: #2f7d4f;
		border-color: #2f7d4f;
		color: white;
	}
	button.primary:hover:not(:disabled) {
		background: #38935b;
	}
	.msg {
		font-size: 0.85rem;
		padding: 0.3rem 0.6rem;
		border-radius: 4px;
	}
	.msg.ok {
		background: #114d2a;
		color: #6cf09f;
	}
	.msg.hint {
		background: #1a2a4d;
		color: #9cc4f0;
	}
</style>
