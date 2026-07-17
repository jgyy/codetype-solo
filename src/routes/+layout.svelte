<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children } = $props();

	const NAV = [
		{ href: '/problems', label: 'Problems' },
		{ href: '/dashboard', label: 'Dashboard' },
		{ href: '/settings', label: 'Settings' }
	];

	const isPin = $derived(page.url.pathname === '/pin');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if !isPin}
	<header>
		<nav>
			<a class="brand" href="/">
				<span class="mark">&lt;/&gt;</span> CodeType <span class="solo">Solo</span>
			</a>
			<div class="links">
				{#each NAV as item (item.href)}
					<a href={item.href} class:active={page.url.pathname.startsWith(item.href)}>
						{item.label}
					</a>
				{/each}
			</div>
		</nav>
	</header>
{/if}

{@render children()}

<style>
	:global(:root) {
		/* Design tokens - shared shape with codetype-race's token set, distinct
		   palette: warm/emerald "practice" identity vs race's cool cyan "arena". */
		--bg: #0f1115;
		--bg-elev: #171a20;
		--bg-inset: #0a0c10;
		--border: #262b35;
		--border-strong: #38404f;
		--text: #e8e6df;
		--text-muted: #9a9488;
		--text-dim: #625d54;
		--accent: #6cf09f;
		--accent-strong: #8ef7b8;
		--warning: #f0c66c;
		--danger: #f0806c;
		--success: #6cf09f;
		--focus: #4ea3ff;
		--radius: 8px;
		--radius-sm: 5px;
		--header-h: 57px;
		--space-1: 0.25rem;
		--space-2: 0.5rem;
		--space-3: 0.75rem;
		--space-4: 1rem;
		--space-5: 1.5rem;
		--font-sans: system-ui, -apple-system, 'Segoe UI', sans-serif;
		--font-mono:
			ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Mono', 'Roboto Mono', monospace;
	}
	:global(body) {
		color-scheme: dark;
		font: 15px/1.5 var(--font-sans);
		margin: 0;
		background: var(--bg);
		color: var(--text);
	}
	:global(a) {
		color: var(--accent);
	}
	:global(a:hover) {
		color: var(--accent-strong);
	}
	:global(*:focus-visible) {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}
	:global(button) {
		cursor: pointer;
		font-family: inherit;
	}
	:global(button:disabled) {
		cursor: not-allowed;
		opacity: 0.55;
	}
	:global(table) {
		font-family: var(--font-sans);
	}
	header {
		box-sizing: border-box;
		min-height: var(--header-h);
		display: flex;
		align-items: center;
		padding: var(--space-3) var(--space-5);
		border-bottom: 1px solid var(--border);
		background: var(--bg-elev);
		position: sticky;
		top: 0;
		z-index: 10;
	}
	nav {
		display: flex;
		width: 100%;
		gap: var(--space-4);
		align-items: center;
		justify-content: space-between;
		max-width: 960px;
		margin: 0 auto;
		flex-wrap: wrap;
	}
	.brand {
		display: inline-flex;
		align-items: baseline;
		gap: 0.35rem;
		font-weight: 700;
		color: var(--text);
		text-decoration: none;
		font-size: 1.05rem;
		letter-spacing: -0.01em;
	}
	.brand .mark {
		color: var(--accent);
		font-family: var(--font-mono);
		font-weight: 600;
	}
	.brand .solo {
		color: var(--accent);
		font-weight: 600;
	}
	.links {
		display: flex;
		gap: var(--space-4);
		align-items: center;
		flex-wrap: wrap;
	}
	.links a {
		text-decoration: none;
		color: var(--text-muted);
		font-size: 0.9rem;
		padding: var(--space-1) 0;
		border-bottom: 2px solid transparent;
		transition:
			color 120ms ease,
			border-color 120ms ease;
	}
	.links a:hover {
		color: var(--text);
	}
	.links a.active {
		color: var(--text);
		border-bottom-color: var(--accent);
	}
	@media (max-width: 600px) {
		header {
			padding: var(--space-3) var(--space-4);
		}
		nav {
			gap: var(--space-2);
		}
	}
</style>
