<!--
  VillageLabTab - Lab tab root for the TKA Village cultural simulation.
  Mounts Threlte canvas with village scene + control panel sidebar.
-->
<script lang="ts">

// propInterpolator and sequenceConverter are now module-level functions
	import { onDestroy } from "svelte";
	import { Canvas } from "@threlte/core";
	import VillageScene from "./components/VillageScene.svelte";
	import VillageControls from "./components/VillageControls.svelte";
	import { createVillageState, type VillageState } from "./state/village-state.svelte";
	import { setVillageContext, setVillageVisualContext } from "./state/village-context";
	import { createVillageVisualState, type VillageVisualState } from "./state/village-visual-state.svelte";
	import {
		MUSEUM_EXHIBIT_SEQUENCES,
	} from "#lib/features/museum/data/museum-exhibit-sequences.js";
	import {
		createSequenceData,
		type SequenceData,
	} from "#lib/shared/foundation/domain/models/sequence-data.js";

	// Build seed sequences from museum exhibits (first 3)
	function buildSeedSequences(): SequenceData[] {
		const entries = Object.entries(MUSEUM_EXHIBIT_SEQUENCES).slice(0, 3);
		return entries.map(([id, museumSeq]) =>
			createSequenceData({
				id: `village-seed-${id}`,
				word: museumSeq.word,
				steps: museumSeq.steps,
				isCircular: true,
			})
		);
	}

	// Create state synchronously during component init - required for setContext
	let villageState: VillageState | null = null;
	let visualState: VillageVisualState | null = null;
	{
		const seeds = buildSeedSequences();
		villageState = createVillageState(
			{},
			seeds,
			{ targetPopulation: 6 },
		);
		visualState = createVillageVisualState();
		setVillageContext(villageState);
		setVillageVisualContext(visualState);

		const vs = visualState; // capture for closures

		// Wire ECS events to visual toasts and death marks
		villageState.orchestrator.on("teaching:completed", (teacher, learner, _seqId) => {
			vs.pushToast(
				`${teacher.identity.name} taught ${learner.identity.name}`,
				"#4ade80",
				(teacher.transform.x + learner.transform.x) / 2,
				(teacher.transform.z + learner.transform.z) / 2,
			);
		});
		villageState.orchestrator.on("entity:died", (entity) => {
			vs.addDeathMark(entity, villageState!.orchestrator.currentTick);
		});
		villageState.orchestrator.on("sequence:invented", (inventor, seqId) => {
			vs.pushToast(
				`${inventor.identity.name} invented something new`,
				"#fbbf24",
				inventor.transform.x,
				inventor.transform.z,
				3000,
			);
		});
		villageState.orchestrator.on("sequence:forgotten", (entity, _seqId) => {
			vs.pushToast(
				`${entity.identity.name} forgot a sequence`,
				"#ef4444",
				entity.transform.x,
				entity.transform.z,
			);
		});
		villageState.orchestrator.on("sequence:extinct", (_seqId) => {
			vs.pushToast(
				"A sequence was lost forever",
				"#ef4444",
				0, 0,
				4000,
			);
		});
		villageState.orchestrator.on("monument:placed", (_seqId, x, z) => {
			vs.pushToast("A monument rises", "#e8a87c", x, z, 3000);
		});
		villageState.orchestrator.on("monument:relit", (seqId) => {
			vs.triggerRelight(seqId);
			vs.pushToast("Knowledge resurrected", "#f8fafc", 0, 0, 3000);
		});
		villageState.orchestrator.on("jam:formed", (performers, location) => {
			vs.pushToast(
				`Jam session (${performers.length} performers)`,
				"#ffffff",
				location.x,
				location.z,
			);
		});
		villageState.orchestrator.on("school:formed", (school) => {
			vs.pushToast(
				`A style school formed (${school.memberIds.size} members)`,
				school.color,
				0, 0,
				3000,
			);
		});
		villageState.orchestrator.on("school:dissolved", (_schoolId) => {
			vs.pushToast("A style school dissolved", "#6b7280", 0, 0, 2000);
		});
		villageState.orchestrator.on("prop:broken", (entity, artifact) => {
			vs.pushToast(
				`${entity.identity.name}'s ${artifact.propType} broke`,
				"#ef4444",
				entity.transform.x,
				entity.transform.z,
			);
		});
		villageState.orchestrator.on("prop:crafted", (maker, artifact) => {
			vs.pushToast(
				`${maker.identity.name} crafted a ${artifact.propType}`,
				"#4ade80",
				maker.transform.x,
				maker.transform.z,
				3000,
			);
		});
		villageState.orchestrator.on("circle:formed", (circle) => {
			const circleColors: Record<string, string> = {
				fire: "#f97316", led: "#3b82f6", charcoal: "#6b7280",
				trails: "#a855f7", pure: "#f8fafc",
			};
			vs.pushToast(
				`${circle.affinity} circle formed`,
				circleColors[circle.affinity] ?? "#fff",
				circle.centerX,
				circle.centerZ,
				3000,
			);
		});
		villageState.orchestrator.on("season:changed", (season) => {
			const seasonColors: Record<string, string> = {
				normal: "#ffffff", festival: "#fbbf24",
				winter: "#60a5fa", migration: "#a855f7",
			};
			vs.pushToast(
				`Season: ${season}`,
				seasonColors[season] ?? "#fff",
				0, 0,
				4000,
			);
		});

		// Auto-start
		villageState.start();
	}

	onDestroy(() => {
		villageState?.destroy();
	});
</script>

{#if villageState}
	<div class="village-lab">
		<div class="viewport">
			<Canvas>
				<VillageScene />
			</Canvas>
		</div>
		<VillageControls />
	</div>
{:else}
	<div class="village-loading">
		<p>3D services not available</p>
	</div>
{/if}

<style>
	.village-lab {
		display: flex;
		height: 100%;
		width: 100%;
		overflow: hidden;
	}

	.viewport {
		flex: 1;
		position: relative;
		min-height: 0;
	}

	.village-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--theme-text, #fff);
		font-size: var(--font-size-min, 14px);
	}
</style>
