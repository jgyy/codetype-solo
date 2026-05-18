<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { marked } from 'marked';
	// Force synchronous parse so `{@html}` never sees a Promise stringified
	// to "[object Promise]". Problem descriptions are short enough that
	// async parsing has no benefit here.
	marked.use({ async: false });
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
		marked.parse(data.problem.descriptionMd || '*No description provided yet.*') as string
	);

	let language: Language = $state(
		untrack(() => (data.activeAttempt?.language as Language) ?? 'javascript')
	);
	let code: string = $state(
		untrack(
			() =>
				data.activeAttempt?.code ??
				STARTERS[(data.activeAttempt?.language as Language) ?? 'javascript']
		)
	);
	let attemptId: number | null = $state(untrack(() => data.activeAttempt?.id ?? null));

	let timerStartMs: number | null = $state(null);
	let elapsedMs: number = $state(0);
	let timerInterval: ReturnType<typeof setInterval> | undefined;
	let hydrated = $state(false);
	let hintMessage: string | null = $state(null);
	let submitMessage: string | null = $state(null);

	let starting = $state(false);
	let hinting = $state(false);
	let submitting = $state(false);
	let showDescription = $state(true);

	let messageTimer: ReturnType<typeof setTimeout> | undefined;
	function clearMessagesSoon() {
		if (messageTimer) clearTimeout(messageTimer);
		messageTimer = setTimeout(() => {
			hintMessage = null;
			submitMessage = null;
			notesStatus = null;
		}, 6000);
	}

	let solvedAttemptId: number | null = $state(untrack(() => data.lastSolvedAttempt?.id ?? null));
	let notes: string = $state(untrack(() => data.lastSolvedAttempt?.notes ?? ''));
	let aiSummary: string = $state(untrack(() => data.lastSolvedAttempt?.aiSummary ?? ''));
	let notesStatus: string | null = $state(null);
	let summarizing = $state(false);
	let summarizeError: string | null = $state(null);

	async function generateSummary() {
		if (!solvedAttemptId) return;
		summarizing = true;
		summarizeError = null;
		try {
			// Persist any unsaved notes so the model sees them.
			const saveBody = new FormData();
			saveBody.set('attemptId', String(solvedAttemptId));
			saveBody.set('notes', notes);
			await fetch('?/saveNotes', { method: 'POST', body: saveBody });

			const res = await fetch('/api/summarize', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ attemptId: solvedAttemptId })
			});
			if (!res.ok) {
				const detail = await res.text().catch(() => '');
				throw new Error(detail || `Request failed: ${res.status}`);
			}
			const json = (await res.json()) as { summary: string };
			aiSummary = json.summary;
			notesStatus = 'Summary generated.';
		} catch (err) {
			summarizeError = err instanceof Error ? err.message : 'Failed to generate summary.';
		} finally {
			summarizing = false;
		}
	}

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
		const m = Math.floor(total / 60)
			.toString()
			.padStart(2, '0');
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
			if (form.attemptId) solvedAttemptId = form.attemptId as number;
		}
		if (form && 'notesSaved' in form && form.notesSaved) {
			notesStatus = 'Notes saved.';
		}
		if (hintMessage || submitMessage || notesStatus) clearMessagesSoon();
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
			{#each problem.topics as topic (topic)}
				<span class="topic">{topic}</span>
			{/each}
		</div>
		<div class="spacer"></div>
		<button
			type="button"
			class="desc-toggle"
			onclick={() => (showDescription = !showDescription)}
			aria-pressed={showDescription}
			aria-label="Toggle problem description"
		>
			{showDescription ? 'Hide' : 'Show'} description
		</button>
		<div class="timer" aria-label="elapsed time">⏱ {formatElapsed(elapsedMs)}</div>
	</header>

	<div class="split" class:hide-desc={!showDescription}>
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
						onchange={(e) =>
							onLanguageChange((e.currentTarget as HTMLSelectElement).value as Language)}
					>
						{#each LANGUAGES as lang (lang)}
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
			<form
				method="POST"
				action="?/start"
				use:enhance={() => {
					starting = true;
					return async ({ update }) => {
						await update();
						starting = false;
					};
				}}
			>
				<input type="hidden" name="language" value={language} />
				<input type="hidden" name="code" value={code} />
				<button type="submit" disabled={attemptId !== null || starting}>
					{starting ? 'Starting…' : 'Start Attempt'}
				</button>
			</form>

			<form
				method="POST"
				action="?/hint"
				use:enhance={() => {
					hinting = true;
					return async ({ update }) => {
						await update();
						hinting = false;
					};
				}}
			>
				<input type="hidden" name="attemptId" value={attemptId ?? ''} />
				<button type="submit" disabled={attemptId === null || hinting}>
					{hinting ? 'Getting hint…' : 'Get Hint'}
				</button>
			</form>

			<form
				method="POST"
				action="?/submit"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<input type="hidden" name="attemptId" value={attemptId ?? ''} />
				<input type="hidden" name="language" value={language} />
				<input type="hidden" name="code" value={code} />
				<button type="submit" class="primary" disabled={submitting}>
					{submitting ? 'Submitting…' : 'Submit'}
				</button>
			</form>
		</div>
	</footer>

	{#if solvedAttemptId}
		<section class="notes-panel">
			<header class="notes-header">
				<h2>Notes & takeaways</h2>
				<span class="attempt-pill">Attempt #{solvedAttemptId}</span>
				{#if notesStatus}<span class="msg ok">{notesStatus}</span>{/if}
				{#if summarizeError}<span class="msg err">{summarizeError}</span>{/if}
			</header>
			<form method="POST" action="?/saveNotes" use:enhance class="notes-form">
				<input type="hidden" name="attemptId" value={solvedAttemptId} />
				<label class="notes-label">
					Your notes (markdown)
					<textarea
						name="notes"
						bind:value={notes}
						rows="6"
						placeholder="What approach did you take? What tripped you up?"
					></textarea>
				</label>

				<label class="notes-label">
					AI takeaway (editable)
					<textarea
						name="aiSummary"
						bind:value={aiSummary}
						rows="5"
						placeholder="Click 'AI summarise my approach' to generate a 3-bullet takeaway."
					></textarea>
				</label>

				<div class="notes-actions">
					<button type="submit">Save notes</button>
					<button type="button" onclick={generateSummary} disabled={summarizing}>
						{summarizing ? 'Summarising…' : 'AI summarise my approach'}
					</button>
				</div>
			</form>
		</section>
	{/if}
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
	.msg.err {
		background: #4d1818;
		color: #f0a0a0;
	}
	.notes-panel {
		border-top: 1px solid #222;
		padding: 1rem 1.25rem 1.5rem;
		background: #11141a;
	}
	.notes-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}
	.notes-header h2 {
		font-size: 1rem;
		margin: 0;
		color: #fff;
	}
	.notes-form {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: 1fr 1fr;
	}
	.notes-label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: #9ab;
	}
	.notes-form textarea {
		background: #0f1115;
		color: #e6e6e6;
		border: 1px solid #2a2f3a;
		border-radius: 6px;
		padding: 0.5rem 0.6rem;
		font-family: inherit;
		font-size: 0.875rem;
		resize: vertical;
		min-height: 6rem;
	}
	.notes-actions {
		grid-column: 1 / -1;
		display: flex;
		gap: 0.5rem;
	}
	.desc-toggle {
		display: none;
		background: #1a1d24;
		color: #cdd;
		border: 1px solid #2a2f3a;
		padding: 0.3rem 0.6rem;
		border-radius: 6px;
		font-size: 0.8rem;
		cursor: pointer;
	}
	@media (max-width: 720px) {
		.notes-form {
			grid-template-columns: 1fr;
		}
		.desc-toggle {
			display: inline-block;
		}
		.split {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
		}
		.split.hide-desc .description {
			display: none;
		}
		.description {
			max-height: 40vh;
			border-right: none;
			border-bottom: 1px solid #222;
		}
		.actions {
			width: 100%;
			justify-content: stretch;
		}
		.actions form {
			flex: 1;
		}
		.actions button {
			width: 100%;
		}
	}
</style>
