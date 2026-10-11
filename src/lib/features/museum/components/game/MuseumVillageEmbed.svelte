<!--
  MuseumVillageEmbed - Pure visual renderer for the persistent Village sim.

  Does NOT own the orchestrator. Reads from MuseumVillageManager which
  persists across room transitions. Walking away and back: village has
  progressed, no GLTF reload, no population reset.
-->
<script lang="ts">
	import { T, useTask, useThrelte } from "@threlte/core";
	import VillageAvatar from "#lib/features/village/components/VillageAvatar.svelte";
	import VillageDeathMark from "#lib/features/village/components/VillageDeathMark.svelte";
	import VillageMonument from "#lib/features/village/components/VillageMonument.svelte";
	import VillageJamCircle from "#lib/features/village/components/VillageJamCircle.svelte";
	import VillageEffectCircle from "#lib/features/village/components/VillageEffectCircle.svelte";
	import VillageDroppedProp from "#lib/features/village/components/VillageDroppedProp.svelte";
	import { setVillageContext, setVillageVisualContext } from "#lib/features/village/state/village-context.js";
	import ForestScene from "#lib/shared/3d/environments/scenes/ForestScene.svelte";
	import { createDefaultForestFireflyConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/forest-scene-config.js";
	import { userProportionsState } from "@austencloud/scene-3d";
	import {
		getMuseumVillageManager,
		setMuseumVillageVisible,
	} from "../../services/museum-village-manager";
	import { Vector3 } from "three";

	interface Props {
		centerX: number;
		centerZ: number;
		/** Museum camera position for LOD calculations */
		cameraPosition?: { x: number; y: number; z: number };
		/** Whether the player is close enough that labels should be shown.
		 *  When false, HTML name labels are hidden to prevent them from
		 *  rendering through museum walls (CSS2D ignores occlusion). */
		showLabels?: boolean;
		/** False when the museum is mounted-but-hidden (keep-alive) - pause per-frame sync */
		visible?: boolean;
	}

	const { centerX, centerZ, cameraPosition, showLabels = true, visible = true }: Props = $props();

	const forestLift = $derived(-userProportionsState.groundY);

	// ForestScene's default path is the complete production world, which mounts
	// itself at the scene root (scene.add) and sets global fog: it ignores this
	// group's position and visibility and floods every wing of the museum. An
	// explicit config selects the bounded composition that renders inside the
	// group, so the forest stays in the hall and hides when the visitor leaves.
	const forestConfig = createDefaultForestFireflyConfig();

	// Get or create the persistent village manager
	const manager = getMuseumVillageManager();

	if (manager) {
		setVillageContext(manager.villageState);
		setVillageVisualContext(manager.visualState);
	}

	$effect(() => {
		if (!manager) return;
		setMuseumVillageVisible(visible);
		return () => setMuseumVillageVisible(false);
	});

	const villageState = manager?.villageState ?? null;
	const visualState = manager?.visualState ?? null;

	// Progressive avatar mounting: mount one avatar per idle callback to spread
	// out the GLTF parsing cost. The actual freeze is from GLTFLoader.parse(),
	// not from the network (models are preloaded). Mounting all 8 at once causes
	// 8 concurrent parses = 2-3 second freeze. Using requestIdleCallback means
	// each mount only happens when the browser has spare time, so frame drops
	// are avoided entirely rather than just spread out.
	let mountedAvatarCount = $state(0);

	if (manager) {
		// Force an initial sync so avatarList is populated
		villageState!.syncFromEngine();

		const totalToMount = 10;

		function mountNextAvatar(deadline?: IdleDeadline): void {
			// Only mount if we have enough idle time (>5ms) to avoid jank
			if (deadline && deadline.timeRemaining() < 5) {
				requestIdleCallback(mountNextAvatar);
				return;
			}

			if (mountedAvatarCount < totalToMount) {
				mountedAvatarCount++;
				requestIdleCallback(mountNextAvatar);
			}
		}

		requestIdleCallback(mountNextAvatar);
	}

	// Per-frame sync. Skipped while the museum is hidden (keep-alive) so the
	// avatar lerp / death-mark tick don't burn CPU on an unseen scene.
	useTask(() => {
		if (!visible) return;
		if (!villageState || !visualState) return;
		villageState.syncFromEngine();
		villageState.lerpAvatars();
		visualState.tickDeathMarks(villageState.orchestrator.currentTick);
	});

	const allAvatars = $derived(villageState?.avatarList ?? []);
	// Only expose the first N avatars for rendering
	const avatars = $derived(allAvatars.slice(0, mountedAvatarCount));
	const monuments = $derived(villageState?.orchestrator.monuments ?? []);
	const activeJams = $derived(villageState?.orchestrator.activeJams ?? []);
	const droppedProps = $derived(villageState?.orchestrator.droppedProps ?? []);
	const effectCircles = $derived(villageState?.orchestrator.effectCircles ?? []);
	const currentTick = $derived(villageState?.orchestrator.currentTick ?? 0);
	const deathMarks = $derived(visualState?.deathMarks ?? []);
	const schools = $derived(villageState?.orchestrator.schools ?? []);

	function getSchoolColor(entityId: string): string | null {
		for (const school of schools) {
			if (school.memberIds.has(entityId)) return school.color;
		}
		return null;
	}

	// LOD: compute distance from camera to each avatar for detail levels
	const LOD_FULL = 8;      // full: avatar + props + effects
	const LOD_REDUCED = 15;  // reduced: avatar + props, no effects

	function getAvatarLOD(avatarX: number, avatarZ: number): "full" | "reduced" | "minimal" {
		if (!cameraPosition) return "full";
		const dx = (centerX + avatarX) - cameraPosition.x;
		const dz = (centerZ + avatarZ) - cameraPosition.z;
		const dist = Math.sqrt(dx * dx + dz * dz);
		if (dist < LOD_FULL) return "full";
		if (dist < LOD_REDUCED) return "reduced";
		return "minimal";
	}

</script>

{#if manager}
<T.Group visible={visible} position.x={centerX} position.z={centerZ}>
	<!-- Forest environment -->
	<T.Group position.y={forestLift + 0.05}>
		<ForestScene variant="firefly" config={forestConfig} />
	</T.Group>

	<!-- Subtle arena edge ring -->
	<T.Mesh rotation.x={-Math.PI / 2} position.y={0.02}>
		<T.RingGeometry args={[7.8, 8, 64]} />
		<T.MeshBasicMaterial
			color="#e8a87c"
			transparent
			opacity={0.1}
			depthWrite={false}
		/>
	</T.Mesh>

	<!-- Death marks -->
	{#each deathMarks as mark (mark.id)}
		<VillageDeathMark {mark} {currentTick} />
	{/each}

	<!-- Dropped props -->
	{#each droppedProps as drop (drop.artifact.id)}
		<VillageDroppedProp {drop} />
	{/each}

	<!-- Monuments -->
	{#each monuments as monument (monument.sequenceId)}
		<VillageMonument {monument} />
	{/each}

	<!-- Jam circles -->
	{#each activeJams as jam (jam.formedAtTick)}
		<VillageJamCircle {jam} />
	{/each}

	<!-- Effect circles -->
	{#each effectCircles as circle (circle.id)}
		<VillageEffectCircle {circle} />
	{/each}

	<!-- Village avatars: progressively mounted one every 2s to avoid parse freeze -->
	{#each avatars as renderState (renderState.entityId)}
		{@const pos = renderState.instanceState.position}
		{@const lod = getAvatarLOD(pos.x, pos.z)}
		{#if lod !== "minimal"}
			<VillageAvatar
				{renderState}
				schoolColor={getSchoolColor(renderState.entityId)}
				loadFrames={100}
				showLabel={showLabels}
			/>
		{/if}
	{/each}
</T.Group>
{/if}
