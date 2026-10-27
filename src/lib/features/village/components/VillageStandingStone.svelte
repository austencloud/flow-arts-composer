<!--
  VillageStandingStone - One standing stone per founding sequence, at the
  clearing's edge. It is heavy dark rock, warm on the side facing the fire,
  and the sequence's colour shows only as thin veins in it, as bright as the
  number of people who still carry it. When nobody does, the veins dim to
  dark over a second or two rather than switching off. A relit stone flares.

  The rock is the Poly Haven coast_rocks_05 (CC0) the Cloudbreak scene
  already ships, a weathered flat ledge set on its edge and narrowed into a
  tall slab, broad face to the fire. The material is made in
  village-stone-material.ts. The stones stand about ten metres from the
  fire, past the reach of the village's firelights, so each carries its own
  low warm light on its fire side, standing in for the fire reaching it.
  Both lights are always present and only change intensity, so a stone going
  dark never makes three.js recompile shaders.
-->
<script lang="ts">
	import { onDestroy } from "svelte";
	import { T, useTask } from "@threlte/core";
	import { useGltf, useMeshopt } from "@threlte/extras";
	import { Box3, Group, Matrix4, Mesh, MeshStandardMaterial, PointLight, Vector3 } from "three";
	import type { VillageStoneSnapshot } from "../engine/village-snapshot";
	import { makeStoneMaterial } from "./village-stone-material";

	interface Props {
		stone: VillageStoneSnapshot;
		relighting?: boolean;
	}

	const { stone, relighting = false }: Props = $props();

	const STONE_HEIGHT = 2.1;
	const STONE_WIDTH = 0.85;
	const STONE_DEPTH = 0.5;
	const SINK = 0.15;
	// How far a stone may turn off facing the fire, so the four are not set
	// square like a row of markers.
	const YAW_WOBBLE = 0.35;
	// Carriers at which the stone reaches full brightness.
	const FULL_GLOW_CARRIERS = 4;
	// Seconds for the glow to cover most of the way to a new level.
	const DIM_SECONDS = 0.5;
	// The emissive only shows along the veins (the shader mask), so it can be
	// strong without lighting the rock.
	const EMISSIVE_AT_FULL = 1.1;
	// A faint tint of the sequence colour on the rock beside a vein.
	const VEIN_LIGHT_AT_FULL = 0.35;
	// The fire reaching the stone: warm, low, on its fire side. About a
	// third of the light a face gets on the far seats (VillageFireLight).
	const FIRE_COLOUR = "#ff8c38";
	const FIRE_LIGHT = 7;
	const FIRE_LIGHT_OUT = 2.2;

	const rock = useGltf("/models/celestial/cloudbreak/rocks/coast-rocks-05.glb", {
		meshoptDecoder: useMeshopt(),
	});

	let model = $state.raw<Group | null>(null);
	const materials: MeshStandardMaterial[] = [];
	let light = $state.raw<PointLight | undefined>(undefined);
	let fireLight = $state.raw<PointLight | undefined>(undefined);
	let level = 0;
	let clock = 0;

	// Broad face toward the fire (rotation.y turns local +z toward it), with
	// a steady per-stone wobble.
	const yaw = $derived(
		Math.atan2(-stone.x, -stone.z) + Math.sin(stone.x * 7.3 + stone.z * 3.1) * YAW_WOBBLE,
	);

	$effect(() => {
		if (!$rock || materials.length > 0) return;
		const upright = new Group();
		const rockModel = $rock.scene.clone(true);
		upright.add(rockModel);
		// Longest side up, middle side across, thinnest side as depth.
		const raw = new Box3().setFromObject(rockModel).getSize(new Vector3()).toArray();
		const [long, middle, thin] = [0, 1, 2].sort((a, b) => raw[b]! - raw[a]!);
		const images = [new Vector3(), new Vector3(), new Vector3()];
		images[middle!]!.set(1, 0, 0);
		images[long!]!.set(0, 1, 0);
		images[thin!]!.set(0, 0, 1);
		const basis = new Matrix4().makeBasis(images[0]!, images[1]!, images[2]!);
		// Keep it a rotation, not a mirror: flip the depth if needed.
		if (basis.determinant() < 0) images[thin!]!.negate();
		rockModel.quaternion.setFromRotationMatrix(
			new Matrix4().makeBasis(images[0]!, images[1]!, images[2]!),
		);
		const size = new Box3().setFromObject(upright).getSize(new Vector3());
		const scale = STONE_HEIGHT / size.y;
		upright.scale.set(
			Math.min(scale, STONE_WIDTH / size.x),
			scale,
			Math.min(scale, STONE_DEPTH / size.z),
		);
		const box = new Box3().setFromObject(upright);
		upright.position.y = -box.min.y - SINK;
		upright.traverse((child) => {
			const mesh = child as Mesh;
			if (!mesh.isMesh) return;
			const material = makeStoneMaterial(
				(mesh.material as MeshStandardMaterial).clone(),
				stone.colour,
			);
			mesh.material = material;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			materials.push(material);
		});
		model = upright;
	});

	onDestroy(() => {
		for (const material of materials) material.dispose();
	});

	const target = $derived(
		relighting
			? 1.6
			: stone.carrierCount === 0
				? 0
				: 0.25 + 0.75 * Math.min(1, stone.carrierCount / FULL_GLOW_CARRIERS),
	);

	useTask((delta) => {
		clock += delta;
		if (fireLight) {
			const flicker = 0.88 + 0.08 * Math.sin(clock * 9 + stone.x) + 0.04 * Math.sin(clock * 23 + stone.z);
			fireLight.intensity = FIRE_LIGHT * flicker;
		}
		const next = level + (target - level) * Math.min(1, delta / DIM_SECONDS);
		if (Math.abs(next - level) < 1e-4 && materials.length > 0 && light) return;
		level = next;
		for (const material of materials) material.emissiveIntensity = level * EMISSIVE_AT_FULL;
		if (light) light.intensity = level * VEIN_LIGHT_AT_FULL;
	});
</script>

<T.Group position.x={stone.x} position.z={stone.z} rotation.y={yaw}>
	{#if model}
		<T is={model} />
	{/if}
	<T.PointLight
		bind:ref={fireLight}
		position.y={STONE_HEIGHT * 0.45}
		position.z={FIRE_LIGHT_OUT}
		color={FIRE_COLOUR}
		intensity={FIRE_LIGHT}
		distance={6}
		decay={2}
	/>
	<T.PointLight
		bind:ref={light}
		position.y={STONE_HEIGHT * 0.6}
		position.z={STONE_DEPTH}
		color={stone.colour}
		intensity={0}
		distance={3}
		decay={2}
	/>
</T.Group>
