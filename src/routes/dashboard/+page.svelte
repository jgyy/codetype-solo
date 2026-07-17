<script lang="ts">
	import type { PageData } from './$types';
	import MasteryRing from '$lib/components/MasteryRing.svelte';

	let { data }: { data: PageData } = $props();

	function fmtDate(d: Date | string | null): string {
		if (!d) return 'never';
		const date = typeof d === 'string' ? new Date(d) : d;
		return date.toLocaleDateString();
	}
</script>

<svelte:head>
	<title>Dashboard · CodeType Solo</title>
</svelte:head>

<main>
	<h1>Review schedule</h1>

	<section>
		<h2>Due for review today ({data.dueTopics.length})</h2>
		{#if data.dueTopics.length === 0}
			<p class="muted">
				Nothing due. {data.totalTopics === 0
					? 'Submit an attempt to start scheduling reviews.'
					: 'Come back tomorrow.'}
			</p>
		{:else}
			<table>
				<thead>
					<tr>
						<th>Topic</th>
						<th>Mastery</th>
						<th>Ease</th>
						<th>Interval (days)</th>
						<th>Last reviewed</th>
						<th>Next review</th>
						<th>Problems</th>
					</tr>
				</thead>
				<tbody>
					{#each data.dueTopics as t (t.topic)}
						<tr>
							<td>
								<a href="/problems?topic={encodeURIComponent(t.topic)}">{t.topic}</a>
							</td>
							<td><MasteryRing score={t.score} size={30} /></td>
							<td>{t.ease.toFixed(2)}</td>
							<td>{t.intervalDays.toFixed(1)}</td>
							<td>{fmtDate(t.lastReviewedAt)}</td>
							<td>{fmtDate(t.nextReviewAt)}</td>
							<td>{t.problemCount}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	{#if data.weakest.length > 0}
		<section>
			<h2>Weakest topics</h2>
			<ol class="weakest">
				{#each data.weakest as t (t.topic)}
					<li>
						<MasteryRing score={t.score} size={30} />
						<a href="/problems?topic={encodeURIComponent(t.topic)}">{t.topic}</a>
						<span class="muted">ease {t.ease.toFixed(2)}</span>
					</li>
				{/each}
			</ol>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 60rem;
		margin: 0 auto;
		padding: var(--space-5) var(--space-5) 4rem;
		font-family: var(--font-sans);
	}
	h1 {
		margin: 0 0 var(--space-4);
		font-size: 1.6rem;
		letter-spacing: -0.01em;
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
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		text-align: left;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		vertical-align: middle;
	}
	th {
		font-weight: 600;
		font-size: 0.8rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		background: var(--bg-elev);
		position: sticky;
		top: var(--header-h);
		z-index: 1;
	}
	tbody tr {
		transition: background 120ms ease;
	}
	tbody tr:hover {
		background: var(--bg-elev);
	}
	.weakest {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.weakest li {
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border);
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.9rem;
	}
</style>
