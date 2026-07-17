<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<svelte:head>
	<title>CodeType Solo</title>
</svelte:head>

<main>
	<div class="card">
		<p class="mark">&lt;/&gt;</p>
		<h1>CodeType <span class="accent">Solo</span></h1>
		<p class="tagline">Enter your PIN to unlock your practice history.</p>
		<form method="POST" use:enhance>
			<input
				name="pin"
				type="password"
				inputmode="numeric"
				autocomplete="off"
				placeholder="PIN"
				aria-label="PIN"
				required
			/>
			<button type="submit">Unlock</button>
			{#if form?.error}<p class="err">{form.error}</p>{/if}
		</form>
	</div>
</main>

<style>
	main {
		min-height: 100vh;
		display: grid;
		place-items: center;
		background: var(--bg);
		font-family: var(--font-sans);
	}
	.card {
		width: min(90vw, 320px);
		text-align: center;
		padding: var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-elev);
	}
	.mark {
		font-family: var(--font-mono);
		color: var(--accent);
		font-size: 1.5rem;
		margin: 0 0 var(--space-2);
	}
	h1 {
		margin: 0 0 var(--space-2);
		font-size: 1.4rem;
		letter-spacing: -0.01em;
	}
	.accent {
		color: var(--accent);
	}
	.tagline {
		color: var(--text-muted);
		font-size: 0.9rem;
		margin: 0 0 var(--space-5);
	}
	form {
		display: flex;
		gap: var(--space-2);
	}
	input {
		flex: 1;
		min-width: 0;
		padding: var(--space-3);
		font-size: 1.1rem;
		letter-spacing: 0.2em;
		text-align: center;
		background: var(--bg-inset);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		color: var(--text);
	}
	input::placeholder {
		letter-spacing: normal;
		color: var(--text-dim);
	}
	button {
		padding: var(--space-3) var(--space-4);
		background: var(--accent);
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		color: var(--bg-inset);
		font-weight: 600;
	}
	button:hover {
		background: var(--accent-strong);
	}
	.err {
		width: 100%;
		color: var(--danger);
		font-size: 0.85rem;
		margin: var(--space-2) 0 0;
	}
</style>
