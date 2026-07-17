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
	<title>Settings · CodeType Solo</title>
</svelte:head>

<main>
	<h1>Settings</h1>

	<section>
		<h2>Backup & restore</h2>
		<p class="lead">Export all your data to a JSON file, or restore a previous backup.</p>

		<div class="actions">
			<a class="btn" href="/api/backup/export" download>Export backup (JSON)</a>

			<button class="btn btn-danger" disabled={importing} onclick={() => fileInput?.click()}>
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
			Importing is destructive: existing rows in every table are deleted before the backup is
			restored.
		</p>
	</section>
</main>

<style>
	main {
		max-width: 720px;
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
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: var(--space-5);
		background: var(--bg-elev);
	}
	h2 {
		margin: 0 0 var(--space-2);
		font-size: 1.1rem;
	}
	.lead {
		color: var(--text-muted);
		margin: 0;
	}
	.actions {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
		margin: var(--space-4) 0;
	}
	.btn {
		display: inline-block;
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--bg-inset);
		color: var(--text);
		text-decoration: none;
		cursor: pointer;
		font: inherit;
		font-size: 0.9rem;
	}
	.btn:hover {
		border-color: var(--accent);
	}
	.btn-danger {
		border-color: var(--danger);
		color: var(--danger);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.ok {
		color: var(--accent);
	}
	.err {
		color: var(--danger);
	}
	.hint {
		color: var(--text-muted);
		font-size: 0.85rem;
	}
</style>
