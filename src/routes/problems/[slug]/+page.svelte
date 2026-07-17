<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { marked, type Tokens } from 'marked';
	// Force synchronous parse so `{@html}` never sees a Promise stringified
	// to "[object Promise]". Also strip raw HTML tokens at both the block and
	// inline level — `descriptionMd` is writable through the backup-import
	// flow, so allowing `<script>` or `<img onerror=...>` through to
	// `{@html}` would be an XSS sink. The `renderer.html` hook only fires for
	// block-level html tokens; inline HTML uses a separate token path, which
	// the walkTokens hook below neutralizes before rendering.
	marked.use({
		async: false,
		walkTokens(token) {
			if (token.type === 'html') {
				const t = token as Tokens.HTML | Tokens.Tag;
				t.text = '';
				t.raw = '';
			}
		},
		renderer: {
			html: () => ''
		}
	});
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
		height: calc(100vh - var(--header-h));
		background: var(--bg);
		color: var(--text);
		font-family: var(--font-sans);
	}
	.topbar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border);
		flex-wrap: wrap;
	}
	.back {
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.875rem;
	}
	.back:hover {
		text-decoration: underline;
	}
	h1 {
		font-size: 1.1rem;
		margin: 0;
		letter-spacing: -0.01em;
	}
	.badge {
		font-size: 0.75rem;
		padding: 0.15rem 0.55rem;
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
		color: #f0806c;
	}
	.topics {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.topic {
		background: var(--bg-elev);
		border: 1px solid var(--border);
		padding: 0.1rem 0.45rem;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.spacer {
		flex: 1;
	}
	.timer {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.95rem;
		color: var(--accent);
	}
	.split {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 1fr;
		min-height: 0;
	}
	.description {
		overflow: auto;
		padding: var(--space-4) var(--space-5);
		border-right: 1px solid var(--border);
	}
	.description :global(h1),
	.description :global(h2),
	.description :global(h3) {
		color: var(--text);
	}
	.description :global(pre) {
		background: var(--bg-elev);
		padding: var(--space-3);
		border-radius: var(--radius-sm);
		overflow: auto;
	}
	.description :global(code) {
		font-family: var(--font-mono);
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
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
	}
	.editor-toolbar label {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.editor-toolbar select {
		background: var(--bg-elev);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.2rem 0.4rem;
		font-family: inherit;
	}
	.attempt-pill {
		font-size: 0.75rem;
		font-family: var(--font-mono);
		background: var(--bg-elev);
		border: 1px solid var(--border);
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		color: var(--text-muted);
	}
	.editor-wrap {
		flex: 1;
		min-height: 0;
	}
	.actionbar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-top: 1px solid var(--border);
		flex-wrap: wrap;
	}
	.actions {
		margin-left: auto;
		display: flex;
		gap: var(--space-2);
	}
	.actionbar form {
		display: inline;
	}
	button {
		background: var(--bg-elev);
		color: var(--text);
		border: 1px solid var(--border);
		padding: 0.45rem 0.85rem;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.875rem;
	}
	button:hover:not(:disabled) {
		border-color: var(--border-strong);
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	button.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg-inset);
		font-weight: 600;
	}
	button.primary:hover:not(:disabled) {
		background: var(--accent-strong);
		border-color: var(--accent-strong);
	}
	.msg {
		font-size: 0.85rem;
		padding: 0.3rem 0.6rem;
		border-radius: var(--radius-sm);
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
		border-top: 1px solid var(--border);
		padding: var(--space-4) var(--space-5) var(--space-5);
		background: var(--bg-elev);
	}
	.notes-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
		flex-wrap: wrap;
	}
	.notes-header h2 {
		font-size: 1rem;
		margin: 0;
		color: var(--text);
	}
	.notes-form {
		display: grid;
		gap: var(--space-3);
		grid-template-columns: 1fr 1fr;
	}
	.notes-label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.notes-form textarea {
		background: var(--bg-inset);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
		font-family: inherit;
		font-size: 0.875rem;
		resize: vertical;
		min-height: 6rem;
	}
	.notes-actions {
		grid-column: 1 / -1;
		display: flex;
		gap: var(--space-2);
	}
	.desc-toggle {
		display: none;
		background: var(--bg-elev);
		color: var(--text-muted);
		border: 1px solid var(--border);
		padding: 0.3rem 0.6rem;
		border-radius: var(--radius-sm);
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
