<!--
GalleryFilterSheet.svelte

The gallery's Filters sheet: the drill's categories in a Drawer (bottom sheet
on mobile, right panel on desktop). Applying a value ADDS to the active
filters — chips dismiss individually — and counts inside the sheet compose
with what's already applied. LOOP and T&D-family values stack live without
closing the sheet.

This is THE filter sheet for every BrowsePanel host that shows a Filters
pill (gallery grid, collections add-sequences picker). It was extracted from
GalleryTab so the composition exists exactly once — hosts that assembled
their own copies drifted (dropdown popovers, stale search) within days.
-->
<script lang="ts">
	import type { BrowseEngine } from "$lib/shared/browse/engine/types";
	import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
	import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
	import DrawerHeader from "$lib/shared/foundation/ui/DrawerHeader.svelte";
	import GalleryDrill from "./GalleryDrill.svelte";

	let {
		engine,
		isOpen = $bindable(false),
		isMobile,
		allowSearch = true,
		allowShowAll = true,
		title = "Filters",
		chooserTitle,
		chooserHint,
	}: {
		engine: BrowseEngine;
		isOpen?: boolean;
		isMobile: boolean;
		/** Builder hosts save criteria, not transient text queries. */
		allowSearch?: boolean;
		/** Builder hosts require at least one criterion. */
		allowShowAll?: boolean;
		/** Host-specific drawer title. */
		title?: string;
		/** Host-specific chooser copy without duplicating the drill. */
		chooserTitle?: string;
		chooserHint?: string;
	} = $props();

	// Remount the drill per OPEN (fresh section state) — not per close, which
	// would blank the sheet during the drawer's exit slide.
	let epoch = $state(0);
	let wasOpen = false;
	$effect(() => {
		if (isOpen && !wasOpen) epoch += 1;
		wasOpen = isOpen;
	});

	// Loop filters stack under composite map keys — keep value → key so the
	// sheet can toggle one off without knowing the engine's key scheme.
	const loopKeyByValue = $derived(
		new Map(
			[...engine.activeFilters]
				.filter(([, f]) => f.type === BrowseFilterType.LOOP_TYPE && !f.locked)
				.map(([key, f]) => [String(f.value), key]),
		),
	);
	const activeLoopValues = $derived(new Set(loopKeyByValue.keys()));

	// TnD family filters follow the same stacking contract.
	const familyKeyByValue = $derived(
		new Map(
			[...engine.activeFilters]
				.filter(([, f]) => f.type === BrowseFilterType.TND_FAMILY && !f.locked)
				.map(([key, f]) => [String(f.value), key]),
		),
	);
	const activeFamilyValues = $derived(new Set(familyKeyByValue.keys()));

	function applySearch(query: string) {
		engine.setSearch(query);
		isOpen = false;
	}

	function showAllResults() {
		engine.clearUserFilters();
		isOpen = false;
	}
</script>

<div style:--drawer-width={isMobile ? "100vw" : "min(480px, 44vw)"}>
	<Drawer
		{isOpen}
		placement={isMobile ? "bottom" : "right"}
		class="filter-sheet-drawer"
		{title}
		onOpenChange={(open) => {
			if (!open) isOpen = false;
		}}
	>
		<DrawerHeader {title} onClose={() => (isOpen = false)} />
		<div class="filter-sheet-content">
			{#key epoch}
				<!-- Search is absent in Smart Collection builders because the
				     saved spec serializes filters, not text queries. -->
				<GalleryDrill
					variant="sheet"
					pool={engine.allSequences}
					{chooserTitle}
					{chooserHint}
					getCount={(type, value) => engine.getFilteredCount(type, value)}
					onApply={(type, value, label, color) => {
						engine.addFilter(type, value, label, color ?? "#6aa0ff");
						isOpen = false;
					}}
					{activeLoopValues}
					onToggleLoop={(value, label, color, nowActive) => {
						// Sheet stays open — LOOPs stack, counts recompose live.
						if (nowActive) {
							engine.addFilter(BrowseFilterType.LOOP_TYPE, value, label, color);
						} else {
							const key = loopKeyByValue.get(value);
							if (key) engine.removeFilter(key);
						}
					}}
					{activeFamilyValues}
					onToggleFamily={(familyId, label, color, nowActive) => {
						// Same stacking contract as LOOPs.
						if (nowActive) {
							engine.addFilter(BrowseFilterType.TND_FAMILY, familyId, label, color);
						} else {
							const key = familyKeyByValue.get(familyId);
							if (key) engine.removeFilter(key);
						}
					}}
					onSearch={allowSearch ? applySearch : undefined}
					showAll={allowShowAll}
					onShowAll={allowShowAll ? showAllResults : undefined}
				/>
			{/key}
		</div>
	</Drawer>
</div>

<style>
	/* Fixed height (not max-height): the drill's screens differ in height, and a
	   content-sized sheet would resize on every section change. The drill fills
	   this box and each screen scrolls inside it (Crossfade fill mode). */
	.filter-sheet-content {
		background: var(--theme-panel-bg);
		overflow: hidden;
		height: calc(85dvh - 60px);
	}

	/* Right-placement drawer (desktop) is a full-height 100dvh panel — fill the
	   space under the header instead of the bottom-sheet's 85dvh figure, which
	   would leave a dead band at the bottom. */
	:global(.drawer-content[data-placement="right"]) .filter-sheet-content {
		height: auto;
		flex: 1;
		min-height: 0;
	}

	:global(.filter-sheet-drawer.drawer-content) {
		--sheet-bg: var(--theme-panel-bg);
		--sheet-width: var(--drawer-width, min(480px, 44vw));
		--sheet-max-height: 85dvh;
		--sheet-border-radius-top-left: 16px;
		--sheet-border-radius-top-right: 16px;
	}
</style>
