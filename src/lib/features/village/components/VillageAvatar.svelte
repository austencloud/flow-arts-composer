<!--
  VillageAvatar - Renders one village entity via PerformerRig with props, effects + name label.

  Hides avatar for a brief loading period, then fades in.
  PerformerRig manages Avatar3D + Prop3D + EffectOrchestrator3D as a
  coordinated hierarchy. Effect rendering is driven by the entity's effect affinity.
-->
<script lang="ts">
	import { T, useTask } from "@threlte/core";
	import { untrack } from "svelte";
	import { HTML } from "@threlte/extras";
	import { PerformerRig } from "@austencloud/scene-3d";
	import { userProportionsState } from "@austencloud/scene-3d";
	import { PlaneMode } from "@austencloud/scene-3d";
	import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
	import type { TipEffectMap, EffectType } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
	import type { AvatarRenderState } from "../state/village-state.svelte";
	import type { EffectAffinity } from "../domain/village-types";
	import type { AvatarId } from "@austencloud/scene-3d";
	import { toScenePropType } from "#lib/shared/3d/domain/scene-prop-type.js";

	interface Props {
		renderState: AvatarRenderState;
		isSelected?: boolean;
		schoolColor?: string | null;
		/** Frames to wait for GLTF load before showing avatar. Default 180. */
		loadFrames?: number;
		/** Whether to show the floating name label. Default true. Set to false
		 *  when the avatar is far from the camera (e.g. in museum context where
		 *  CSS2D labels would render through walls). */
		showLabel?: boolean;
	}

	const { renderState, isSelected = false, schoolColor = null, loadFrames = 180, showLabel = true }: Props = $props();

	const STAGE_LIFT = $derived(-userProportionsState.groundY);
	const avatarModelId = $derived(
		renderState.entity.identity.avatarModelId as AvatarId,
	);
	const avatarName = $derived(renderState.entity.identity.name);
	const lifecyclePhase = $derived(renderState.entity.lifecycle.phase);
	const socialState = $derived(renderState.entity.social.state);
	const knowledgeGlow = $derived(renderState.entity.lifecycle.knowledgeGlow);

	// Visual aging: height scale varies by lifecycle phase
	const heightScale = $derived(
		lifecyclePhase === "youth" ? 0.7 :
		lifecyclePhase === "elder" ? 0.95 :
		1.0
	);

	// Death fade: passing entities lerp opacity to 0
	const isPassing = $derived(socialState === "passing");
	let deathOpacity = $state(1);
	const DEATH_FADE_RATE = 0.02; // per frame, ~50 frames to fully fade

	let avatarPosition = $state({ x: 0, y: 0, z: 0 });
	let facingAngle = $state(0);
	let isMoving = $state(false);
	let moveSpeed = $state(0);
	let prevX = 0;
	let prevZ = 0;

	// Hide during initial GLTF load to prevent procedural fallback flash.
	// PerformerRig showAvatar=false prevents rendering while GLTF fetches.
	// After enough frames for the model to load, switch to visible.
	let frameCount = 0;
	let showAvatar = $state(false);
	let labelOpacity = $state(0);
	const LOAD_FRAMES = untrack(() => loadFrames);

	useTask(() => {
		const inst = renderState.instanceState;
		const posX = inst.position.x;
		const posZ = inst.position.z;

		// Movement detection for walk animation
		const dx = posX - prevX;
		const dz = posZ - prevZ;
		const frameDist = Math.sqrt(dx * dx + dz * dz);
		isMoving = frameDist > 0.001;
		moveSpeed = isMoving ? frameDist * 60 : 0;
		prevX = posX;
		prevZ = posZ;

		avatarPosition = { x: posX, y: STAGE_LIFT, z: posZ };
		facingAngle = inst.facingAngle;

		// Youth wobble: slight facing angle oscillation for youthful energy
		if (renderState.entity.lifecycle.phase === "youth") {
			const wobbleAngle = Math.sin(performance.now() * 0.001 * Math.PI) * 0.05; // ~2.8 degrees
			facingAngle += wobbleAngle;
		}

		// Count frames until we reveal the avatar (GLTF should be loaded by then)
		if (!showAvatar) {
			frameCount++;
			if (frameCount >= LOAD_FRAMES) {
				showAvatar = true;
			}
		} else if (labelOpacity < 1) {
			labelOpacity = Math.min(1, labelOpacity + 0.04);
		}

		// Death fade
		if (isPassing) {
			deathOpacity = Math.max(0, deathOpacity - DEATH_FADE_RATE);
		}
	});

	const labelColor = $derived(
		socialState === "teaching" ? "#4ade80" :
		socialState === "learning" ? "#60a5fa" :
		socialState === "performing" ? "#e8a87c" :
		socialState === "jamming" ? "#e8a87c" :
		socialState === "seeking" ? "#fbbf24" :
		socialState === "watching" ? "#fbbf24" :
		socialState === "mourning" ? "#ef4444" :
		socialState === "passing" ? "#ef4444" :
		"#ffffff"
	);

	// Phase indicator appended to name
	const phaseIndicator = $derived(
		lifecyclePhase === "youth" ? " (y)" :
		lifecyclePhase === "elder" ? " (e)" :
		""
	);

	// Youth names tinted sage green
	const nameTint = $derived(
		lifecyclePhase === "youth" ? "#86efac" : labelColor
	);

	const propIndicator = $derived(
		renderState.entity.prop.heldProp
			? ` [${renderState.entity.prop.heldProp.propType.charAt(0).toUpperCase()}]`
			: " [-]"
	);

	// Effect rendering: only show during active performance states
	const isActiveForEffects = $derived(
		socialState === "performing" ||
		socialState === "practicing" ||
		socialState === "jamming"
	);

	// Map entity's effect affinity to TipEffectMap
	const affinityToEffect: Record<EffectAffinity, EffectType> = {
		fire: "fire",
		led: "led",
		charcoal: "charcoal",
		trails: "trails",
		pure: "none",
	};

	const tipEffectMap = $derived<TipEffectMap>(
		isActiveForEffects
			? { "*": { effect: affinityToEffect[renderState.entity.effect.affinity] ?? "none" } }
			: {}
	);

	// Map entity's held prop to PropType enum
	const propTypeMap: Record<string, PropType> = {
		staff: PropType.STAFF,
		fan: PropType.FAN,
		club: PropType.CLUB,
		poi: PropType.POI,
		torch: PropType.TORCH,
	};

	const propType = $derived(
		renderState.entity.prop.heldProp
			? (propTypeMap[renderState.entity.prop.heldProp.propType] ?? PropType.STAFF)
			: PropType.STAFF
	);
</script>

<!-- Height scaling group. PerformerRig handles Y positioning internally. -->
<T.Group scale.y={heightScale}>
	<PerformerRig
		position={{ x: avatarPosition.x, z: avatarPosition.z }}
		{facingAngle}
		planeMode={PlaneMode.WALL}
		avatarState={renderState.instanceState}
		avatarId={avatarModelId}
		groundOffset={STAGE_LIFT}
		showAvatar={showAvatar && deathOpacity > 0.01}
		showGrid={false}
		showProps={true}
		showEffects={isActiveForEffects}
		enableLocomotion={true}
		{isMoving}
		{moveSpeed}
		{tipEffectMap}
		leftPropType={toScenePropType(propType)}
		rightPropType={toScenePropType(propType)}
	/>

	<!-- Elder knowledge glow: soft emissive sphere -->
	{#if lifecyclePhase === "elder" && knowledgeGlow > 0 && showAvatar}
		<T.Mesh
			position.x={avatarPosition.x}
			position.y={avatarPosition.y + 0.3}
			position.z={avatarPosition.z}
		>
			<T.IcosahedronGeometry args={[0.4, 1]} />
			<T.MeshBasicMaterial
				color="#f8fafc"
				transparent
				opacity={knowledgeGlow * 0.3 * deathOpacity}
				depthWrite={false}
			/>
		</T.Mesh>
	{/if}

	<!-- Name label floating above head -->
	{#if showLabel && showAvatar && deathOpacity > 0.1}
		<T.Group
			position.x={avatarPosition.x}
			position.y={avatarPosition.y + 0.6}
			position.z={avatarPosition.z}
		>
			<HTML center sprite>
				<div
					class="name-label"
					style="color: {nameTint}; opacity: {labelOpacity * deathOpacity}{schoolColor ? `; border-bottom: 2px solid ${schoolColor}; padding-bottom: 1px` : ''}"
				>
					{avatarName}
					<span class="phase-indicator">{phaseIndicator}</span>
					{#if lifecyclePhase === "elder"}
						<span class="state-indicator">🔥</span>
					{/if}
					<span class="prop-indicator">{propIndicator}</span>
				</div>
			</HTML>
		</T.Group>
	{/if}
</T.Group>

<style>
	.name-label {
		font-size: var(--font-size-compact, 12px);
		font-family: monospace;
		text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
		white-space: nowrap;
		pointer-events: none;
		user-select: none;
	}

	.phase-indicator {
		opacity: 0.6;
	}

	.state-indicator {
		margin-left: 2px;
	}

	.prop-indicator {
		opacity: 0.5;
		font-size: var(--font-size-compact, 12px);
	}
</style>
