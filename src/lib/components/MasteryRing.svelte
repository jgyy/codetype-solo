<script lang="ts">
	// Presentational only: normalizes the unbounded topic_mastery.score
	// (+1 per unaided pass, floored at 0, see mastery.ts) against a 5-solve
	// "mastered" heuristic so it reads as a ring rather than a raw float.
	let { score, size = 40 }: { score: number; size?: number } = $props();

	const pct = $derived(Math.max(0, Math.min(1, score / 5)));
	const deg = $derived(pct * 360);
</script>

<div
	class="ring"
	style="--size: {size}px; --deg: {deg}deg"
	role="img"
	aria-label="Mastery score {score.toFixed(1)} of 5"
>
	<span class="value">{score.toFixed(1)}</span>
</div>

<style>
	.ring {
		position: relative;
		width: var(--size);
		height: var(--size);
		flex-shrink: 0;
		border-radius: 50%;
		background: conic-gradient(var(--accent) var(--deg), var(--border) 0deg);
	}
	.value {
		position: absolute;
		inset: 4px;
		border-radius: 50%;
		background: var(--bg-elev);
		display: grid;
		place-items: center;
		font-family: var(--font-mono);
		font-size: calc(var(--size) * 0.28);
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}
</style>
