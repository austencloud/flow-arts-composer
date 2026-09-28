<!--
  DirectionLabels - Cardinal (N/E/S/W) and Intercardinal (NE/SE/SW/NW) labels
  Labels animate position/scale in sync with grid animations using CSS transitions
-->
<script lang="ts">
	import { tDynamic } from '$lib/shared/i18n/i18n.svelte.js';
	import { onDestroy } from 'svelte';
	import { CARDINAL_LABELS, INTERCARDINAL_LABELS, type Phase, type HighlightPhase } from './grid-merge-constants';

	let { phase, highlightPhase = 'none' } = $props<{
		phase: Phase;
		highlightPhase?: HighlightPhase;
	}>();

	// Track which labels have been shown (prevents re-animation on back navigation)
	let prevPhase = $state<Phase>("intro");
	let cardinalShown = $state(false);
	let intercardinalShown = $state(false);

	// Track if we should animate in (true briefly when first appearing)
	let animatingCardinal = $state(false);
	let animatingIntercardinal = $state(false);

	let cardinalTimer: ReturnType<typeof setTimeout> | undefined;
	let intercardinalTimer: ReturnType<typeof setTimeout> | undefined;

	$effect.pre(() => {
		// Detect first appearance of cardinal labels
		const cardinalJustAppeared = phase === 'diamond-labels' && !cardinalShown;
		const intercardinalJustAppeared = phase === 'box-labels' && !intercardinalShown;

		if (cardinalJustAppeared) {
			animatingCardinal = true;
			// Clear after animation completes (stagger + duration)
			clearTimeout(cardinalTimer);
			cardinalTimer = setTimeout(() => {
				animatingCardinal = false;
			}, 600); // 400ms max delay + 400ms animation
		}

		if (intercardinalJustAppeared) {
			animatingIntercardinal = true;
			clearTimeout(intercardinalTimer);
			intercardinalTimer = setTimeout(() => {
				animatingIntercardinal = false;
			}, 600);
		}

		// Track shown state (after checking for first appearance)
		if (phase === 'diamond-labels' || phase === 'box-labels' || phase === 'merged') {
			cardinalShown = true;
		}
		if (phase === 'box-labels' || phase === 'merged') {
			intercardinalShown = true;
		}

		// Reset shown state when going back to intro
		if (phase === 'intro' || phase === 'split') {
			cardinalShown = false;
			intercardinalShown = false;
		}

		prevPhase = phase;
	});

	onDestroy(() => {
		clearTimeout(cardinalTimer);
		clearTimeout(intercardinalTimer);
	});

	// Visibility
	const showCardinal = $derived(
		phase === 'diamond-labels' || phase === 'box-labels' || phase === 'merged'
	);
	const showIntercardinal = $derived(phase === 'box-labels' || phase === 'merged');

	// Split positioning (labels follow their respective grids)
	const isSplitCardinal = $derived(phase === 'diamond-labels' || phase === 'box-labels');
	const isSplitIntercardinal = $derived(phase === 'box-labels');

	const isHighlighting = $derived(highlightPhase !== 'none');
</script>

<g
	class="direction-labels"
	class:highlighting={isHighlighting}
	aria-label={tDynamic('learn_grid_directions_aria')}
>
	<!-- Cardinal labels (N, E, S, W) - follow diamond grid -->
	{#each CARDINAL_LABELS as label, i}
		<text
			class="label cardinal-label"
			class:visible={showCardinal}
			class:split={isSplitCardinal}
			class:animate-in={animatingCardinal}
			x={label.x}
			y={label.y}
			text-anchor="middle"
			dominant-baseline="middle"
			data-index={i}
		>
			{label.id}
		</text>
	{/each}

	<!-- Intercardinal labels (NE, SE, SW, NW) - follow box grid -->
	{#each INTERCARDINAL_LABELS as label, i}
		<text
			class="label intercardinal-label"
			class:visible={showIntercardinal}
			class:split={isSplitIntercardinal}
			class:animate-in={animatingIntercardinal}
			x={label.x}
			y={label.y}
			text-anchor="middle"
			dominant-baseline="middle"
			data-index={i}
		>
			{label.id}
		</text>
	{/each}
</g>

<style>
	.label {
		font-size: 46px;
		font-weight: 700;
		fill: var(--theme-text-dim, #9ca3af);
		font-family: system-ui, -apple-system, sans-serif;
		opacity: 0;
		transform: translate(0, 0) scale(1);
		transform-origin: center;
		/* Sync with grid animation - same duration and easing */
		transition: transform var(--merge-duration) var(--merge-easing);
	}

	/* Visible state (merged position - centered, full scale) */
	.label.visible {
		opacity: 1;
		transform: translate(0, 0) scale(1);
	}

	/* Split positioning - cardinal labels follow diamond grid (left/top) */
	.cardinal-label.split {
		transform: translate(var(--split-offset-x-neg), var(--split-offset-y-neg)) scale(0.5);
	}

	.cardinal-label.split.visible {
		opacity: 1;
	}

	/* Split positioning - intercardinal labels follow box grid (right/bottom) */
	.intercardinal-label.split {
		transform: translate(var(--split-offset-x), var(--split-offset-y)) scale(0.5);
	}

	.intercardinal-label.split.visible {
		opacity: 1;
	}

	/* Animate-in with stagger for cardinal labels (first appearance only) */
	.cardinal-label.animate-in {
		animation: labelPopIn var(--label-duration) var(--merge-easing) both;
	}
	.cardinal-label.animate-in[data-index='0'] {
		animation-delay: var(--duration-instant);
	}
	.cardinal-label.animate-in[data-index='1'] {
		animation-delay: var(--duration-normal);
	}
	.cardinal-label.animate-in[data-index='2'] {
		animation-delay: var(--duration-emphasis);
	}
	.cardinal-label.animate-in[data-index='3'] {
		animation-delay: var(--duration-dramatic);
	}

	/* Animate-in with stagger for intercardinal labels (first appearance only) */
	.intercardinal-label.animate-in {
		animation: labelPopInBox var(--label-duration) var(--merge-easing) both;
	}
	.intercardinal-label.animate-in[data-index='0'] {
		animation-delay: var(--duration-instant);
	}
	.intercardinal-label.animate-in[data-index='1'] {
		animation-delay: var(--duration-normal);
	}
	.intercardinal-label.animate-in[data-index='2'] {
		animation-delay: var(--duration-emphasis);
	}
	.intercardinal-label.animate-in[data-index='3'] {
		animation-delay: var(--duration-dramatic);
	}

	/* Hide labels during highlighting */
	.highlighting .label {
		opacity: 0;
	}

	/* === KEYFRAMES for initial pop-in (polished with subtle overshoot) === */
	@keyframes labelPopIn {
		0% {
			opacity: 0;
			transform: translate(var(--split-offset-x-neg), var(--split-offset-y-neg)) scale(0);
		}
		40% {
			opacity: 1;
		}
		70% {
			transform: translate(var(--split-offset-x-neg), var(--split-offset-y-neg)) scale(0.55);
		}
		100% {
			opacity: 1;
			transform: translate(var(--split-offset-x-neg), var(--split-offset-y-neg)) scale(0.5);
		}
	}

	@keyframes labelPopInBox {
		0% {
			opacity: 0;
			transform: translate(var(--split-offset-x), var(--split-offset-y)) scale(0);
		}
		40% {
			opacity: 1;
		}
		70% {
			transform: translate(var(--split-offset-x), var(--split-offset-y)) scale(0.55);
		}
		100% {
			opacity: 1;
			transform: translate(var(--split-offset-x), var(--split-offset-y)) scale(0.5);
		}
	}

	@media (max-width: 700px) {
		.label {
			font-size: 38px;
		}
	}

	@media (max-width: 500px) {
		.label {
			font-size: 32px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.label {
			transition: none;
			animation: none;
		}

		.label.visible {
			opacity: 1;
			transform: translate(0, 0) scale(1);
		}

		.cardinal-label.split.visible {
			transform: translate(var(--split-offset-x-neg), var(--split-offset-y-neg)) scale(0.5);
		}

		.intercardinal-label.split.visible {
			transform: translate(var(--split-offset-x), var(--split-offset-y)) scale(0.5);
		}
	}
</style>
