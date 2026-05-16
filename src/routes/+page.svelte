<script lang="ts">
	const features = [
		'Practice typing on real code snippets',
		'Track speed and accuracy over time',
		'Spot recurring weaknesses and drill them'
	];
</script>

<svelte:head>
	<title>CodeType Solo</title>
	<meta name="description" content="Solo typing practice for developers, using real code." />
</svelte:head>

<main>
	<h1>CodeType Solo</h1>
	<p class="tagline">Typing practice for developers — built on real code, not lorem ipsum.</p>

	<ul>
		{#each features as feature (feature)}
			<li>{feature}</li>
		{/each}
	</ul>

	<p>
		See <a href="https://github.com/jgyy/codetype-solo">the repository</a> for setup and roadmap.
	</p>
</main>

<style>
	main {
		max-width: 40rem;
		margin: 4rem auto;
		padding: 0 1.5rem;
		font-family: system-ui, sans-serif;
		line-height: 1.5;
	}
	h1 {
		font-size: 2.25rem;
		margin-bottom: 0.25rem;
	}
	.tagline {
		color: #555;
		margin-top: 0;
	}
</style>
