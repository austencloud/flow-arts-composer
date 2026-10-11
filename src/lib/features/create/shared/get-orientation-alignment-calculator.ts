import {
	calculateOrientationAlignment,
	calculateResultingLength,
} from './services/orientation-alignment-calculator';
import type { OrientationAlignment } from './services/orientation-alignment-calculator';
import type { SequenceData } from '#lib/shared/foundation/domain/models/sequence-data.js';
import type { PictographData } from '#lib/shared/pictograph/shared/domain/models/pictograph-data.js';

type OrientationAlignmentCalculator = {
	calculateOrientationAlignment: (
		sequence: SequenceData,
		bridgePictograph: PictographData
	) => OrientationAlignment | null;
	calculateResultingLength: (
		currentLength: number,
		rotationRelation: 'exact' | 'half' | 'quarter' | null,
		repetitionsNeeded?: 1 | 2 | 4
	) => number;
};

let instance: OrientationAlignmentCalculator | null = null;

export function getOrientationAlignmentCalculator(): OrientationAlignmentCalculator {
	return instance ??= {
		calculateOrientationAlignment,
		calculateResultingLength,
	};
}
