<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data }: { data: PageData } = $props();

	const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
	const STATUSES = ['unsolved', 'attempted', 'solved'] as const;

	// Writable $derived: tracks data.filters.q from the loader, but local
	// reassignments (typing in the search box, clearAll) take precedence until
	// the dependency changes again.
	let q = $derived(data.filters.q);

	function buildUrl(mutate: (params: URLSearchParams) => void) {
		const params = new URLSearchParams(page.url.searchParams);
		mutate(params);
		return `?${params.toString()}`;
	}

	function toggleParam(key: string, value: string) {
		const next = buildUrl((p) => {
			const existing = p.getAll(key);
			p.delete(key);
			if (existing.includes(value)) {
				for (const v of existing) if (v !== value) p.append(key, v);
			} else {
				for (const v of existing) p.append(key, v);
				p.append(key, value);
			}
		});
		goto(next, { keepFocus: true, noScroll: true });
	}

	function submitSearch(e: SubmitEvent) {
		e.preventDefault();
		const next = buildUrl((p) => {
			p.delete('q');
			if (q.trim()) p.set('q', q.trim());
		});
		goto(next, { keepFocus: true, noScroll: true });
	}

	function clearAll() {
		q = '';
		goto('?', { keepFocus: true, noScroll: true });
	}

	const hasFilters = $derived(
		!!data.filters.q ||
			data.filters.difficulty.length > 0 ||
			data.filters.topic.length > 0 ||
			data.filters.status.length > 0
	);
</script>

<svelte:head>
	<title>Problems · CodeType Solo</title>
</svelte:head>

<main>
	<header>
		<h1>Problems</h1>
		<p class="count">
			Showing {data.problems.length} of {data.totalCount}
		</p>
	</header>

	<form class="search" onsubmit={submitSearch}>
		<input
			type="search"
			placeholder="Search by title…"
			bind:value={q}
			aria-label="Search problems by title"
		/>
		<button type="submit">Search</button>
		{#if hasFilters}
			<button type="button" class="clear" onclick={clearAll}>Clear all</button>
		{/if}
	</form>

	<section class="filters">
		<fieldset>
			<legend>Difficulty</legend>
			{#each DIFFICULTIES as d (d)}
				<label class="chip">
					<input
						type="checkbox"
						checked={data.filters.difficulty.includes(d)}
						onchange={() => toggleParam('difficulty', d)}
					/>
					<span>{d}</span>
				</label>
			{/each}
		</fieldset>

		<fieldset>
			<legend>Status</legend>
			{#each STATUSES as s (s)}
				<label class="chip">
					<input
						type="checkbox"
						checked={data.filters.status.includes(s)}
						onchange={() => toggleParam('status', s)}
					/>
					<span>{s}</span>
				</label>
			{/each}
		</fieldset>

		<fieldset class="topics">
			<legend>Topics</legend>
			<div class="topic-list">
				{#each data.allTopics as t (t)}
					<label class="chip">
						<input
							type="checkbox"
							checked={data.filters.topic.includes(t)}
							onchange={() => toggleParam('topic', t)}
						/>
						<span>{t}</span>
					</label>
				{/each}
			</div>
		</fieldset>
	</section>

	{#if data.problems.length === 0}
		<p class="empty">No problems match your filters. Try clearing some.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Title</th>
					<th>Difficulty</th>
					<th>Topics</th>
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				{#each data.problems as p (p.id)}
					<tr onclick={() => goto(`/problems/${p.slug}`)} tabindex="0">
						<td>{p.title}</td>
						<td><span class="badge difficulty {p.difficulty}">{p.difficulty}</span></td>
						<td class="topics-cell">{p.topics.join(', ')}</td>
						<td><span class="badge status {p.status}">{p.status.replace('_', ' ')}</span></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</main>

<style>
	main {
		max-width: 64rem;
		margin: 0 auto;
		padding: var(--space-5) var(--space-5) 4rem;
		font-family: var(--font-sans);
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: var(--space-4);
	}
	h1 {
		margin: 0;
		font-size: 1.6rem;
		letter-spacing: -0.01em;
	}
	.count {
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.search {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}
	.search input {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--bg-inset);
		color: var(--text);
	}
	.search button {
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--border-strong);
		background: var(--bg-elev);
		color: var(--text);
		border-radius: var(--radius-sm);
	}
	.search button:hover {
		background: var(--bg-inset);
	}
	.clear {
		color: var(--danger);
		border-color: var(--danger) !important;
	}
	.filters {
		display: grid;
		gap: var(--space-4);
		margin-bottom: var(--space-5);
	}
	fieldset {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
	}
	legend {
		font-size: 0.8rem;
		color: var(--text-muted);
		padding: 0 var(--space-1);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0.2rem 0.6rem;
		margin: 0.15rem;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		font-size: 0.85rem;
		cursor: pointer;
		background: var(--bg-inset);
	}
	.chip:has(input:checked) {
		border-color: var(--accent);
		color: var(--accent-strong);
	}
	.chip input {
		margin: 0;
		accent-color: var(--accent);
	}
	.topic-list {
		display: flex;
		flex-wrap: wrap;
		max-height: 8rem;
		overflow-y: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		text-align: left;
		padding: var(--space-3) var(--space-2);
		border-bottom: 1px solid var(--border);
		font-size: 0.95rem;
	}
	th {
		font-weight: 600;
		color: var(--text-muted);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	tbody tr {
		cursor: pointer;
		transition: background 120ms ease;
	}
	tbody tr:hover,
	tbody tr:focus {
		background: var(--bg-elev);
		outline: none;
	}
	.topics-cell {
		color: var(--text-muted);
		font-size: 0.85rem;
	}
	.badge {
		display: inline-block;
		padding: 0.1rem 0.55rem;
		border-radius: 999px;
		font-size: 0.75rem;
		text-transform: capitalize;
	}
	.difficulty.easy {
		background: #114d2a;
		color: #6cf09f;
	}
	.difficulty.medium {
		background: #4d3a11;
		color: #f0c66c;
	}
	.difficulty.hard {
		background: #4d1818;
		color: #f0806c;
	}
	.status.solved {
		background: #114d2a;
		color: #6cf09f;
	}
	.status.attempted {
		background: #1a2a4d;
		color: #9cc4f0;
	}
	.status.unsolved {
		background: var(--bg-inset);
		color: var(--text-muted);
	}
	.empty {
		text-align: center;
		color: var(--text-muted);
		padding: 3rem 0;
	}
</style>
