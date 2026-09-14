<!--
  Routes a catalog entry to its artifact visual. Every entry gets a distinct
  silhouette derived from its own source material — no shared card grammar,
  no invented relationships between systems (design spec, 2026-07-27).

  Only the ACTIVE artifact runs anything expensive; posters are static or
  near-static by construction.
-->
<script lang="ts">
	import type { CatalogEntry } from "$lib/shared/notation/notation-catalog";
	// The CAPs artifact still lives with the CAPs page under /notation/caps;
	// only the archive itself moved to /history.
	import CapsAssembly from "../../../notation/caps/_components/CapsAssembly.svelte";
	import QftLiveArtifact from "./QftLiveArtifact.svelte";
	import VtgChapterStepper from "./VtgChapterStepper.svelte";
	import NineSquareStack from "./NineSquareStack.svelte";
	import LorqMatrixSheet from "./LorqMatrixSheet.svelte";
	import PoiNotationCartridge from "./PoiNotationCartridge.svelte";
	import TrochoidSheet from "./TrochoidSheet.svelte";
	import TkaLiveArtifact from "./TkaLiveArtifact.svelte";

	let { entry, active = false }: { entry: CatalogEntry; active?: boolean } = $props();
</script>

{#if entry.id === "caps"}
	<!-- Keyed on activation so the two halves draw on each arrival. -->
	{#key active}
		<div class="caps-frame" inert={!active}><CapsAssembly /></div>
	{/key}
{:else if entry.id === "trochoid"}
	<TrochoidSheet {active} />
{:else if entry.id === "vtg"}
	<VtgChapterStepper {active} />
{:else if entry.id === "nine-square"}
	<NineSquareStack videos={entry.videos} {active} />
{:else if entry.id === "qft"}
	<QftLiveArtifact {active} />
{:else if entry.id === "lorq"}
	<LorqMatrixSheet {active} />
{:else if entry.id === "poinotation"}
	<PoiNotationCartridge {active} />
{:else if entry.id === "tka"}
	<TkaLiveArtifact {active} />
{/if}

<style>
	.caps-frame {
		min-height: 0;
		grid-template-rows: minmax(0, 1fr);
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
	}

	.caps-frame :global(.assembly) {
		width: min(100%, 100cqh);
	}

	.caps-frame :global(.replay) {
		min-height: 44px;
	}
</style>
