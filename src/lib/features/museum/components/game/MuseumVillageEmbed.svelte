<!--
  MuseumVillageEmbed - Pure visual renderer for the persistent Village sim.

  Does NOT own the sim. Reads from MuseumVillageManager which
  persists across room transitions. Walking away and back: village has
  progressed, no GLTF reload, no population reset.
-->
<script lang="ts">
	import { T, useTask, useThrelte } from "@threlte/core";
	import VillageClearing from "#lib/features/village/components/VillageClearing.svelte";
	import { setVillageContext, setVillageVisualContext } from "#lib/features/village/state/village-context.js";
	import {
		getMuseumVillageManager,
		onMuseumVillageMoment,
		setMuseumVillageVisible,
	} from "../../services/museum-village-manager";
	import { getSoundscapeContextOptional } from "../../audio/soundscape-context";
	import { VillageAmbience } from "../../audio/village-ambience";
	import { cuesForMoment } from "../../data/village-sound-cues";
	import { VILLAGE_ROOM_TURN, worldToVillage } from "../../services/museum-village-visitor";
	import { useVillageRoomGlbs } from "../../services/museum-village-room-assets";
	import type { RoomReadiness } from "../../services/museum-reveal-gate";

	interface Props {
		centerX: number;
		centerZ: number;
		/** Museum camera position for LOD calculations */
		cameraPosition?: { x: number; y: number; z: number };
		/** Whether the player is close enough that labels should be shown.
		 *  When false, HTML name labels are hidden to prevent them from
		 *  rendering through museum walls (CSS2D ignores occlusion). */
		showLabels?: boolean;
		/** False when the museum is mounted-but-hidden (keep-alive) - pause the sim and per-frame sync */
		visible?: boolean;
		/** Third person: while the visitor teaches, a village figure plays
		 *  their side of the lesson in place of the player's body. */
		swapVisitorBody?: boolean;
		/** 0-1, how far the swap has crossed over; the scene fades the
		 *  player's own body by 1 - this. */
		visitorBlend?: number;
		/** The player in museum world space while they are in the room, else
		 *  null: the threads from those they taught reach to them. */
		visitorPosition?: { x: number; z: number } | null;
		/** The room's own readiness for the museum's loading curtain: the
		 *  forest, the tree ring, and every villager standing, all placed. */
		onReadiness?: (readiness: RoomReadiness) => void;
	}

	let {
		centerX,
		centerZ,
		cameraPosition,
		showLabels = true,
		visible = true,
		swapVisitorBody = false,
		visitorBlend = $bindable(0),
		visitorPosition = null,
		onReadiness,
	}: Props = $props();

	const visitorInVillage = $derived(
		visible && visitorPosition
			? worldToVillage({ x: centerX, z: centerZ }, visitorPosition.x, visitorPosition.z)
			: null,
	);

	// The clearing passes ForestScene an explicit config. Without one,
	// ForestScene mounts the complete production world at the scene root
	// (scene.add) with global fog, ignoring this group's position and
	// visibility and flooding every wing. With it, the bounded composition
	// renders inside the group, stays in the hall and hides when the visitor
	// leaves.

	// The audience side of the fire (village +z) faces the room's west door,
	// where the visitor comes in. The teach prompt maps through the same turn.
	const ROOM_TURN = VILLAGE_ROOM_TURN;
	const turnCos = Math.cos(ROOM_TURN);
	const turnSin = Math.sin(ROOM_TURN);

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

	const TOTAL_TO_MOUNT = 10;
	if (manager) {
		const totalToMount = TOTAL_TO_MOUNT;

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

	// ── Readiness ──
	// The curtain lifts only on a finished room. The forest's GLBs (already
	// downloading since the museum learned where the visitor is headed), the
	// tree ring planted, and every villager drawn and fully faded in. A failed
	// GLB still finishes the room, as "failed", so the curtain never waits on
	// a download that will not come.
	const roomGlbs = useVillageRoomGlbs();
	let glbFraction = $state(0);
	let glbsSettled = $state<"loading" | "ready" | "failed">("loading");
	roomGlbs.onProgress((loaded, total) => (glbFraction = loaded / total));
	void roomGlbs.done.then((ok) => (glbsSettled = ok ? "ready" : "failed"));
	let treeRingReady = $state(false);
	let shownAvatarIds = $state.raw<ReadonlySet<string>>(new Set());
	function handleAvatarShown(entityId: string): void {
		if (shownAvatarIds.has(entityId)) return;
		shownAvatarIds = new Set([...shownAvatarIds, entityId]);
	}
	// Placed objects draw on the frame after they are added; wait a couple
	// before calling the room finished.
	const SETTLE_FRAMES = 2;
	let settleFrames = 0;
	let reportedReadiness: RoomReadiness | null = null;

	function report(next: RoomReadiness): void {
		if (
			reportedReadiness &&
			reportedReadiness.state === next.state &&
			Math.abs(reportedReadiness.progress - next.progress) < 0.01
		) {
			return;
		}
		reportedReadiness = next;
		onReadiness?.(next);
	}

	function stepReadiness(): void {
		if (!onReadiness || reportedReadiness?.state === "ready" || reportedReadiness?.state === "failed") return;
		if (!manager) {
			report({ state: "failed", progress: 1 });
			return;
		}
		const expected = Math.min(TOTAL_TO_MOUNT, allAvatars.length);
		const drawn = avatars.length;
		const shown = avatars.filter((renderState) => shownAvatarIds.has(renderState.entityId)).length;
		const peopleFraction = expected === 0 ? 1 : Math.min(shown, expected) / expected;
		const progress = glbFraction * 0.7 + (treeRingReady ? 0.05 : 0) + peopleFraction * 0.25;
		const peopleReady = mountedAvatarCount >= expected && shown === drawn;
		const finished = glbsSettled !== "loading" && treeRingReady && peopleReady;
		if (!finished) {
			settleFrames = 0;
			report({ state: "loading", progress: Math.min(progress, 0.99) });
			return;
		}
		if (++settleFrames < SETTLE_FRAMES) return;
		report({ state: glbsSettled === "failed" ? "failed" : "ready", progress: 1 });
	}

	// The fire and the night, heard from the camera. The soundscape player owns
	// the gesture gate, mute and volume; without it (a test page) the room
	// stays silent.
	const soundscape = getSoundscapeContextOptional();
	const ambience = new VillageAmbience(() => soundscape?.proceduralOutput() ?? null);
	const { camera } = useThrelte();
	$effect(() => {
		const stopCues = onMuseumVillageMoment((moment) => {
			for (const cue of cuesForMoment(moment.kind)) ambience.play(cue);
		});
		return () => {
			stopCues();
			ambience.dispose();
		};
	});

	function distanceToFire(): number {
		const fire = villageState?.rules.campfire;
		const at = camera.current.position;
		if (!fire) return Infinity;
		const dx = centerX + fire.x * turnCos + fire.z * turnSin - at.x;
		const dz = centerZ - fire.x * turnSin + fire.z * turnCos - at.z;
		return Math.hypot(dx, dz);
	}

	// The body swap, crossing over like a seated elder (VillageAvatar): the
	// figure mounts as the lesson starts, and the blend only rises once its
	// motion is ready, so the visitor never fades to nothing. When the lesson
	// ends the figure goes with it and the player's body fades back in.
	const SWAP_BLEND_SECONDS = 0.4;
	const visitorRig = $derived(villageState?.visitorRenderState ?? null);
	const swapping = $derived(swapVisitorBody && visible && visitorRig !== null);
	let figureReadyFor = $state.raw<unknown>(null);
	const visitorFigure = $derived(
		swapping
			? { opacity: visitorBlend, onReady: () => (figureReadyFor = visitorRig) }
			: null,
	);

	function stepVisitorBlend(delta: number): void {
		if (!visitorRig) {
			if (visitorBlend !== 0) visitorBlend = Math.max(0, visitorBlend - delta / SWAP_BLEND_SECONDS);
			return;
		}
		const target = swapping && figureReadyFor === visitorRig ? 1 : 0;
		if (visitorBlend === target) return;
		const step = delta / SWAP_BLEND_SECONDS;
		visitorBlend =
			target > visitorBlend ? Math.min(1, visitorBlend + step) : Math.max(0, visitorBlend - step);
	}

	// Per-frame step. Skipped while the museum is hidden (keep-alive) so the
	// sim and avatar lerp don't burn CPU on an unseen scene.
	useTask((delta) => {
		stepReadiness();
		ambience.update(visible, visible ? distanceToFire() : Infinity, delta);
		stepVisitorBlend(delta);
		if (!visible) return;
		if (!villageState || !visualState) return;
		villageState.advance(delta);
		villageState.lerpAvatars();
	});

	const allAvatars = $derived(villageState?.avatarList ?? []);
	// Only expose the first N avatars for rendering
	// Mounted so far, minus anyone too far from the camera to be worth drawing.
	const avatars = $derived(
		allAvatars.slice(0, mountedAvatarCount).filter((renderState) => {
			const pos = renderState.instanceState.position;
			return getAvatarLOD(pos.x, pos.z) !== "minimal";
		}),
	);

	// LOD: compute distance from camera to each avatar for detail levels
	const LOD_FULL = 8;      // full: avatar + props + effects
	const LOD_REDUCED = 15;  // reduced: avatar + props, no effects

	function getAvatarLOD(avatarX: number, avatarZ: number): "full" | "reduced" | "minimal" {
		if (!cameraPosition) return "full";
		const dx = centerX + avatarX * turnCos + avatarZ * turnSin - cameraPosition.x;
		const dz = centerZ - avatarX * turnSin + avatarZ * turnCos - cameraPosition.z;
		const dist = Math.sqrt(dx * dx + dz * dz);
		if (dist < LOD_FULL) return "full";
		if (dist < LOD_REDUCED) return "reduced";
		return "minimal";
	}

</script>

{#if manager}
<T.Group visible={visible} position.x={centerX} position.z={centerZ} rotation.y={ROOM_TURN}>
	<VillageClearing
		{avatars}
		showLabels={showLabels}
		floorLift={0.05}
		{visitorFigure}
		visitorPosition={visitorInVillage}
		onAvatarShown={handleAvatarShown}
		onTreeRingReady={() => (treeRingReady = true)}
	/>
</T.Group>
{/if}
