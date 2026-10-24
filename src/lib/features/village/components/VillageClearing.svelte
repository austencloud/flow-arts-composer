<!--
  VillageClearing - The village's place: the firefly forest at night with
  its own campfire, pit and chairs moved to the village fire, firelight on
  the people round it (VillageFireLight), a standing stone per founding
  sequence at the clearing's edge, the threads between teachers and
  learners, the loss caption, and the people.

  The lab and the museum both mount this, so they show the same composition.
  Village y = 0 is the ground, raised by floorLift where a floor lies below
  (the museum); the forest, the chairs and the people all stand on it.
-->
<script lang="ts">
	import ForestScene from "#lib/shared/3d/environments/scenes/ForestScene.svelte";
	import { T } from "@threlte/core";
	import { userProportionsState } from "@austencloud/scene-3d";
	import { preloadSittingClip } from "#lib/shared/3d/performers/chair-sitter.js";
	import { SEATED_AUDIENCE_ANIMATION_URLS } from "#lib/shared/3d/config/seated-audience-assets.js";
	import VillageAvatar from "./VillageAvatar.svelte";
	import VillageStandingStone from "./VillageStandingStone.svelte";
	import VillageLineageThreads from "./VillageLineageThreads.svelte";
	import VillageLossCaption from "./VillageLossCaption.svelte";
	import VillageVisitorFigure from "./VillageVisitorFigure.svelte";
	import VillageFireLight from "./VillageFireLight.svelte";
	import VillageTreeRing from "./VillageTreeRing.svelte";
	import { createVillageForestConfig } from "./village-forest-config";
	import { getVillageContext, getVillageVisualContext } from "../state/village-context";
	import type { AvatarRenderState } from "../state/village-state.svelte";

	interface Props {
		// The people to draw; the museum passes a distance-trimmed list.
		avatars: readonly AvatarRenderState[];
		// False where HTML labels would show through walls.
		showLabels?: boolean;
		// Extra lift for the forest floor, so it does not fight a floor below.
		floorLift?: number;
		// The museum's third-person body swap: while the visitor teaches, a
		// figure plays their side of the lesson at this opacity. Null draws
		// no figure (first person, the lab).
		visitorFigure?: { opacity: number; onReady: () => void } | null;
		// Where the museum visitor stands, in village space, while they are in
		// the room: the far end of the threads from those they taught.
		visitorPosition?: { x: number; z: number } | null;
		// Each person, once their body is fully in (the museum's reveal gate).
		onAvatarShown?: (entityId: string) => void;
		// The tree ring's GLBs placed.
		onTreeRingReady?: () => void;
	}

	const {
		avatars,
		showLabels = true,
		floorLift = 0,
		visitorFigure = null,
		visitorPosition = null,
		onAvatarShown,
		onTreeRingReady,
	}: Props = $props();

	const villageState = getVillageContext();
	const visualState = getVillageVisualContext();

	const forestConfig = createVillageForestConfig(villageState.rules);
	const forestLift = $derived(-userProportionsState.groundY + floorLift);
	const stones = $derived(villageState.snapshot.world.stones);

	// The elders' sitting clip, fetched up front so the first to sit does
	// not wait on it. A failure only means they stand by the chair.
	void preloadSittingClip(SEATED_AUDIENCE_ANIMATION_URLS[0]!).catch((error) => {
		console.warn("[VillageClearing] sitting clip failed to load:", error);
	});
</script>

<T.Group position.y={forestLift}>
	<ForestScene variant="firefly" config={forestConfig} showStage={false} />
</T.Group>
<VillageTreeRing centre={villageState.rules.campfire} lift={floorLift} onReady={onTreeRingReady} />

<!-- The floor the people stand on (village y = 0 plus floorLift, the same
	floor as the grass, the chairs and every body), not the forest GLB's lift,
	which sits about 1.6 m higher. -->
<VillageFireLight groundY={floorLift} />

{#each stones as stone (stone.sequenceId)}
	<VillageStandingStone {stone} relighting={visualState.relightingStones.has(stone.sequenceId)} />
{/each}

<VillageLineageThreads visitor={visitorPosition} />

{#each avatars as renderState (renderState.entityId)}
	<VillageAvatar
		{renderState}
		isSelected={villageState.selectedAvatarId === renderState.entityId}
		showLabel={showLabels}
		onShown={onAvatarShown && (() => onAvatarShown(renderState.entityId))}
		floorY={floorLift}
	/>
{/each}

{#if visitorFigure && villageState.visitorRenderState}
	<VillageVisitorFigure
		renderState={villageState.visitorRenderState}
		opacity={visitorFigure.opacity}
		floorY={floorLift}
		onReady={visitorFigure.onReady}
	/>
{/if}

{#if showLabels && visualState.caption}
	{#key visualState.caption.id}
		<VillageLossCaption caption={visualState.caption} />
	{/key}
{/if}
