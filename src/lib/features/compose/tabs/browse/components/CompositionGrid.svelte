<!--
	CompositionGrid.svelte

	Adaptive grid layout for compositions. Uses CompositionLayoutCalculator
	to assign hero/medium/compact sizes. Responsive column count via ResizeObserver.
-->
<script lang="ts">

import { calculateCardSizes } from "#lib/features/compose/tabs/browse/services/composition-layout-calculator.js";
  import type { CompositionBrowseItem } from "../state/composition-browse-state.svelte";
	import type { CardSize } from "../services/types";
	import CompositionCard from "./CompositionCard.svelte";
	import CompositionHeroCard from "./CompositionHeroCard.svelte";
	import { onMount } from "svelte";

	const {
		compositions,
		isLoading = false,
		onExpand,
		onToggleFavorite,
		onPlay,
		onEdit,
	}: {
		compositions: CompositionBrowseItem[];
		isLoading?: boolean;
		onExpand: (item: CompositionBrowseItem) => void;
		onToggleFavorite?: (id: string) => void;
		onPlay?: (id: string) => void;
		onEdit?: (id: string) => void;
	} = $props();

	let gridEl: HTMLDivElement | undefined = $state();
	let columnCount = $state(3);

	// Don't use more columns than compositions (avoids tiny cards when only 1-2 exist)
	const effectiveColumns = $derived(
		Math.min(columnCount, Math.max(1, compositions.length))
	);

	const cardSizes = $derived(
		calculateCardSizes(compositions, effectiveColumns)
	);

	// Responsive column count
	function updateColumnCount(width: number) {
		if (width >= 1600) columnCount = 6;
		else if (width >= 1200) columnCount = 5;
		else if (width >= 800) columnCount = 4;
		else if (width >= 481) columnCount = 3;
		else columnCount = 2;
	}

	onMount(() => {
		if (!gridEl) return;

		updateColumnCount(gridEl.offsetWidth);

		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				updateColumnCount(entry.contentRect.width);
			}
		});

		observer.observe(gridEl);
		return () => observer.disconnect();
	});
</script>

<div
	bind:this={gridEl}
	class="composition-grid"
	style="--col-count: {effectiveColumns}"
>
	{#if isLoading}
		<!-- Skeleton loading -->
		{#each Array(8) as _, i}
			<div
				class="skeleton-card"
				style="animation-delay: calc(var(--stagger-micro, 30ms) * {i})"
			>
				<div class="skeleton-media"></div>
				<div class="skeleton-footer">
					<div class="skeleton-line wide"></div>
					<div class="skeleton-line narrow"></div>
				</div>
			</div>
		{/each}
	{:else}
		{#each compositions as composition, i (composition.id)}
			{@const size = cardSizes.get(composition.id) ?? "compact"}
			{#if size === "hero" && columnCount >= 3}
				<CompositionHeroCard
					{composition}
					staggerIndex={i}
					{onExpand}
					{onToggleFavorite}
					{onPlay}
					{onEdit}
				/>
			{:else}
				<CompositionCard
					{composition}
					size={size === "hero" ? "medium" : size}
					staggerIndex={i}
					{onExpand}
					{onToggleFavorite}
				/>
			{/if}
		{/each}
	{/if}
</div>

<style>
	.composition-grid {
		display: grid;
		grid-template-columns: repeat(var(--col-count, 3), minmax(0, 400px));
		gap: 16px;
		padding: 4px;
		container-type: inline-size;
		justify-content: center;
	}

	/* Skeleton cards */
	.skeleton-card {
		border-radius: 10px;
		overflow: hidden;
		background: var(--theme-card-bg, rgba(8, 8, 12, 0.9));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
		animation: shimmer 1.5s ease-in-out infinite;
	}

	.skeleton-media {
		width: 100%;
		aspect-ratio: 1;
		background: linear-gradient(
			110deg,
			rgba(255, 255, 255, 0.03) 0%,
			rgba(255, 255, 255, 0.06) 40%,
			rgba(255, 255, 255, 0.03) 60%
		);
		background-size: 200% 100%;
		animation: shimmerSlide 1.5s ease-in-out infinite;
	}

	.skeleton-footer {
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.skeleton-line {
		height: 12px;
		border-radius: 4px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
	}

	.skeleton-line.wide {
		width: 70%;
	}

	.skeleton-line.narrow {
		width: 40%;
	}

	@keyframes shimmer {
		0%, 100% { opacity: 0.6; }
		50% { opacity: 1; }
	}

	@keyframes shimmerSlide {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton-card,
		.skeleton-media {
			animation: none;
		}
	}
</style>
