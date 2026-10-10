/**
 * Village State - Reactive bridge between headless ECS engine and Svelte/Threlte renderer.
 *
 * The engine writes to plain ECS components. This state factory reads those components
 * each frame and pushes values into AvatarInstanceState wrappers that drive Avatar3D.
 */

import {
	createCharacterInstanceState as createAvatarInstanceState,
	makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
// propInterpolator / sequenceConverter are now module-level functions
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { VillageOrchestrator } from "../engine/village-orchestrator";
import * as sequenceMutator from "../services/sequence-mutator";
import type { VillageConfig } from "../engine/village-config";
import { createDefaultConfig } from "../engine/village-config";
import type {
	VillageEntity,
	PopulationStats,
} from "../domain/village-types";

export type RendererDeps = Record<string, unknown>;

export interface AvatarRenderState {
	entityId: string;
	instanceState: ReturnType<typeof createAvatarInstanceState>;
	entity: VillageEntity;
	// Smooth interpolation targets (set by engine, lerped each frame)
	targetX: number;
	targetZ: number;
	targetFacingAngle: number;
	// Renderer-computed movement state (updated each lerp frame)
	isMoving: boolean;
	moveSpeed: number; // 0-1
}

export interface VillageState {
	readonly orchestrator: VillageOrchestrator;
	readonly avatarList: AvatarRenderState[];
	readonly stats: PopulationStats;
	readonly isRunning: boolean;
	readonly selectedAvatarId: string | null;
	readonly speed: number;

	syncFromEngine(): void;
	lerpAvatars(): void;
	start(): void;
	pause(): void;
	togglePlay(): void;
	setSpeed(speed: number): void;
	selectAvatar(id: string | null): void;
	reset(): void;
	destroy(): void;
}

export function createVillageState(
	deps: RendererDeps,
	seedSequences: SequenceData[],
	configOverrides?: Partial<VillageConfig>,
): VillageState {
	const config = createDefaultConfig(configOverrides);
	const orchestrator = new VillageOrchestrator(config, sequenceMutator);

	// Internal map for O(1) lookups during sync; exposed as $state array for reactivity
	const avatarStateMap = new Map<string, AvatarRenderState>();
	let avatarList = $state<AvatarRenderState[]>([]);
	let stats = $state<PopulationStats>({
		alive: 0,
		averageAge: 0,
		totalKnowledge: 0,
		uniqueSequences: 0,
		extinctionCount: 0,
		currentGeneration: 1,
	});
	let isRunning = $state(false);
	let selectedAvatarId = $state<string | null>(null);
	let speed = $state(1);
	let tickIntervalId: ReturnType<typeof setInterval> | null = null;

	// Initialize population
	orchestrator.initialize();

	// Seed initial sequences into the first N avatars
	const entities = orchestrator.entities;
	for (let i = 0; i < Math.min(seedSequences.length, entities.length); i++) {
		const seq = seedSequences[i];
		const entity = entities[i];
		if (!seq || !entity) continue;
		entity.knowledge.knownSequences.set(seq.id ?? `seed-${i}`, {
			sequenceId: seq.id ?? `seed-${i}`,
			sequenceData: seq,
			proficiency: 1,
			source: "seed",
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});
	}

	// Place avatars near center for Phase 2 (small village, encourage interaction)
	for (const entity of entities) {
		entity.transform.x = (Math.random() - 0.5) * 4;
		entity.transform.z = (Math.random() - 0.5) * 4;
	}

	function syncFromEngine(): void {
		const currentEntities = orchestrator.entities;
		stats = orchestrator.populationStats;

		const seenIds = new Set<string>();
		let mapChanged = false;

		for (const entity of currentEntities) {
			seenIds.add(entity.id);

			let renderState = avatarStateMap.get(entity.id);

			if (!renderState) {
				// New entity - create AvatarInstanceState wrapper
				const instanceState = createAvatarInstanceState(
					{
						id: entity.id,
						positionX: entity.transform.x,
						positionZ: entity.transform.z,
					},
					makeStandaloneDeps(),
				);

				renderState = {
					entityId: entity.id,
					instanceState,
					entity,
					targetX: entity.transform.x,
					targetZ: entity.transform.z,
					targetFacingAngle: entity.transform.facingAngle,
					isMoving: false,
					moveSpeed: 0,
				};
				avatarStateMap.set(entity.id, renderState);
				mapChanged = true;
			}

			// Set interpolation targets from engine (don't snap - lerp happens in lerpAvatars)
			renderState.targetX = entity.transform.x;
			renderState.targetZ = entity.transform.z;
			renderState.targetFacingAngle = entity.transform.facingAngle;

			// Sync sequence playback for teaching/performing states
			syncSequencePlayback(entity, renderState);

			// Update entity reference
			renderState.entity = entity;
		}

		// Remove render states for dead entities
		for (const [id] of avatarStateMap) {
			if (!seenIds.has(id)) {
				avatarStateMap.delete(id);
				mapChanged = true;
			}
		}

		// Rebuild reactive array from map (new reference triggers Svelte re-render)
		if (mapChanged) {
			avatarList = Array.from(avatarStateMap.values());
		}
	}

	/**
	 * Smoothly interpolate avatar positions toward engine targets.
	 * Called every render frame (60fps) for smooth movement between
	 * engine ticks (10fps).
	 */
	function lerpAvatars(): void {
		const POSITION_LERP = 0.15;
		const MOVE_THRESHOLD = 0.02;

		for (const renderState of avatarStateMap.values()) {
			const inst = renderState.instanceState;

			const dx = renderState.targetX - inst.position.x;
			const dz = renderState.targetZ - inst.position.z;
			const dist = Math.sqrt(dx * dx + dz * dz);

			renderState.isMoving = dist > MOVE_THRESHOLD;
			renderState.moveSpeed = renderState.isMoving
				? Math.min(1, dist * 2)
				: 0;

			if (dist > MOVE_THRESHOLD) {
				// Face movement direction. atan2(X, Z) = yaw from +Z axis,
				// matching UnifiedCameraController convention. facingAngle=0 = face +Z.
				// Must use snapFacingAngle (not setFacingAngle) because the village
				// doesn't call updateLocomotion() which lerps toward the target.
				inst.snapFacingAngle(Math.atan2(dx, dz));
			} else {
				// Idle - snap toward engine's facing (e.g. facing partner during teaching)
				const currentAngle = inst.facingAngle;
				let angleDiff =
					renderState.targetFacingAngle - currentAngle;
				while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
				while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
				if (Math.abs(angleDiff) > 0.01) {
					inst.snapFacingAngle(currentAngle + angleDiff * 0.1);
				}
			}

			// Move position AFTER facing is set
			inst.position.x += dx * POSITION_LERP;
			inst.position.z += dz * POSITION_LERP;
		}
	}

	function syncSequencePlayback(
		entity: VillageEntity,
		renderState: AvatarRenderState,
	): void {
		const { instanceState } = renderState;
		const state = entity.social.state;

		if (
			state === "teaching" ||
			state === "learning" ||
			state === "performing" ||
			state === "practicing"
		) {
			// Find the sequence being played
			const seqId =
				entity.social.sequenceBeingTransferred ??
				getRandomKnownSequenceId(entity);

			if (seqId) {
				const learned = entity.knowledge.knownSequences.get(seqId);
				const seqData = learned?.sequenceData as SequenceData | null;

				if (seqData && !instanceState.isPlaying) {
					instanceState.loadSequence(seqData);
					instanceState.speed =
						state === "teaching" || state === "learning"
							? 0.5
							: 1;
					instanceState.loop = true;
					instanceState.play();
				}
			}
		} else {
			// Not performing - stop playback
			if (instanceState.isPlaying) {
				instanceState.pause();
				instanceState.reset();
			}
		}
	}

	function getRandomKnownSequenceId(
		entity: VillageEntity,
	): string | null {
		const ids = Array.from(entity.knowledge.knownSequences.keys());
		if (ids.length === 0) return null;
		return ids[Math.floor(Math.random() * ids.length)] ?? null;
	}

	function startTickLoop(): void {
		stopTickLoop();
		const interval = Math.round(1000 / (config.ticksPerSecond * speed));
		tickIntervalId = setInterval(() => {
			orchestrator.tick();
		}, interval);
		isRunning = true;
	}

	function stopTickLoop(): void {
		if (tickIntervalId !== null) {
			clearInterval(tickIntervalId);
			tickIntervalId = null;
		}
		isRunning = false;
	}

	return {
		get orchestrator() {
			return orchestrator;
		},
		get avatarList() {
			return avatarList;
		},
		get stats() {
			return stats;
		},
		get isRunning() {
			return isRunning;
		},
		get selectedAvatarId() {
			return selectedAvatarId;
		},
		get speed() {
			return speed;
		},

		syncFromEngine,
		lerpAvatars,

		start() {
			startTickLoop();
		},
		pause() {
			stopTickLoop();
		},
		togglePlay() {
			if (isRunning) {
				stopTickLoop();
			} else {
				startTickLoop();
			}
		},
		setSpeed(newSpeed: number) {
			speed = newSpeed;
			if (isRunning) {
				startTickLoop(); // restart with new interval
			}
		},
		selectAvatar(id: string | null) {
			selectedAvatarId = id;
		},
		reset() {
			stopTickLoop();
			avatarStateMap.clear();
			avatarList = [];
			orchestrator.reset();
			// Re-seed
			const newEntities = orchestrator.entities;
			for (
				let i = 0;
				i < Math.min(seedSequences.length, newEntities.length);
				i++
			) {
				const seq = seedSequences[i];
				const ent = newEntities[i];
				if (!seq || !ent) continue;
				ent.knowledge.knownSequences.set(
					seq.id ?? `seed-${i}`,
					{
						sequenceId: seq.id ?? `seed-${i}`,
						sequenceData: seq,
						proficiency: 1,
						source: "seed",
						learnedAt: 0,
						learnedFrom: null,
						lineage: [],
						lastUsedTick: 0,
						style: { amplitudeScale: 1.0, tempoOffset: 0 },
					},
				);
			}
		},
		destroy() {
			stopTickLoop();
			orchestrator.destroy();
			avatarStateMap.clear();
			avatarList = [];
		},
	};
}

export type { VillageState as VillageStateType };
