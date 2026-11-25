import { browser } from "$app/env";
import { getOptionLoader } from "#lib/features/create/construct/option-picker/get-option-loader.js";
import { getLOOPValidator } from "#lib/features/create/shared/get-loop-validator.js";
import { getSequenceExtender } from "#lib/features/create/shared/get-sequence-extender.js";
import { startPlacementManager } from "#lib/shared/create/services/start-placement-manager.js";
import { LoopStepWorkshop } from "./services/loop-step-workshop";

let instance: LoopStepWorkshop | null = null;

export function getLoopStepWorkshop(): LoopStepWorkshop {
  if (!browser) throw new Error("getLoopStepWorkshop() is browser-only");
  return (instance ??= new LoopStepWorkshop(
    startPlacementManager,
    getOptionLoader(),
    getLOOPValidator(),
    getSequenceExtender()
  ));
}
