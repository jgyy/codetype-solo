<script lang="ts">
	import type { PageData } from './$types';
	import MasteryRing from '$lib/components/MasteryRing.svelte';

	let { data }: { data: PageData } = $props();

	function fmtTime(d: Date | string): string {
		const date = typeof d === 'string' ? new Date(d) : d;
		return date.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>CodeType Solo</title>
	<meta
		name="description"
		content="Solo practice for real interview problems, with AI-guarded hints and spaced-repetition weak-topic tracking."
	/>
</svelte:head>

<main>
	<header>
		<h1>Welcome back</h1>
		<p class="tagline">
			Real problems, a timer, guarded hints, and a schedule that remembers your weak spots.
		</p>
	</header>

	<section class="streak">
		<div class="stat">
			<span class="stat-num">{data.streak}</span>
			<span class="stat-label">day streak</span>
		</div>
		<div class="stat">
			<span class="stat-num">{data.totalAttempts}</span>
			<span class="stat-label">total attempts</span>
		</div>
		<div class="cta">
			<a class="btn" href="/problems">Browse problems</a>
			<a class="btn ghost" href="/dashboard">Review schedule</a>
		</div>
	</section>

	{#if data.suggestion}
		<section>
			<h2>Suggested next</h2>
			<a class="suggestion" href="/problems/{data.suggestion.slug}">
				<div>
					<strong>{data.suggestion.title}</strong>
					<span class="badge badge-{data.suggestion.difficulty}">{data.suggestion.difficulty}</span>
				</div>
				<div class="muted">Weakest topic: {data.suggestion.topic}</div>
			</a>
		</section>
	{/if}

	<section>
		<h2>Top 3 weak topics</h2>
		{#if data.weakTopics.length === 0}
			<p class="muted">No mastery data yet. Submit an attempt to start tracking.</p>
		{:else}
			<ol class="weak">
				{#each data.weakTopics as t (t.topic)}
					<li>
						<MasteryRing score={t.score} size={32} />
						<a href="/problems?topic={encodeURIComponent(t.topic)}">{t.topic}</a>
					</li>
				{/each}
			</ol>
		{/if}
	</section>

	<section>
		<h2>Recent attempts</h2>
		{#if data.recent.length === 0}
			<p class="muted">No attempts yet.</p>
		{:else}
			<ul class="recent">
				{#each data.recent as a (a.id)}
					<li>
						<a href="/problems/{a.problemSlug}">{a.problemTitle}</a>
						<span class="chip chip-{a.status}">{a.status.replace('_', ' ')}</span>
						<span class="muted">{a.language} · {fmtTime(a.startedAt)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 48rem;
		margin: 0 auto;
		padding: var(--space-5) var(--space-5) 4rem;
		font-family: var(--font-sans);
		line-height: 1.5;
	}
	header {
		margin-bottom: var(--space-5);
	}
	h1 {
		font-size: 2rem;
		margin: 0 0 var(--space-1);
		letter-spacing: -0.01em;
	}
	.tagline {
		color: var(--text-muted);
		margin: 0;
	}
	section {
		margin-bottom: 2.5rem;
	}
	h2 {
		font-size: 1rem;
		margin: 0 0 var(--space-3);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.streak {
		display: flex;
		gap: var(--space-5);
		align-items: center;
		flex-wrap: wrap;
		padding: var(--space-4) var(--space-5);
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.stat {
		display: flex;
		flex-direction: column;
	}
	.stat-num {
		font-family: var(--font-mono);
		font-size: 2rem;
		font-weight: 700;
		line-height: 1;
		color: var(--accent);
	}
	.stat-label {
		color: var(--text-muted);
		font-size: 0.85rem;
	}
	.cta {
		margin-left: auto;
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.btn {
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--bg-inset);
		font-weight: 600;
		text-decoration: none;
		font-size: 0.9rem;
	}
	.btn:hover {
		background: var(--accent-strong);
		color: var(--bg-inset);
	}
	.btn.ghost {
		background: transparent;
		border-color: var(--border-strong);
		color: var(--text);
	}
	.btn.ghost:hover {
		background: var(--bg-inset);
	}
	.suggestion {
		display: block;
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		text-decoration: none;
		color: inherit;
		background: var(--bg-elev);
	}
	.suggestion:hover {
		border-color: var(--border-strong);
	}
	.suggestion > div:first-child {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-1);
	}
	.badge {
		font-size: 0.7rem;
		padding: 0.1rem 0.5rem;
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
	.weak,
	.recent {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.weak li {
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border);
		display: flex;
		gap: var(--space-3);
		align-items: center;
	}
	.recent li {
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border);
		display: flex;
		gap: 0.6rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.chip {
		display: inline-block;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.chip-passed {
		background: #114d2a;
		color: #6cf09f;
	}
	.chip-failed {
		background: #4d1818;
		color: #f0806c;
	}
	.chip-in_progress {
		background: #4d3a11;
		color: #f0c66c;
	}
	.chip-abandoned {
		background: var(--bg-inset);
		color: var(--text-muted);
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.9rem;
	}
</style>
