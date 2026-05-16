<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<main>
	<h1>Enter PIN</h1>
	<form method="POST" use:enhance>
		<input name="pin" type="password" inputmode="numeric" autocomplete="off" required />
		<button type="submit">Unlock</button>
		{#if form?.error}<p class="err">{form.error}</p>{/if}
	</form>
</main>

<style>
	main {
		max-width: 320px;
		margin: 4rem auto;
		font-family: system-ui, sans-serif;
	}
	form {
		display: flex;
		gap: 0.5rem;
	}
	input {
		flex: 1;
		padding: 0.5rem;
		font-size: 1rem;
	}
	button {
		padding: 0.5rem 1rem;
	}
	.err {
		color: #c33;
		width: 100%;
	}
</style>
