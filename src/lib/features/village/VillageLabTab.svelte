<!--
  VillageLabTab - Lab tab root for the TKA Village cultural simulation.
  Mounts Threlte canvas with village scene + control panel sidebar.
  Leaving keeps the village's input log; coming back rebuilds the village
  from it (village-lab-visitor.ts) and mounts it in place of the old one.
-->
<script lang="ts">
	import { onDestroy } from "svelte";
	import VillageLabRun from "./VillageLabRun.svelte";
	import type { VillageLabReturn } from "./components/VillageControls.svelte";
	import { createVillageState, type VillageState } from "./state/village-state.svelte";
	import {
		createVillageVisualState,
		followVillage,
		villageWord,
		type VillageVisualState,
	} from "./state/village-visual-state.svelte";
	import type { VillageInputLog } from "./domain/village-input-log";
	import { buildVillageSequenceCatalogue } from "./services/village-sequence-catalogue";
	import { labVillageOptions, memoryStoryLine } from "./village-lab-visitor";

	interface LabRun {
		villageState: VillageState;
		visualState: VillageVisualState;
		stopFollowing: () => void;
	}

	function createRun(log: VillageInputLog | null): LabRun {
		const options = labVillageOptions(log);
		const { rules } = options;
		const villageState = createVillageState(options);
		// Motion for the catalogue is built async; avatars start playing once it lands.
		void buildVillageSequenceCatalogue(rules).then((catalogue) =>
			villageState.setSequenceCatalogue(catalogue),
		);
		const visualState = createVillageVisualState();
		const stopFollowing = followVillage(villageState, visualState);

		const memory = villageState.snapshot.world.memory;
		if (memory) {
			const tick = villageState.snapshot.world.tick;
			visualState.tellStory([memoryStoryLine(memory, tick, villageWord(memory.sequenceId))]);
		}
		villageState.start();
		return { villageState, visualState, stopFollowing };
	}

	function endRun(old: LabRun): void {
		old.stopFollowing();
		old.villageState.destroy();
	}

	let run = $state.raw<LabRun>(createRun(null));
	let keptLog = $state.raw<VillageInputLog | null>(null);

	function comeBack(log: VillageInputLog): void {
		const old = run;
		run = createRun(log);
		endRun(old);
	}

	const lab: VillageLabReturn = {
		get keptLog() {
			return keptLog;
		},
		leave() {
			keptLog = run.villageState.inputLog;
		},
		comeBack() {
			if (keptLog) comeBack(keptLog);
		},
		load(log) {
			keptLog = log;
			comeBack(log);
		},
	};

	onDestroy(() => endRun(run));
</script>

<div class="village-lab">
	{#key run}
		<VillageLabRun villageState={run.villageState} visualState={run.visualState} {lab} />
	{/key}
</div>

<style>
	.village-lab {
		display: flex;
		height: 100%;
		width: 100%;
		overflow: hidden;
	}
</style>
