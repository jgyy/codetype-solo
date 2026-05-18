<script lang="ts">
	import type { PageData } from './$types';

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
	<h1>Dashboard</h1>

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
						<th>Score</th>
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
							<td>{t.score.toFixed(1)}</td>
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
			<ol>
				{#each data.weakest as t (t.topic)}
					<li>
						<a href="/problems?topic={encodeURIComponent(t.topic)}">{t.topic}</a>
						<span class="muted">— score {t.score.toFixed(1)}, ease {t.ease.toFixed(2)}</span>
					</li>
				{/each}
			</ol>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 60rem;
		margin: 2rem auto;
		padding: 0 1.5rem;
		font-family: system-ui, sans-serif;
	}
	h1 {
		margin-bottom: 1rem;
	}
	section {
		margin-bottom: 2.5rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		text-align: left;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid #eee;
	}
	th {
		background: #fafafa;
		font-weight: 600;
		position: sticky;
		top: 0;
		z-index: 1;
		box-shadow: inset 0 -1px 0 #e5e5e5;
	}
	tbody tr {
		transition: background 120ms ease;
	}
	tbody tr:hover {
		background: #f7f9fc;
	}
	.muted {
		color: #777;
	}
</style>
