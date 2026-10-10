<!--
	CompositionMiniPreview.svelte

	Static grid preview for a composition card.
	Shows the layout structure: filled cells get a subtle accent,
	empty cells are nearly invisible. No pictograph rendering -
	the hover animation provides the real preview.
-->
<script lang="ts">
	import type { CellConfig, GridLayout } from "#lib/shared/animation-engine/domain/compose-types.js";

	const {
		cells,
		layout,
	}: {
		cells: CellConfig[];
		layout: GridLayout;
	} = $props();

	// Build a lookup of cell-id → CellConfig for fast access
	const cellLookup = $derived.by(() => {
		const map = new Map<string, CellConfig>();
		for (const cell of cells) {
			map.set(cell.id, cell);
		}
		return map;
	});

	// Generate all grid positions (rows x cols)
	const allPositions = $derived.by(() => {
		const positions: { row: number; col: number; cellId: string; hasContent: boolean }[] = [];
		for (let row = 0; row < layout.rows; row++) {
			for (let col = 0; col < layout.cols; col++) {
				const cellId = `cell-${row}-${col}`;
				const cell = cellLookup.get(cellId);
				const hasContent = !!cell && cell.sequences.length > 0;
				positions.push({ row, col, cellId, hasContent });
			}
		}
		return positions;
	});

	const filledCount = $derived(allPositions.filter((p) => p.hasContent).length);
</script>

<div
	class="mini-grid"
	style="--cols: {layout.cols}; --rows: {layout.rows};"
>
	{#each allPositions as pos (pos.cellId)}
		<div
			class="mini-cell"
			class:filled={pos.hasContent}
			class:empty={!pos.hasContent}
		>
			{#if pos.hasContent}
				<div class="cell-filled">
					<i class="fas fa-play fill-icon" aria-hidden="true"></i>
				</div>
			{/if}
		</div>
	{/each}

	<!-- Central play overlay -->
	{#if filledCount > 0}
		<div class="hover-hint">
			<i class="fas fa-play" aria-hidden="true"></i>
		</div>
	{/if}
</div>

<style>
	.mini-grid {
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		gap: 3px;
		width: 100%;
		height: 100%;
		padding: 6px;
		box-sizing: border-box;
		place-content: center;
		position: relative;
	}

	.mini-cell {
		position: relative;
		overflow: hidden;
		border-radius: 3px;
		aspect-ratio: 1;
	}

	.mini-cell.filled {
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
	}

	.mini-cell.empty {
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.015));
	}

	.cell-filled {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--theme-accent, #6366f1) 8%, transparent) 0%,
			color-mix(in srgb, var(--theme-accent, #6366f1) 3%, transparent) 100%
		);
	}

	.fill-icon {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.12);
	}

	/* Central hover hint overlay */
	.hover-hint {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		opacity: 0;
		transition: opacity 150ms ease;
	}

	.hover-hint i {
		font-size: 24px;
		color: rgba(255, 255, 255, 0.5);
		filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
	}

	.mini-grid:hover .hover-hint {
		opacity: 1;
	}
</style>
