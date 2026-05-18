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
						<td><span class="badge status {p.status}">{p.status}</span></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</main>

<style>
	main {
		max-width: 64rem;
		margin: 2rem auto;
		padding: 0 1.5rem;
		font-family: system-ui, sans-serif;
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 1rem;
	}
	h1 {
		margin: 0;
	}
	.count {
		color: #666;
		font-size: 0.9rem;
	}
	.search {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.search input {
		flex: 1;
		padding: 0.5rem 0.75rem;
		border: 1px solid #ccc;
		border-radius: 6px;
	}
	.search button {
		padding: 0.5rem 1rem;
		border: 1px solid #ccc;
		background: #fafafa;
		border-radius: 6px;
		cursor: pointer;
	}
	.clear {
		color: #b00;
	}
	.filters {
		display: grid;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	fieldset {
		border: 1px solid #e5e5e5;
		border-radius: 6px;
		padding: 0.5rem 0.75rem;
	}
	legend {
		font-size: 0.85rem;
		color: #555;
		padding: 0 0.25rem;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.2rem 0.5rem;
		margin: 0.15rem;
		border: 1px solid #ddd;
		border-radius: 999px;
		font-size: 0.85rem;
		cursor: pointer;
		background: #fff;
	}
	.chip input {
		margin: 0;
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
		padding: 0.6rem 0.5rem;
		border-bottom: 1px solid #eee;
		font-size: 0.95rem;
	}
	th {
		font-weight: 600;
		color: #444;
		background: #fafafa;
	}
	tbody tr {
		cursor: pointer;
	}
	tbody tr:hover,
	tbody tr:focus {
		background: #f5f7ff;
		outline: none;
	}
	.topics-cell {
		color: #666;
		font-size: 0.85rem;
	}
	.badge {
		display: inline-block;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		font-size: 0.75rem;
		text-transform: capitalize;
	}
	.difficulty.easy {
		background: #e6f6ea;
		color: #1f7a3a;
	}
	.difficulty.medium {
		background: #fff4e0;
		color: #a35a00;
	}
	.difficulty.hard {
		background: #fde7e7;
		color: #a01818;
	}
	.status.solved {
		background: #e6f6ea;
		color: #1f7a3a;
	}
	.status.attempted {
		background: #eef2ff;
		color: #3a4dc4;
	}
	.status.unsolved {
		background: #f0f0f0;
		color: #555;
	}
	.empty {
		text-align: center;
		color: #777;
		padding: 3rem 0;
	}
</style>
