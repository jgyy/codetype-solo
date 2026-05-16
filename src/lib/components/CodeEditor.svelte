<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorState, Compartment } from '@codemirror/state';
	import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { javascript } from '@codemirror/lang-javascript';
	import { python } from '@codemirror/lang-python';
	import { oneDark } from '@codemirror/theme-one-dark';

	type Language = 'javascript' | 'typescript' | 'python';

	let {
		value = $bindable(''),
		language = 'javascript' as Language,
		onFirstKeystroke = () => {}
	}: {
		value: string;
		language: Language;
		onFirstKeystroke?: () => void;
	} = $props();

	let host: HTMLDivElement;
	let view: EditorView | undefined;
	let langCompartment = new Compartment();
	let firstKeyFired = false;
	let applyingExternal = false;

	function langExtension(lang: Language) {
		if (lang === 'python') return python();
		return javascript({ typescript: lang === 'typescript' });
	}

	onMount(() => {
		const state = EditorState.create({
			doc: value,
			extensions: [
				lineNumbers(),
				highlightActiveLine(),
				history(),
				keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
				langCompartment.of(langExtension(language)),
				oneDark,
				EditorView.updateListener.of((u) => {
					if (u.docChanged) {
						const next = u.state.doc.toString();
						if (applyingExternal) return;
						value = next;
						if (!firstKeyFired) {
							firstKeyFired = true;
							onFirstKeystroke();
						}
					}
				})
			]
		});
		view = new EditorView({ state, parent: host });
	});

	onDestroy(() => view?.destroy());

	$effect(() => {
		if (!view) return;
		view.dispatch({ effects: langCompartment.reconfigure(langExtension(language)) });
	});

	$effect(() => {
		if (!view) return;
		if (view.state.doc.toString() === value) return;
		applyingExternal = true;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: value }
		});
		applyingExternal = false;
	});
</script>

<div bind:this={host} class="editor"></div>

<style>
	.editor {
		height: 100%;
		min-height: 0;
		overflow: hidden;
		border-radius: 6px;
	}
	.editor :global(.cm-editor) {
		height: 100%;
	}
	.editor :global(.cm-scroller) {
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Mono', 'Roboto Mono', monospace;
		font-size: 14px;
	}
</style>
