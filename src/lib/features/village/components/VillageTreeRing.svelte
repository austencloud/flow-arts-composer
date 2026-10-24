<!--
  VillageTreeRing - The edge of the village's room: a ring of forest trees
  round the clearing (village-tree-ring.ts) and a darkening on the ground past
  the fire's reach, so turning from the fire shows trees and darkness, never
  the ground running on to the sky.

  Each tree family is one instanced draw. onReady fires once every family is
  planted (or failed to load), and the museum holds its loading view for it.
-->
<script lang="ts">
	import { T } from "@threlte/core";
	import { untrack } from "svelte";
	import { useDraco, useGltf, useMeshopt } from "@threlte/extras";
	import {
		BufferAttribute,
		DoubleSide,
		Group,
		MeshBasicMaterial,
		RingGeometry,
	} from "three";
	import {
		createForestRuntimeTreeInstances,
		disposeForestRuntimeEcology,
	} from "#lib/shared/3d/environments/scenes/forest/forest-runtime-ecology.js";
	import {
		groundFalloffAlpha,
		planVillageTreeRing,
		VILLAGE_GROUND_FALLOFF,
		VILLAGE_TREE_URLS,
		type VillageTreeFamily,
	} from "./village-tree-ring";

	interface Props {
		centre: { x: number; z: number };
		// Where the forest floor sits in village space (VillageClearing floorLift).
		lift?: number;
		onReady?: () => void;
	}

	const { centre, lift = 0, onReady }: Props = $props();

	const loaderOptions = { dracoLoader: useDraco("/draco/"), meshoptDecoder: useMeshopt() };
	// The fire never moves, so the ring is planted once.
	const plan = untrack(() => planVillageTreeRing(centre));
	const families = [...plan.keys()];
	const gltfs = families.map((family) => [family, useGltf(VILLAGE_TREE_URLS[family], loaderOptions)] as const);

	const ring = new Group();
	ring.name = "Village_TreeRing";
	const planted = new Set<VillageTreeFamily>();
	const settled = new Set<VillageTreeFamily>();

	function settle(family: VillageTreeFamily): void {
		if (settled.has(family)) return;
		settled.add(family);
		if (settled.size === families.length) onReady?.();
	}

	$effect(() => {
		const unsubscribers = gltfs.flatMap(([family, gltf]) => [
			gltf.subscribe((value) => {
				if (!value || planted.has(family)) return;
				planted.add(family);
				ring.add(createForestRuntimeTreeInstances(value.scene, plan.get(family) ?? [], `village-${family}`));
				settle(family);
			}),
			gltf.error.subscribe((error) => {
				if (error) settle(family);
			}),
		]);
		return () => {
			for (const unsubscribe of unsubscribers) unsubscribe();
		};
	});

	$effect(() => () => {
		for (const child of [...ring.children]) disposeForestRuntimeEcology(child);
	});

	// A flat annulus, black with its alpha rising past the fire's reach. The
	// clearing is level to within 0.2 m, so it lies just above the ground.
	const { innerRadius, outerRadius } = VILLAGE_GROUND_FALLOFF;
	const falloffGeometry = new RingGeometry(innerRadius, outerRadius, 96, 14);
	falloffGeometry.rotateX(-Math.PI / 2);
	{
		const position = falloffGeometry.getAttribute("position");
		const colours = new Float32Array(position.count * 4);
		for (let i = 0; i < position.count; i++) {
			colours[i * 4 + 3] = groundFalloffAlpha(Math.hypot(position.getX(i), position.getZ(i)));
		}
		falloffGeometry.setAttribute("color", new BufferAttribute(colours, 4));
	}
	const falloffMaterial = new MeshBasicMaterial({
		color: "#000000",
		vertexColors: true,
		transparent: true,
		depthWrite: false,
		side: DoubleSide,
		polygonOffset: true,
		polygonOffsetFactor: -2,
		polygonOffsetUnits: -2,
	});

	$effect(() => () => {
		falloffGeometry.dispose();
		falloffMaterial.dispose();
	});
</script>

<T is={ring} position.y={lift} />

<T.Mesh
	geometry={falloffGeometry}
	material={falloffMaterial}
	position.x={centre.x}
	position.y={lift + 0.06}
	position.z={centre.z}
	renderOrder={-1}
	name="Village_GroundFalloff"
/>
