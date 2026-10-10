<!--
  VillageScene - Threlte 3D scene rendering the village simulation.
  Uses useFrame to sync ECS engine state to avatars each frame.
-->
<script lang="ts">
	import { T, useTask } from "@threlte/core";
	import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
	import VillageAvatar from "./VillageAvatar.svelte";
	import VillageDeathMark from "./VillageDeathMark.svelte";
	import VillageEventToast from "./VillageEventToast.svelte";
	import VillageMonument from "./VillageMonument.svelte";
	import VillageJamCircle from "./VillageJamCircle.svelte";
	import VillageDroppedProp from "./VillageDroppedProp.svelte";
	import VillagePropWall from "./VillagePropWall.svelte";
	import VillageEffectCircle from "./VillageEffectCircle.svelte";
	import { getVillageContext, getVillageVisualContext } from "../state/village-context";
	import { userProportionsState } from "@austencloud/scene-3d";

	const villageState = getVillageContext();

	// PerformerRig places avatars with feet at groundY (~-1.56).
	// Drop the entire ground plane to match.
	const groundLevel = $derived(userProportionsState.groundY);
	const visualState = getVillageVisualContext();

	// syncFromEngine reads ECS targets, lerpAvatars smoothly interpolates positions
	useTask(() => {
		villageState.syncFromEngine();
		villageState.lerpAvatars();
		visualState.pruneToasts();
		visualState.tickDeathMarks(villageState.orchestrator.currentTick);
	});

	const arenaRadius = 8;

	const avatars = $derived(villageState.avatarList);
	const monuments = $derived(villageState.orchestrator.monuments);
	const activeJams = $derived(villageState.orchestrator.activeJams);
	const currentTick = $derived(villageState.orchestrator.currentTick);
	const deathMarks = $derived(visualState.deathMarks);
	const droppedProps = $derived(villageState.orchestrator.droppedProps);
	const propWall = $derived(villageState.orchestrator.propWall);
	const toasts = $derived(visualState.toasts);
	const schools = $derived(villageState.orchestrator.schools ?? []);
	const effectCircles = $derived(villageState.orchestrator.effectCircles ?? []);

	function getSchoolColor(entityId: string): string | null {
		for (const school of schools) {
			if (school.memberIds.has(entityId)) return school.color;
		}
		return null;
	}
</script>

<!-- Lighting -->
<T.AmbientLight intensity={0.4} />
<T.DirectionalLight
	position={[10, 15, 10]}
	intensity={0.8}
	castShadow
/>

<!-- Camera controls -->
<T.PerspectiveCamera
	makeDefault
	position={[0, 6, 12]}
	fov={50}
>
	<OrbitControls
		enableDamping
		target={[0, 0.8, 0]}
		maxPolarAngle={Math.PI / 2}
		minDistance={3}
		maxDistance={30}
	/>
</T.PerspectiveCamera>

<!-- Scene content group -->
<T.Group>
	<!-- Arena ground plane -->
	<T.Mesh rotation.x={-Math.PI / 2} receiveShadow>
		<T.CircleGeometry args={[arenaRadius, 64]} />
		<T.MeshStandardMaterial
			color="#1a1a2e"
			transparent
			opacity={0.6}
		/>
	</T.Mesh>

	<!-- Arena edge ring -->
	<T.Mesh rotation.x={-Math.PI / 2} position.y={0.01}>
		<T.RingGeometry args={[arenaRadius - 0.05, arenaRadius, 64]} />
		<T.MeshBasicMaterial
			color="#e8a87c"
			transparent
			opacity={0.3}
		/>
	</T.Mesh>

	<!-- Grid lines for reference -->
	<T.GridHelper
		args={[arenaRadius * 2, 16, "#333355", "#222244"]}
		position.y={0.005}
	/>

	<!-- Death marks (fading red circles at death locations) -->
	{#each deathMarks as mark (mark.id)}
		<VillageDeathMark {mark} {currentTick} />
	{/each}

	<!-- Dropped props (pulsing ground props at death locations) -->
	{#each droppedProps as drop (drop.artifact.id)}
		<VillageDroppedProp {drop} />
	{/each}

	<!-- Prop wall (retired props display) -->
	<VillagePropWall artifacts={propWall} />

	<!-- Monuments (hexagonal pillars marking surviving sequences) -->
	{#if visualState.showMonuments}
		{#each monuments as monument (monument.sequenceId)}
			<VillageMonument {monument} />
		{/each}
	{/if}

	<!-- Jam circles (pulsing white ground rings for active jams) -->
	{#each activeJams as jam (jam.formedAtTick)}
		<VillageJamCircle {jam} />
	{/each}

	<!-- Effect circles (steady colored rings by affinity, with point lights) -->
	{#if visualState.showCircleRings}
		{#each effectCircles as circle (circle.id)}
			<VillageEffectCircle {circle} />
		{/each}
	{/if}

	<!-- Village avatars -->
	{#each avatars as renderState (renderState.entityId)}
		<VillageAvatar
			{renderState}
			isSelected={villageState.selectedAvatarId === renderState.entityId}
			schoolColor={getSchoolColor(renderState.entityId)}
		/>
	{/each}

	<!-- Event toasts (floating text) -->
	{#if visualState.showToasts}
		{#each toasts as toast (toast.id)}
			<VillageEventToast {toast} />
		{/each}
	{/if}
</T.Group>
