<!--
  GridMergeAnimation - Orchestrator for the grid merge teaching animation

  Phases:
  - "intro": Simple 4-point diamond grid, no labels
  - "split": Two grids side-by-side (diamond left, box right)
  - "diamond-labels": Split view with cardinal labels animating in on diamond
  - "box-labels": Split view with intercardinal labels animating in on box
  - "merged": Both grids animate together to form the 8-point grid
  - "split-highlight": Split view for point type highlighting
  - "diamond" / "box": One four-point grid, as a pictograph draws it. The box
    is the same points turned 45 degrees, so switching modes rotates in place.

  Highlight phases (for point type teaching, used after merged):
  - "none": No highlighting, all points visible
  - "center": Center point highlighted, others dimmed
  - "hand": Hand points highlighted, others dimmed
  - "outer": Outer points highlighted, others dimmed
-->
<script lang="ts">
	import {
		GRID,
		TIMING,
		RESPONSIVE,
		type BoardLook,
		type Phase,
		type HighlightPhase
	} from './grid-merge-constants';
	import GridBackgrounds from './GridBackgrounds.svelte';
	import RotatingGridGroup from './RotatingGridGroup.svelte';
	import StaticGridGroup from './StaticGridGroup.svelte';
	import DirectionLabels from './DirectionLabels.svelte';
	import ModeLabels from './ModeLabels.svelte';

	let {
		phase = 'intro',
		highlightPhase = 'none',
		look = 'lesson'
	} = $props<{
		phase?: Phase;
		highlightPhase?: HighlightPhase;
		/** 'pictograph' turns the board into the pictograph card later lessons use. */
		look?: BoardLook;
	}>();

	// Derive max-width based on phase
	const maxWidth = $derived(
		phase === 'intro'
			? RESPONSIVE.DESKTOP.MAX_WIDTH_INTRO
			: phase === 'merged' || phase === 'diamond' || phase === 'box'
				? RESPONSIVE.DESKTOP.MAX_WIDTH_MERGED
				: RESPONSIVE.DESKTOP.MAX_WIDTH_SPLIT
	);

	// CSS custom properties for unified timing
	const cssVars = `
		--grid-center: ${GRID.CENTER}px;
		--merge-duration: ${TIMING.MERGE}ms;
		--merge-easing: ${TIMING.EASING};
		--merge-easing-soft: ${TIMING.EASING_SOFT};
		--entrance-duration: ${TIMING.ENTRANCE}ms;
		--label-duration: ${TIMING.LABEL}ms;
		--highlight-duration: ${TIMING.HIGHLIGHT}ms;
		--split-offset-x: ${RESPONSIVE.DESKTOP.SPLIT_OFFSET_X}px;
		--split-offset-y: ${RESPONSIVE.DESKTOP.SPLIT_OFFSET_Y}px;
		--split-offset-x-neg: -${RESPONSIVE.DESKTOP.SPLIT_OFFSET_X}px;
		--split-offset-y-neg: -${RESPONSIVE.DESKTOP.SPLIT_OFFSET_Y}px;
	`;
</script>

<div class="grid-merge-container">
	<svg
		viewBox="0 0 {GRID.SIZE} {GRID.SIZE}"
		class="merge-svg"
		class:look-pictograph={look === 'pictograph'}
		style="{cssVars} --grid-merge-default-max-width: {maxWidth}px;"
	>
		<GridBackgrounds {phase} {look} />
		<RotatingGridGroup {phase} {highlightPhase} {look} />
		<StaticGridGroup {phase} {highlightPhase} />
		<DirectionLabels {phase} {highlightPhase} />
		<ModeLabels {phase} />
	</svg>
</div>

<style>
	.grid-merge-container {
		width: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.merge-svg {
		width: 100%;
		height: auto;
		max-width: var(
			--grid-merge-max-width,
			var(--grid-merge-default-max-width)
		);
		overflow: visible;
		transition: max-width var(--merge-duration) var(--merge-easing);
		/* The pictograph grid's own ink (GridSvg), so the lesson board and a
		   pictograph card drawn over it read as one grid. */
		--board-ink: #000;
	}

	:global(:root.dark) .merge-svg {
		--board-ink: #d0d0d0;
	}

	/* === RESPONSIVE: Update CSS variables for tablet/mobile === */
	@media (max-width: 700px) {
		.merge-svg {
			--split-offset-x: 0px;
			--split-offset-y: 200px;
			--split-offset-x-neg: 0px;
			--split-offset-y-neg: -200px;
			max-width: 400px !important;
		}
	}

	@media (max-width: 500px) {
		.merge-svg {
			--split-offset-y: 180px;
			--split-offset-y-neg: -180px;
			max-width: 340px !important;
		}
	}
</style>
