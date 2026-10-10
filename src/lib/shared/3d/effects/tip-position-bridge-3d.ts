import { Vector3, Quaternion, Euler } from "three";
import { TrackingMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type { PropTipPositions3D, TipPositionData3D } from "./types";
import {
	propTipAnchorSignature3D,
	resolvePropTipAnchors3D,
} from "./prop-tip-geometry-3d";
import type { PropBuild } from "@austencloud/scene-3d/worker";

export type TrailSourceId3D = "left-end" | "right-end" | "hand";

export interface TrailSource3D {
	sourceId: TrailSourceId3D;
	/** Logical end: 0 = LEFT_END, 1 = RIGHT_END. */
	effectTipIndex: 0 | 1;
	/** The per-tip effect key this source resolves, as in the 2D trail overlay. */
	effectKeyIndex: number;
	position: { x: number; y: number; z: number };
}

/**
 * Select the physical source positions used by 3D trails.
 *
 * The logical left/right end ordering matches the canonical 2D trail pipeline:
 * tip 0 is the left end, tip 1 is the right end, and HAND uses one source at
 * the prop center on the right-end slot and key 1, as the 2D overlay resolves
 * its prop-centre source.
 *
 * Single-ended props publish only the right slot. As in the 2D trail config,
 * LEFT, RIGHT and BOTH all follow that one physical tip rather than inventing
 * a second path behind the hand.
 */
export function resolveTrailSources3D(
	trackingMode: TrackingMode,
	tips: readonly TipPositionData3D[],
	propCenter: { x: number; y: number; z: number }
): TrailSource3D[] {
	const leftTip = tips.find((tip) => tip.tipIndex === 0);
	const rightTip = tips.find((tip) => tip.tipIndex === 1);

	if (!leftTip && trackingMode !== TrackingMode.HAND) {
		return rightTip
			? [
					{
						sourceId: "right-end",
						effectTipIndex: 1,
						effectKeyIndex: rightTip.effectKeyIndex,
						position: rightTip.position,
					},
				]
			: [];
	}

	switch (trackingMode) {
		case TrackingMode.LEFT_END:
			return leftTip
				? [
						{
							sourceId: "left-end",
							effectTipIndex: 0,
							effectKeyIndex: leftTip.effectKeyIndex,
							position: leftTip.position,
						},
					]
				: [];
		case TrackingMode.RIGHT_END:
			return rightTip
				? [
						{
							sourceId: "right-end",
							effectTipIndex: 1,
							effectKeyIndex: rightTip.effectKeyIndex,
							position: rightTip.position,
						},
					]
				: [];
		case TrackingMode.BOTH_ENDS:
			return [
				...(leftTip
					? [
							{
								sourceId: "left-end" as const,
								effectTipIndex: 0 as const,
								effectKeyIndex: leftTip.effectKeyIndex,
								position: leftTip.position,
							},
						]
					: []),
				...(rightTip
					? [
							{
								sourceId: "right-end" as const,
								effectTipIndex: 1 as const,
								effectKeyIndex: rightTip.effectKeyIndex,
								position: rightTip.position,
							},
						]
					: []),
			];
		case TrackingMode.HAND:
			return [
				{
					sourceId: "hand",
					effectTipIndex: 1,
					effectKeyIndex: 1,
					position: { ...propCenter },
				},
			];
		default:
			return [];
	}
}

/**
 * Minimal prop state needed to compute tip positions.
 */
export interface PropState3DLike {
	worldPosition: { x: number; y: number; z: number };
	worldRotation: { x: number; y: number; z: number; w: number };
	staffRotationAngle: number;
	plane: string;
	centerPathAngle: number;
}

/**
 * Places a prop in the EffectsGroup coordinate frame used by PerformerRig.
 *
 * The live mesh sits below a hand anchor, so reading worldPosition alone
 * pulls an effect back toward the avatar. Every prop-center effect must add
 * the same hand offset before it is rendered beside the live prop.
 */
export function resolveRigLocalPropCenter3D(
	propPosition: { x: number; y: number; z: number },
	handAnchor: { x: number; z: number }
): { x: number; y: number; z: number } {
	return {
		x: handAnchor.x + propPosition.x,
		y: propPosition.y,
		z: handAnchor.z + propPosition.z,
	};
}

interface TipHistory {
	prevPosition: Vector3;
	prevVelocity: Vector3;
	hasData: boolean;
}

/**
 * Converts 3D prop animation state into per-tip rig-local positions with
 * velocity and jerk computed via finite differencing.
 *
 * The staff axis math replicates Staff3D.svelte: a horizontal quaternion
 * (Euler Z = PI/2) is applied, then the prop's world rotation, to get the
 * axis along the prop. Tip positions are then placed along that axis at the
 * offsets `resolvePropTipAnchors3D` reports for the prop type — two for the
 * staff family, one for every single-ended prop.
 *
 * Operates in rig-local space: the caller provides a rig-local center
 * position (handAnchorPos + propState.worldPosition). No scene graph refs
 * are read. The rig's T.Group rotation.y handles facing, so no facing
 * quaternion is needed here.
 */
export class TipPositionBridge3D {
	private history = new Map<string, TipHistory>();
	private anchorSignatures = new Map<number, string>();
	private readonly tempQuat = new Quaternion();

	update(
		propIndex: number,
		propState: PropState3DLike,
		rigLocalCenter: { x: number; y: number; z: number },
		staffHalfLength: number,
		deltaTime: number,
		propType: string | undefined,
		build: PropBuild
	): PropTipPositions3D {
		const center = new Vector3(
			rigLocalCenter.x,
			rigLocalCenter.y,
			rigLocalCenter.z
		);

		// Staff axis in rig-local space: worldRotation × horizontalQuat.
		// No facing rotation needed - the rig's T.Group rotation.y handles that.
		const rotation = new Quaternion(
			propState.worldRotation.x,
			propState.worldRotation.y,
			propState.worldRotation.z,
			propState.worldRotation.w
		);
		const horizontalQuat = this.tempQuat.setFromEuler(
			new Euler(0, 0, Math.PI / 2)
		);
		const finalQuat = rotation.multiply(horizontalQuat);

		// Each anchor carries its logical end and the 2D tip its effects key.
		// The prop mesh's positive axis points toward the thumb end, which is
		// the end a single-ended prop keeps.
		const anchors = resolvePropTipAnchors3D(propType, staffHalfLength, build);

		// Swapping the prop mid-playback moves a tip discontinuously. Dropping
		// this prop's history turns that into one zero-velocity frame instead of
		// a jerk spike that fires charcoal and fire bursts out of nowhere.
		const signature = propTipAnchorSignature3D(anchors);
		if (this.anchorSignatures.get(propIndex) !== signature) {
			this.anchorSignatures.set(propIndex, signature);
			for (const key of this.history.keys()) {
				if (key.startsWith(`${propIndex}-`)) this.history.delete(key);
			}
		}

		const tips: TipPositionData3D[] = anchors.map((anchor, emitterOrdinal) =>
			this.computeTipData(
				propIndex,
				anchor.effectTipIndex,
				anchor.effectKeyIndex,
				center
					.clone()
					.add(
						new Vector3(anchor.offset.x, anchor.offset.y, anchor.offset.z).applyQuaternion(
							finalQuat
						)
					),
				emitterOrdinal,
				deltaTime
			)
		);

		return { tips, propIndex };
	}

	reset(): void {
		this.history.clear();
		this.anchorSignatures.clear();
	}

	private computeTipData(
		propIndex: number,
		tipIndex: 0 | 1,
		effectKeyIndex: number,
		position: Vector3,
		emitterOrdinal: number,
		deltaTime: number
	): TipPositionData3D {
		const key = `${propIndex}-${tipIndex}-${emitterOrdinal}`;
		let hist = this.history.get(key);

		if (!hist) {
			hist = {
				prevPosition: position.clone(),
				prevVelocity: new Vector3(),
				hasData: false,
			};
			this.history.set(key, hist);

			return {
				tipIndex,
				effectKeyIndex,
				position: { x: position.x, y: position.y, z: position.z },
				velocity: { x: 0, y: 0, z: 0 },
				jerk: { x: 0, y: 0, z: 0 },
				speed: 0,
			};
		}

		const invDt = deltaTime > 0 ? 1 / deltaTime : 60;
		const velocity = position
			.clone()
			.sub(hist.prevPosition)
			.multiplyScalar(invDt);
		const jerk = velocity.clone().sub(hist.prevVelocity).multiplyScalar(invDt);
		const speed = velocity.length();

		hist.prevPosition.copy(position);
		hist.prevVelocity.copy(velocity);
		hist.hasData = true;

		return {
			tipIndex,
			effectKeyIndex,
			position: { x: position.x, y: position.y, z: position.z },
			velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
			jerk: { x: jerk.x, y: jerk.y, z: jerk.z },
			speed,
		};
	}
}
