<!--
  Poi Legal Matrix — curation page. VTG flower matrix rendered as poi light
  trails; click a cell to cycle its legality verdict (unjudged → legal →
  illegal → unsure). Save writes the committed JSON data file through the
  dev-only endpoint. Spec: docs/superpowers/specs/2026-07-19-poi-legal-matrix-design.md
-->
<script lang="ts">
	import { onMount } from "svelte";
	import {
		loadShapeMatrix,
		type ShapeMatrixData,
	} from "#lib/shared/shape-matrix/services/shape-matrix-flowers.js";
	import ShapeMatrixGrid from "#lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte";
	import {
		renderPoiCell,
		renderPoiHeader,
	} from "#lib/shared/shape-matrix/services/shape-matrix-poi-render.js";
	import { applyFilter } from "#lib/shared/shape-matrix/domain/filter-flower-axis.js";
	import {
		matrixFiltersForSize,
		type MatrixSize,
	} from "#lib/shared/shape-matrix/domain/matrix-size-preset.js";
	import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
	import { createPoiLegalVerdicts } from "#lib/features/levels/poi-lab/services/poi-legal-verdicts.svelte.js";

	let data = $state<ShapeMatrixData | null>(null);
	let err = $state("");

	let size = $state<MatrixSize>("large");
	type ViewMode = "all" | "unjudged" | "illegal";
	let view = $state<ViewMode>("all");

	const store = createPoiLegalVerdicts();

	const filters = $derived(matrixFiltersForSize(size));
	const rowAxis = $derived(data ? applyFilter(data.axis, filters.left, filters.collapse) : []);
	const colAxis = $derived(data ? applyFilter(data.axis, filters.right, filters.collapse) : []);
	const cellCount = $derived(rowAxis.length * colAxis.length);

	const judgedInView = $derived.by(() => {
		let judged = 0;
		for (const bf of rowAxis)
			for (const rf of colAxis) if (store.verdictFor(bf, rf) !== null) judged++;
		return judged;
	});

	let saveState = $state<{ ok: boolean; message: string } | null>(null);
	let saving = $state(false);
	async function save() {
		saving = true;
		saveState = null;
		saveState = await store.save();
		saving = false;
	}

	onMount(async () => {
		try {
			data = await loadShapeMatrix();
		} catch (e) {
			err = String(e);
		}
	});
</script>

<svelte:head><title>Poi Legal Matrix · Lab</title></svelte:head>

<div class="page">
	<header>
		<h1>Poi Legal Matrix</h1>
		<span>click a cell: unjudged → legal → illegal → unsure → unjudged</span>
		{#if data}
			<span class="count">{judgedInView} / {cellCount} judged</span>
		{/if}
	</header>

	{#if err}
		<p class="err">{err}</p>
	{:else if !data}
		<p class="loading">Building flowers…</p>
	{:else}
		<div class="toolbar">
			<div class="group">
				<span class="group-label">Matrix</span>
				<SegmentedControl
					options={[
						{ value: "small", label: "16" },
						{ value: "medium", label: "64" },
						{ value: "large", label: "144" },
					]}
					value={size}
					onchange={(v) => (size = v as MatrixSize)}
					size="sm"
				/>
			</div>
			<div class="group">
				<span class="group-label">Focus</span>
				<SegmentedControl
					options={[
						{ value: "all", label: "All" },
						{ value: "unjudged", label: "Unjudged" },
						{ value: "illegal", label: "Illegal" },
					]}
					value={view}
					onchange={(v) => (view = v as ViewMode)}
					size="sm"
				/>
			</div>
			<div class="group save-group">
				<button class="save" onclick={save} disabled={saving || store.dirtyCount === 0}>
					{saving ? "Saving…" : `Save (${store.dirtyCount})`}
				</button>
				<span class="save-note" class:ok={saveState?.ok} class:fail={saveState && !saveState.ok}>
					{saveState?.message ?? " "}
				</span>
			</div>
		</div>

		<ShapeMatrixGrid
			{data}
			{rowAxis}
			{colAxis}
			painter={{ cell: renderPoiCell, header: renderPoiHeader }}
			overlayFor={(b, r) => store.verdictFor(b, r)}
			dimFor={(b, r) => {
				const verdict = store.verdictFor(b, r);
				if (view === "unjudged") return verdict !== null;
				if (view === "illegal") return verdict !== "illegal";
				return false;
			}}
			onselect={(pair) => store.cycle(pair.left, pair.right)}
		/>
	{/if}
</div>

<style>
	.page {
		display: grid;
		grid-template-rows: auto auto 1fr;
		height: 100dvh;
		background: #07070c;
		color: #e8eef4;
	}
	header {
		display: flex;
		gap: 12px;
		align-items: baseline;
		padding: 12px 20px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	header h1 {
		font-size: 15px;
		margin: 0;
		letter-spacing: 0.01em;
	}
	header span {
		color: rgba(255, 255, 255, 0.82);
		font-size: 12.5px;
	}
	header .count {
		margin-left: auto;
		color: #5fe0f2;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		min-width: 11ch;
		text-align: right;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
		align-items: center;
		padding: 10px 20px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.group {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.group-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: rgba(255, 255, 255, 0.55);
	}
	.save-group {
		margin-left: auto;
	}
	.save {
		min-height: 44px;
		padding: 8px 18px;
		border-radius: 10px;
		border: 1px solid transparent;
		background: linear-gradient(135deg, #0ea5b7, #6d5ef0);
		color: #fff;
		font-weight: 600;
		font-size: 13px;
		cursor: pointer;
		font-variant-numeric: tabular-nums;
	}
	.save:hover:not(:disabled) {
		filter: brightness(1.15);
	}
	.save:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.save-note {
		font-size: 12px;
		min-width: 18ch;
		color: rgba(255, 255, 255, 0.55);
	}
	.save-note.ok {
		color: #4ade80;
	}
	.save-note.fail {
		color: #f87171;
	}

	.err {
		color: #f87171;
		padding: 24px;
	}
	.loading {
		color: rgba(255, 255, 255, 0.7);
		padding: 24px;
	}
</style>
