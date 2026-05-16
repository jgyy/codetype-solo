<script lang="ts">
	import type { PageData } from './$types';

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
	<meta name="description" content="Solo typing practice for developers, using real code." />
</svelte:head>

<main>
	<header>
		<h1>CodeType Solo</h1>
		<p class="tagline">Typing practice for developers — built on real code, not lorem ipsum.</p>
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
			<a class="btn ghost" href="/dashboard">SRS dashboard</a>
		</div>
	</section>

	{#if data.suggestion}
		<section>
			<h2>Suggested next</h2>
			<a class="suggestion" href="/problems/{data.suggestion.slug}">
				<div>
					<strong>{data.suggestion.title}</strong>
					<span class="muted">— {data.suggestion.difficulty}</span>
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
						<a href="/problems?topic={encodeURIComponent(t.topic)}">{t.topic}</a>
						<span class="muted">score {t.score.toFixed(1)}</span>
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
		margin: 3rem auto;
		padding: 0 1.5rem;
		font-family: system-ui, sans-serif;
		line-height: 1.5;
	}
	header {
		margin-bottom: 2rem;
	}
	h1 {
		font-size: 2.25rem;
		margin-bottom: 0.25rem;
	}
	.tagline {
		color: #555;
		margin-top: 0;
	}
	section {
		margin-bottom: 2.5rem;
	}
	h2 {
		font-size: 1.15rem;
		margin-bottom: 0.75rem;
	}
	.streak {
		display: flex;
		gap: 2rem;
		align-items: center;
		flex-wrap: wrap;
		padding: 1.25rem;
		background: #fafafa;
		border: 1px solid #eee;
		border-radius: 8px;
	}
	.stat {
		display: flex;
		flex-direction: column;
	}
	.stat-num {
		font-size: 2rem;
		font-weight: 700;
		line-height: 1;
	}
	.stat-label {
		color: #777;
		font-size: 0.9rem;
	}
	.cta {
		margin-left: auto;
		display: flex;
		gap: 0.5rem;
	}
	.btn {
		padding: 0.5rem 0.9rem;
		border: 1px solid #333;
		border-radius: 6px;
		background: #333;
		color: #fff;
		text-decoration: none;
		font-size: 0.9rem;
	}
	.btn.ghost {
		background: transparent;
		color: #333;
	}
	.suggestion {
		display: block;
		padding: 1rem;
		border: 1px solid #ddd;
		border-radius: 6px;
		text-decoration: none;
		color: inherit;
	}
	.suggestion:hover {
		background: #fafafa;
	}
	.weak,
	.recent {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.weak li,
	.recent li {
		padding: 0.5rem 0;
		border-bottom: 1px solid #eee;
		display: flex;
		gap: 0.6rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.chip {
		display: inline-block;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.chip-passed {
		background: #e6f5e6;
		color: #1f7a1f;
	}
	.chip-failed {
		background: #fbe6e6;
		color: #a11;
	}
	.chip-in_progress {
		background: #fff3cd;
		color: #8a6d00;
	}
	.chip-abandoned {
		background: #eee;
		color: #555;
	}
	.muted {
		color: #777;
		font-size: 0.9rem;
	}
</style>
