<script lang="ts">
	let importing = $state(false);
	let status = $state<string | null>(null);
	let error = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	async function handleImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const confirmed = confirm(
			`This will REPLACE all existing data with the contents of "${file.name}". This cannot be undone. Continue?`
		);
		if (!confirmed) {
			input.value = '';
			return;
		}

		importing = true;
		status = null;
		error = null;
		try {
			const text = await file.text();
			const res = await fetch('/api/backup/import?confirm=true', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: text
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.message ?? 'Import failed');
			const summary = Object.entries(data.counts)
				.map(([k, v]) => `${k}: ${v}`)
				.join(', ');
			status = `Import complete — ${summary}`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Import failed';
		} finally {
			importing = false;
			input.value = '';
		}
	}
</script>

<svelte:head>
	<title>Settings — codetype-solo</title>
</svelte:head>

<main>
	<h1>Settings</h1>

	<section>
		<h2>Backup & Restore</h2>
		<p>Export all your data to a JSON file, or import a previous backup.</p>

		<div class="actions">
			<a class="btn" href="/api/backup/export" download>Export backup (JSON)</a>

			<button
				class="btn btn-danger"
				disabled={importing}
				onclick={() => fileInput?.click()}
			>
				{importing ? 'Importing…' : 'Import backup (replaces all data)'}
			</button>
			<input
				bind:this={fileInput}
				type="file"
				accept="application/json,.json"
				onchange={handleImport}
				hidden
			/>
		</div>

		{#if status}
			<p class="ok">{status}</p>
		{/if}
		{#if error}
			<p class="err">Error: {error}</p>
		{/if}

		<p class="hint">
			Import is destructive: existing rows in all tables are deleted before the backup is
			restored.
		</p>
	</section>
</main>

<style>
	main {
		max-width: 720px;
		margin: 2rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}
	h1 {
		margin-bottom: 1.5rem;
	}
	section {
		border: 1px solid #ddd;
		border-radius: 8px;
		padding: 1.25rem;
	}
	.actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin: 1rem 0;
	}
	.btn {
		display: inline-block;
		padding: 0.5rem 1rem;
		border: 1px solid #888;
		border-radius: 6px;
		background: #f6f6f6;
		color: #111;
		text-decoration: none;
		cursor: pointer;
		font: inherit;
	}
	.btn:hover {
		background: #eaeaea;
	}
	.btn-danger {
		border-color: #c0392b;
		color: #c0392b;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.ok {
		color: #1e8449;
	}
	.err {
		color: #c0392b;
	}
	.hint {
		color: #666;
		font-size: 0.9rem;
	}
</style>
