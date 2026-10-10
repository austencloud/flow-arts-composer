<!--
	CompositionAnimatedPreview.svelte

	Animated grid preview for a composition card on hover.
	Uses the same AnimatorCanvas + SequenceAnimationOrchestrator pattern as
	CellCanvas in the Arrange tab. Each filled cell gets its own orchestrator
	driving real prop animations. Shared beat counter runs at 60 BPM.
-->
<script lang="ts">

	import { onMount, onDestroy } from "svelte";
	import AnimatorCanvas from "#lib/shared/animation-engine/components/AnimatorCanvas.svelte";
	import { SequenceAnimationOrchestrator } from "#lib/shared/animation-engine/services/sequence-animation-orchestrator.js";
	import { getViewerAnimationPropConfig } from "#lib/shared/animation-engine/get-viewer-animation-prop-config.js";
	import { AnimationStateManager } from "#lib/shared/animation-engine/services/animation-state-manager.js";
	import { createAnimationPanelState } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
	import type { CellConfig, GridLayout } from "#lib/shared/animation-engine/domain/compose-types.js";
	import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

	const {
		cells,
		layout,
	}: {
		cells: CellConfig[];
		layout: GridLayout;
	} = $props();

	// Shared beat counter at 60 BPM (1 beat per second)
	const BPM = 60;
	const MS_PER_BEAT = 60000 / BPM;
	let currentStep = $state(0);
	let animFrameId: number | null = null;
	let startTime: number | null = null;

	// Per-cell state: orchestrator + animation panel state
	interface CellAnimState {
		cellId: string;
		sequence: SequenceData;
		orchestrator: SequenceAnimationOrchestrator;
		animState: ReturnType<typeof createAnimationPanelState>;
	}

	let cellStates: CellAnimState[] = $state([]);
	let initialized = $state(false);

	// Build lookup: cellId → CellAnimState
	const cellStateMap = $derived.by(() => {
		const map = new Map<string, CellAnimState>();
		for (const cs of cellStates) {
			map.set(cs.cellId, cs);
		}
		return map;
	});

	// Generate all grid positions
	const allPositions = $derived.by(() => {
		const cellLookup = new Map<string, CellConfig>();
		for (const cell of cells) {
			cellLookup.set(cell.id, cell);
		}

		const positions: { row: number; col: number; cellId: string; hasSequence: boolean }[] = [];
		for (let row = 0; row < layout.rows; row++) {
			for (let col = 0; col < layout.cols; col++) {
				const cellId = `cell-${row}-${col}`;
				const cell = cellLookup.get(cellId);
				const hasSequence = !!cell && cell.sequences.length > 0 && (cell.sequences[0]?.steps?.length ?? 0) > 0;
				positions.push({ row, col, cellId, hasSequence });
			}
		}
		return positions;
	});

	onMount(() => {
		try {
			const states: CellAnimState[] = [];

			for (const cell of cells) {
				const seq = cell.sequences[0];
				if (!seq || !seq.steps?.length) continue;

				const orchestrator = new SequenceAnimationOrchestrator(
					new AnimationStateManager(),
					getViewerAnimationPropConfig,
				);
				const animState = createAnimationPanelState();

				orchestrator.initializeWithDomainData(seq);
				animState.setSequenceData(seq);
				animState.setTotalSteps(seq.steps.length);

				states.push({
					cellId: cell.id,
					sequence: seq,
					orchestrator,
					animState,
				});
			}

			cellStates = states;
			initialized = true;

			// Start beat counter
			startTime = performance.now();
			tick(startTime);
		} catch (err) {
			console.error("[CompositionAnimatedPreview] Failed to initialize:", err);
		}
	});

	onDestroy(() => {
		if (animFrameId !== null) cancelAnimationFrame(animFrameId);
		for (const cs of cellStates) {
			cs.orchestrator.dispose();
			cs.animState.dispose();
		}
	});

	function tick(now: number) {
		if (!startTime) startTime = now;
		currentStep = (now - startTime) / MS_PER_BEAT;
		animFrameId = requestAnimationFrame(tick);
	}

	// Sync prop states for all cells each beat
	$effect(() => {
		const playbackPosition = currentStep;
		if (!initialized) return;

		for (const cs of cellStates) {
			const stepCount = cs.sequence.steps?.length || 1;
			const wrapped = playbackPosition % stepCount;
			const step = wrapped + 1; // 1-based, skip start position

			if (cs.orchestrator.isInitialized()) {
				cs.orchestrator.calculateState(step);
				const states = cs.orchestrator.getCurrentPropStates();
				cs.animState.setPropStates(states.left, states.right);
			}
		}
	});
</script>

<div
	class="animated-grid"
	style="--cols: {layout.cols}; --rows: {layout.rows};"
>
	{#each allPositions as pos (pos.cellId)}
		{@const cs = cellStateMap.get(pos.cellId)}
		<div class="anim-cell" class:has-sequence={pos.hasSequence} class:empty-cell={!pos.hasSequence}>
			{#if cs}
				{@const stepCount = cs.sequence.steps?.length || 1}
				{@const wrapped = currentStep % stepCount}
				{@const step = wrapped + 1}
				{@const stepIndex = Math.floor(Math.max(0, Math.min(step - 1, stepCount - 1)))}
				{@const stepData = cs.sequence.steps?.[stepIndex] ?? null}
				<AnimatorCanvas
					leftProp={cs.animState.leftPropState}
					rightProp={cs.animState.rightPropState}
					gridVisible={true}
					gridMode={cs.sequence.gridMode ?? null}
					letter={stepData?.letter || null}
					{stepData}
					currentStep={step}
					isPlaying={true}
					sequenceData={cs.sequence}
					word={null}
					previewDarkMode={true}
					hideTkaGlyph={true}
					hideStepNumbers={true}
					progressBarVariant="minimal"
				/>
			{/if}
		</div>
	{/each}
</div>

<style>
	.animated-grid {
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		gap: 2px;
		width: 100%;
		height: 100%;
		padding: 2px;
		box-sizing: border-box;
		place-content: center;
		background: rgba(0, 0, 0, 0.6);
	}

	.anim-cell {
		position: relative;
		overflow: hidden;
		border-radius: 2px;
		aspect-ratio: 1;
		container-type: size;
	}

	.anim-cell.has-sequence {
		background: var(--theme-panel-bg, #080812);
	}

	.anim-cell.empty-cell {
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.015));
	}

	/* Force AnimatorCanvas to fill the cell without chrome */
	.anim-cell :global(.animation-container) {
		width: 100% !important;
		height: 100% !important;
	}

	.anim-cell :global(.content-wrapper) {
		width: 100% !important;
		height: 100% !important;
		max-width: 100% !important;
		max-height: 100% !important;
		border: none !important;
		border-radius: 0 !important;
	}

	.anim-cell :global(.header-slot),
	.anim-cell :global(.progress-slot) {
		display: none !important;
	}

	.anim-cell :global(.canvas-wrapper) {
		width: 100% !important;
		height: 100% !important;
		max-width: none !important;
		max-height: none !important;
		aspect-ratio: auto !important;
	}
</style>
