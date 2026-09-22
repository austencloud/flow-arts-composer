import { browser } from "$app/environment";

import { SequenceExtender } from "./services/sequence-extender";
import { getReversalDetector } from "./get-reversal-detector";
import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
import { getStepConverter } from "$lib/features/create/generate/shared/get-step-converter";
import { getLOOPValidator } from "./get-loop-validator";
import { getSequenceAnalyzer } from "./get-sequence-analyzer";
import { getBridgeFinder } from "./get-bridge-finder";
import { motionQueryHandler } from "$lib/shared/pictograph/shared/services/motion-query-handler";

let instance: SequenceExtender | null = null;

export function getSequenceExtender(): SequenceExtender {
  if (!browser) throw new Error("getSequenceExtender() is browser-only");
  return (instance ??= new SequenceExtender(
    getReversalDetector(),
    letterQueryHandler,
    getStepConverter(),
    getLOOPValidator(),
    getSequenceAnalyzer(),
    getBridgeFinder(),
    motionQueryHandler
  ));
}
