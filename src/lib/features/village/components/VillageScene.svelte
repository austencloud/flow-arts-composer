<!--
  VillageScene - The lab's view of the village: the shared clearing round the
  fire, seen from the audience spot the museum visitor starts on, at the
  same eye height and field of view. The render loop paces the sim (village-driver) and every component
  reads the latest plain snapshot, never a live sim object.
-->
<script lang="ts">
	import { T, useTask } from "@threlte/core";
	import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
	import VillageClearing from "./VillageClearing.svelte";
	import { getVillageContext } from "../state/village-context";
	import { planCampLayout } from "../domain/village-campfire";

	const villageState = getVillageContext();
	const fire = villageState.rules.campfire;
	const audience = planCampLayout(villageState.rules).audience;

	// The museum visitor's eye and lens (museum-camera-flip-controller.ts),
	// looking level at the fire across the opening lesson.
	const EYE_HEIGHT = 1.6;
	const FOV = 65;
	const cameraPosition: [number, number, number] = [audience.x, EYE_HEIGHT, audience.z];

	// Run the ticks due this frame, then ease the rigs toward the new positions
	useTask((delta) => {
		villageState.advance(delta);
		villageState.lerpAvatars();
	});
</script>

<T.PerspectiveCamera makeDefault position={cameraPosition} fov={FOV}>
	<OrbitControls
		enableDamping
		target={[fire.x, EYE_HEIGHT, fire.z]}
		maxPolarAngle={Math.PI / 2 - 0.05}
		minDistance={3}
		maxDistance={25}
	/>
</T.PerspectiveCamera>

<VillageClearing avatars={villageState.avatarList} />
