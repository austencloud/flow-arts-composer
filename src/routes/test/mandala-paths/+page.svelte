<script lang="ts">
	import { onMount } from "svelte";
	import { renderMandalaSVG } from "#lib/shared/mandala/services/mandala-renderer.js";
	import { loadCatalogs, loadCatalogSequences } from "#lib/features/choreo-card/services/catalog-loader.js";
	import { mandalaCollectionState } from "#lib/features/mandala/tabs/collection/state/mandala-collection-state.svelte.js";
	import type { Catalog } from "#lib/features/choreo-card/domain/models/Catalog.js";
	import type {
		MandalaRenderOptions,
		MandalaPalette,
		MandalaPaths,
	} from "#lib/shared/mandala/domain/mandala-types.js";
	import {
		DARK_MOTION_BLUE_STROKE,
		DARK_MOTION_RED_STROKE,
		DARK_MOTION_BLUE_FILL,
		DARK_MOTION_RED_FILL,
		DARK_MOTION_PURPLE_STROKE,
		DARK_MOTION_PURPLE_FILL,
	} from "#lib/shared/mandala/domain/mandala-constants.js";
	import { calculate as calculateMandalaGeometry } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
	import type { MandalaPathOptions } from "#lib/shared/mandala/services/types.js";

	const PALETTE: MandalaPalette = {
		leftStroke: DARK_MOTION_BLUE_STROKE,
		leftFill: DARK_MOTION_BLUE_FILL,
		rightStroke: DARK_MOTION_RED_STROKE,
		rightFill: DARK_MOTION_RED_FILL,
		purpleStroke: DARK_MOTION_PURPLE_STROKE,
		purpleFill: DARK_MOTION_PURPLE_FILL,
	};

	type PathMode = "arc" | "linear" | "concave" | "hybrid";

	const PATH_MODES: { key: PathMode; label: string; options: MandalaPathOptions }[] = [
		{ key: "arc", label: "Arc", options: { pathShape: "arc" } },
		{ key: "linear", label: "Linear", options: { pathShape: "linear" } },
		{ key: "concave", label: "Concave", options: { pathShape: "concave" } },
		{ key: "hybrid", label: "Hybrid", options: { motionAware: true } },
	];

	let calcReady: boolean = $state(false);
	let catalogs: Catalog[] = $state([]);
	let selectedCatalogId: string = $state("");
	let catalogSequences: any[] = $state([]);
	let loading: boolean = $state(false);
	let error: string = $state("");
	let currentIndex: number = $state(0);

	type DataSource = "collection" | "catalogs";
	let dataSource: DataSource = $state<DataSource>("collection");

	type ViewMode = "compare" | "grid";
	let viewMode: ViewMode = $state<ViewMode>("compare");
	let gridPathMode: PathMode = $state<PathMode>("arc");
	let mandalaSize = $derived(viewMode === "compare" ? 320 : 260);

	const collectionSequences = $derived(
		mandalaCollectionState.collection.map((m) => ({
			id: m.id,
			word: m.name,
			steps: m.steps,
			leftPropType: m.leftPropType,
			rightPropType: m.rightPropType,
			variant: m.variant,
		}))
	);

	const sequences = $derived(dataSource === "collection" ? collectionSequences : catalogSequences);
	const currentSeq = $derived(sequences[currentIndex] ?? null);

	const comparePaths = $derived.by((): { mode: PathMode; label: string; paths: MandalaPaths | null }[] => {
		if (!calcReady || !currentSeq?.steps) return [];
		const leftProp = currentSeq.leftPropType ?? "staff";
		const rightProp = currentSeq.rightPropType ?? "staff";
		return PATH_MODES.map((m) => ({
			mode: m.key,
			label: m.label,
			paths: calculateMandalaGeometry(currentSeq.steps, leftProp, rightProp, m.options),
		}));
	});

	interface GridEntry {
		id: string;
		word: string;
		svg: string;
		index: number;
	}

	const gridEntries = $derived.by((): GridEntry[] => {
		if (!calcReady || sequences.length === 0) return [];
		const mode = PATH_MODES.find((m) => m.key === gridPathMode)!;
		const opts: MandalaRenderOptions = {
			size: mandalaSize,
			style: "stroke",
			show: "both",
			palette: PALETTE,
		};
		return sequences.map((seq, i) => ({
			id: seq.id,
			word: seq.word ?? seq.name ?? seq.id,
			svg: renderMandalaSVG(
				calculateMandalaGeometry(
					seq.steps,
					seq.leftPropType ?? "staff",
					seq.rightPropType ?? "staff",
					mode.options
				),
				opts
			),
			index: i,
		}));
	});

	function renderSVG(paths: MandalaPaths | null, size: number): string {
		if (!paths) return "";
		return renderMandalaSVG(paths, {
			size,
			style: "stroke",
			show: "both",
			palette: PALETTE,
		});
	}

	onMount(async () => {
		calcReady = true;
		try {
			catalogs = await loadCatalogs();
			const first = catalogs[0];
			if (first) selectedCatalogId = first.id;
		} catch (e: any) {
			error = e.message ?? "Failed to load catalogs";
		}
	});

	$effect(() => {
		if (dataSource !== "catalogs" || !selectedCatalogId) return;
		loading = true;
		error = "";
		currentIndex = 0;
		loadCatalogSequences(selectedCatalogId)
			.then((seqs) => { catalogSequences = seqs; })
			.catch((e: any) => { error = e.message ?? "Failed to load sequences"; })
			.finally(() => { loading = false; });
	});

	function switchSource(source: DataSource) {
		dataSource = source;
		currentIndex = 0;
	}

	function prev() {
		if (sequences.length > 0) {
			currentIndex = (currentIndex - 1 + sequences.length) % sequences.length;
		}
	}

	function next() {
		if (sequences.length > 0) {
			currentIndex = (currentIndex + 1) % sequences.length;
		}
	}

	function selectFromGrid(index: number) {
		currentIndex = index;
		viewMode = "compare";
	}
</script>

<div class="page-root">
	<header class="toolbar">
		<div class="segmented source-toggle">
			<button class:active={dataSource === "collection"} onclick={() => switchSource("collection")}>
				<i class="fas fa-heart" aria-hidden="true"></i> Collection
				{#if mandalaCollectionState.count > 0}
					<span class="badge">{mandalaCollectionState.count}</span>
				{/if}
			</button>
			<button class:active={dataSource === "catalogs"} onclick={() => switchSource("catalogs")}>
				<i class="fas fa-layer-group" aria-hidden="true"></i> Catalogs
			</button>
		</div>

		{#if dataSource === "catalogs"}
			<select bind:value={selectedCatalogId} class="deck-select">
				{#each catalogs as catalog}
					<option value={catalog.id}>{catalog.name} ({catalog.totalSequences})</option>
				{/each}
			</select>
		{/if}

		<div class="segmented">
			<button class:active={viewMode === "compare"} onclick={() => (viewMode = "compare")}>
				<i class="fas fa-columns" aria-hidden="true"></i> Compare
			</button>
			<button class:active={viewMode === "grid"} onclick={() => (viewMode = "grid")}>
				<i class="fas fa-grip" aria-hidden="true"></i> Grid
			</button>
		</div>

		{#if viewMode === "grid"}
			<div class="segmented">
				{#each PATH_MODES as mode}
					<button
						class:active={gridPathMode === mode.key}
						onclick={() => (gridPathMode = mode.key)}
					>
						{mode.label}
					</button>
				{/each}
			</div>
		{/if}

		{#if sequences.length > 0}
			<span class="seq-count">{sequences.length} sequences</span>
		{/if}
	</header>

	<main class="canvas-area">
		{#if loading}
			<div class="center-state">
				<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
				<p>Loading sequences...</p>
			</div>
		{:else if error}
			<div class="center-state error">
				<i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
				<p>{error}</p>
			</div>
		{:else if sequences.length === 0}
			<div class="center-state">
				<i class="fas fa-atom" aria-hidden="true"></i>
				{#if dataSource === "collection"}
					<p>No saved mandalas yet</p>
					<p class="hint">Save mandalas from the Create workspace (right-click grid)</p>
				{:else}
					<p>No sequences in this deck</p>
				{/if}
			</div>
		{:else if viewMode === "compare"}
			<div class="compare-layout">
				<div class="compare-nav">
					<button onclick={prev} aria-label="Previous sequence">
						<i class="fas fa-chevron-left" aria-hidden="true"></i>
					</button>
					<div class="nav-info">
						<span class="nav-word">{currentSeq?.word ?? currentSeq?.name ?? currentSeq?.id ?? ""}</span>
						<span class="nav-counter">{currentIndex + 1} / {sequences.length}</span>
					</div>
					<button onclick={next} aria-label="Next sequence">
						<i class="fas fa-chevron-right" aria-hidden="true"></i>
					</button>
				</div>

				<div class="compare-grid">
					{#each comparePaths as item}
						<div class="compare-card">
							<div class="compare-mandala" style="width: {mandalaSize}px; height: {mandalaSize}px;">
								{@html renderSVG(item.paths, mandalaSize)}
							</div>
							<span class="compare-label">{item.label}</span>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="grid">
				{#each gridEntries as entry (entry.id)}
					<button class="grid-card" onclick={() => selectFromGrid(entry.index)}>
						<div class="grid-mandala">
							{@html entry.svg}
						</div>
						<span class="grid-label">{entry.word}</span>
					</button>
				{/each}
			</div>
		{/if}
	</main>
</div>

<style>
	.page-root {
		display: flex;
		flex-direction: column;
		height: 100vh;
		color: var(--font-color, #e2e8f0);
		background: #0a0a1a;
	}

	header.toolbar {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(255, 255, 255, 0.02);
		backdrop-filter: blur(12px);
	}

	.deck-select {
		padding: 0.4rem 0.6rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(0, 0, 0, 0.3);
		color: inherit;
		font-size: 0.78rem;
		max-width: 260px;
	}

	.segmented {
		display: flex;
		gap: 1px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		padding: 3px;
	}

	.segmented button {
		padding: 0.35rem 0.6rem;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: inherit;
		font-size: 0.72rem;
		cursor: pointer;
		opacity: 0.5;
		transition: all 0.2s;
		white-space: nowrap;
	}

	.segmented button.active {
		background: rgba(167, 139, 250, 0.2);
		opacity: 1;
		box-shadow: 0 1px 4px rgba(167, 139, 250, 0.15);
	}

	.source-toggle .badge {
		font-size: 0.6rem;
		min-width: 16px;
		height: 16px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 4px;
		border-radius: 8px;
		background: rgba(167, 139, 250, 0.3);
		color: #c4b5fd;
		font-variant-numeric: tabular-nums;
	}

	.seq-count {
		font-size: 0.68rem;
		opacity: 0.35;
		font-variant-numeric: tabular-nums;
		margin-left: auto;
	}

	main.canvas-area {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
		scrollbar-width: thin;
		scrollbar-color: rgba(167, 139, 250, 0.2) transparent;
	}

	/* Compare layout */
	.compare-layout {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		height: 100%;
	}

	.compare-nav {
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}

	.compare-nav button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.04);
		color: inherit;
		cursor: pointer;
		transition: all 0.2s;
	}

	.compare-nav button:hover {
		border-color: rgba(167, 139, 250, 0.3);
		background: rgba(167, 139, 250, 0.1);
	}

	.nav-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		min-width: 120px;
	}

	.nav-word {
		font-size: 1rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		opacity: 0.8;
	}

	.nav-counter {
		font-size: 0.68rem;
		opacity: 0.35;
		font-variant-numeric: tabular-nums;
	}

	.compare-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
		max-width: 720px;
		width: 100%;
	}

	.compare-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		padding: 1rem;
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 14px;
		background: rgba(13, 13, 26, 0.6);
		transition: border-color 0.3s;
	}

	.compare-card:hover {
		border-color: rgba(167, 139, 250, 0.15);
	}

	.compare-mandala :global(svg) {
		width: 100%;
		height: 100%;
	}

	.compare-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		opacity: 0.5;
		font-weight: 600;
	}

	/* Grid view */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 1rem;
		align-content: start;
	}

	.grid-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 14px;
		background: rgba(13, 13, 26, 0.6);
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.grid-card:hover {
		border-color: rgba(167, 139, 250, 0.2);
		transform: translateY(-2px);
		box-shadow: 0 8px 32px rgba(167, 139, 250, 0.08);
	}

	.grid-mandala {
		width: 100%;
		aspect-ratio: 1;
	}

	.grid-mandala :global(svg) {
		width: 100%;
		height: 100%;
	}

	.grid-label {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		opacity: 0.45;
	}

	/* States */
	.center-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 0.75rem;
		opacity: 0.4;
	}

	.center-state i {
		font-size: 2rem;
	}

	.center-state .hint {
		font-size: 0.75rem;
		opacity: 0.5;
	}

	.center-state.error {
		opacity: 1;
		color: #f87171;
	}
</style>
