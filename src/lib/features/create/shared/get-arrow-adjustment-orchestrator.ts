import { browser } from '$app/env';

import { ArrowAdjustmentOrchestrator } from './services/arrow-adjustment-orchestrator';
import { screenSpaceAdjustmentTransformer } from '#lib/shared/pictograph/arrow/positioning/calculation/services/screen-space-adjustment-transformer.js';
import { arrowAdjustmentCalculator } from '#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-adjustment-calculator.js';
import { arrowLocationCalculator } from '#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.js';
import { pictographPreparer } from '#lib/shared/pictograph/shared/services/pictograph-preparer.js';
import { turnsTupleGenerator } from '#lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator.js';

let instance: ArrowAdjustmentOrchestrator | null = null;

export function getArrowAdjustmentOrchestrator(): ArrowAdjustmentOrchestrator {
	if (!browser) throw new Error('getArrowAdjustmentOrchestrator() is browser-only');
	return instance ??= new ArrowAdjustmentOrchestrator(
		screenSpaceAdjustmentTransformer,
		arrowAdjustmentCalculator,
		arrowLocationCalculator,
		pictographPreparer,
		turnsTupleGenerator
	);
}
