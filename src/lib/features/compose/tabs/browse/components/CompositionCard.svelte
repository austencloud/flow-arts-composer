<!--
	CompositionCard.svelte

	Standard card for the composition grid (medium or compact size).
	Displays thumbnail/placeholder, mode badge, favorite indicator,
	name, layout badge, and relative time.
-->
<script lang="ts">

import { resolveThumbnail, generatePlaceholderSvg } from "#lib/features/compose/tabs/browse/services/composition-thumbnail-resolver.js";
  import type { CompositionBrowseItem } from "../state/composition-browse-state.svelte";
	import type { CardSize } from "../services/types";
	import { COMPOSE_MODE_CONFIG } from "#lib/features/compose/shared/domain/compose-mode-config.js";
	import CompositionMiniPreview from "./CompositionMiniPreview.svelte";
	import CompositionAnimatedPreview from "./CompositionAnimatedPreview.svelte";

	const {
		composition,
		size = "compact",
		staggerIndex = 0,
		onExpand,
		onToggleFavorite,
	}: {
		composition: CompositionBrowseItem;
		size?: Exclude<CardSize, "hero">;
		staggerIndex?: number;
		onExpand: (item: CompositionBrowseItem) => void;
		onToggleFavorite?: (id: string) => void;
	} = $props();

	let isHovering = $state(false);
	let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

	const modeConfig = $derived(COMPOSE_MODE_CONFIG[composition.mode]);

	const thumbnailUrl = $derived(resolveThumbnail(composition));
	const placeholderSvg = $derived(
		generatePlaceholderSvg(composition.mode, modeConfig.accent)
	);

	const hasRenderableCells = $derived(
		composition.cells.length > 0 && composition.sequenceCount > 0
	);

	const layoutLabel = $derived(
		`${composition.layout.cols}x${composition.layout.rows}`
	);

	const relativeTime = $derived.by(() => {
		const now = Date.now();
		const diff = now - composition.updatedAt.getTime();
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 30) {
			return composition.updatedAt.toLocaleDateString();
		}
		if (days > 0) return `${days}d ago`;
		if (hours > 0) return `${hours}h ago`;
		if (minutes > 0) return `${minutes}m ago`;
		return "Just now";
	});

	function handleClick() {
		onExpand(composition);
	}

	function handleFavoriteClick(e: MouseEvent) {
		e.stopPropagation();
		onToggleFavorite?.(composition.id);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			handleClick();
		}
	}

	function handleMouseEnter() {
		if (!hasRenderableCells) return;
		// Small delay to avoid mounting animations on accidental hovers
		hoverTimeout = setTimeout(() => {
			isHovering = true;
		}, 300);
	}

	function handleMouseLeave() {
		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
		isHovering = false;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	role="button"
	tabindex="0"
	class="composition-card"
	class:compact={size === "compact"}
	style="
		--stagger-delay: calc(var(--stagger-normal, 50ms) * {staggerIndex});
		view-transition-name: composition-{composition.id};
	"
	onclick={handleClick}
	onkeydown={handleKeyDown}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
>
	<!-- Thumbnail / Mini Preview / Animated Hover Preview / Placeholder -->
	<div class="card-media">
		{#if hasRenderableCells && isHovering}
			<CompositionAnimatedPreview cells={composition.cells} layout={composition.layout} />
		{:else if hasRenderableCells}
			<CompositionMiniPreview cells={composition.cells} layout={composition.layout} />
		{:else if thumbnailUrl}
			<img src={thumbnailUrl} alt={composition.name} class="thumbnail" />
		{:else if placeholderSvg}
			<div class="placeholder" style="background: {modeConfig.gradient}">
				<img src={placeholderSvg} alt="" class="placeholder-svg" aria-hidden="true" />
				<span class="mode-label" style="color: {modeConfig.accent}">{modeConfig.label}</span>
			</div>
		{:else}
			<div class="placeholder" style="background: {modeConfig.gradient}">
				<i class="fas {modeConfig.icon} placeholder-icon" style="color: {modeConfig.accent}" aria-hidden="true"></i>
			</div>
		{/if}

		<!-- Mode badge -->
		<div class="mode-badge" title={modeConfig.label}>
			<i class="fas {modeConfig.icon}" aria-hidden="true"></i>
		</div>

		<!-- Favorite button -->
		<button
			type="button"
			class="favorite-btn"
			class:active={composition.isFavorite}
			title={composition.isFavorite ? "Remove from favorites" : "Add to favorites"}
			aria-label={composition.isFavorite ? "Remove from favorites" : "Add to favorites"}
			onclick={handleFavoriteClick}
		>
			<i class="fas fa-heart" aria-hidden="true"></i>
		</button>
	</div>

	<!-- Footer -->
	<div class="card-footer">
		<h3 class="name">{composition.name || "Untitled"}</h3>
		<div class="meta">
			<span class="layout-badge">{layoutLabel}</span>
			<span class="seq-count">
				<i class="fas fa-layer-group" aria-hidden="true"></i>
				{composition.sequenceCount}
			</span>
			<span class="time">{relativeTime}</span>
		</div>
	</div>
</div>

<style>
	.composition-card {
		position: relative;
		border-radius: 10px;
		overflow: hidden;
		background: var(--theme-card-bg, rgba(8, 8, 12, 0.9));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
		color: var(--theme-text, #fff);
		display: flex;
		flex-direction: column;
		width: 100%;
		padding: 0;
		cursor: pointer;
		transition:
			transform var(--duration-fast, 100ms) var(--ease-out, ease-out),
			box-shadow var(--duration-fast, 100ms) var(--ease-out, ease-out),
			border-color var(--duration-fast, 100ms) var(--ease-out, ease-out);
		animation: cardEntrance var(--duration-normal, 200ms) var(--ease-out, ease-out) both;
		animation-delay: var(--stagger-delay, 0ms);
	}

	.composition-card:hover {
		transform: scale(var(--hover-scale-md, 1.02));
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
	}

	.composition-card:active {
		transform: scale(var(--active-scale, 0.98));
	}

	.composition-card:focus-visible {
		outline: 2px solid var(--theme-accent, #6366f1);
		outline-offset: 2px;
	}

	/* Media */
	.card-media {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
		overflow: hidden;
	}

	.thumbnail {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}

	.placeholder-svg {
		width: 60%;
		height: 60%;
		max-width: 80px;
		max-height: 80px;
		opacity: 0.8;
	}

	.placeholder-icon {
		font-size: 32px;
		opacity: 0.6;
	}

	.mode-label {
		font-size: var(--font-size-compact, 12px);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		opacity: 0.8;
	}

	/* Mode badge */
	.mode-badge {
		position: absolute;
		top: 8px;
		left: 8px;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--theme-panel-bg, rgba(0, 0, 0, 0.7));
		border-radius: 6px;
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text, #fff);
	}

	/* Favorite button */
	.favorite-btn {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 32px;
		height: 32px;
		min-width: var(--min-touch-target);
		min-height: var(--min-touch-target);
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: 6px;
		font-size: var(--font-size-sm, 14px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
		cursor: pointer;
		padding: 0;
		transition: transform var(--duration-fast, 100ms) var(--ease-spring, ease);
	}

	.favorite-btn.active {
		color: var(--semantic-error, #ef4444);
	}

	.favorite-btn:active {
		transform: scale(1.3);
	}

	/* Footer */
	.card-footer {
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.name {
		font-size: var(--font-size-sm, 14px);
		font-weight: 600;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
	}

	.layout-badge {
		padding: 2px 6px;
		border-radius: 4px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
		font-weight: 500;
		font-size: var(--font-size-compact, 12px);
	}

	.seq-count {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.seq-count i {
		font-size: 10px;
		opacity: 0.7;
	}

	/* Compact hides some metadata */
	.compact .mode-label {
		display: none;
	}

	@keyframes cardEntrance {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.composition-card {
			animation: none;
			transition: none;
		}
		.composition-card:hover {
			transform: none;
		}
		.favorite-btn:active {
			transform: none;
		}
	}
</style>
