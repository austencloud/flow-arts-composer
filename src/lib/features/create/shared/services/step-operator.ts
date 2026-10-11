/**
 * Beat Operations Service Implementation
 *
 * Facade that delegates to specialized handlers for beat manipulation.
 * Manages beat removal, batch editing, individual beat mutations, undo snapshots, and beat selection.
 *
 * Domain: Create module - Beat Manipulation for Sequence Construction
 */

import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type {
  ICreateModuleState,
  BatchEditChanges,
} from "../types/create-module-types";
import type { IMotionQueryHandler } from "#lib/shared/foundation/services/data/data-contracts.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

import { removeStep } from "./step-operations/step-removal-handler";
import { applyBatchChanges } from "./step-operations/batch-edit-handler";
import { updateStepOrientation } from "./step-operations/orientation-handler";
import { updateStepTurns } from "./step-operations/turns-handler";
import {
  updateStepPropType,
  bulkUpdatePropType,
} from "./step-operations/prop-type-handler";
import {
  updateRotationDirection,
  recalculateLetterForBeat,
} from "./step-operations/rotation-direction-handler";
import {
  updateArrowAdjustment,
  persistBeatWithAdjustments,
} from "./step-operations/arrow-adjustment-handler";
import { updateStepDuration } from "./step-operations/duration-handler";
import { toggleBetaSwap } from "./step-operations/beta-swap-handler";
import {
  setPathShape,
  clearPathShape,
  type PathShapeValue,
} from "./step-operations/path-shape-handler";
import type { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

export class StepOperator {
  constructor(
    private motionQueryHandler: IMotionQueryHandler | null
  ) {}

  removeStep(stepIndex: number, createModuleState: ICreateModuleState): void {
    removeStep(stepIndex, createModuleState);
  }

  applyBatchChanges(
    changes: BatchEditChanges,
    createModuleState: ICreateModuleState
  ): void {
    applyBatchChanges(changes, createModuleState);
  }

  updateStepOrientation(
    stepNumber: number,
    color: string,
    orientation: string,
    createModuleState: ICreateModuleState,
    _panelState: unknown
  ): void {
    updateStepOrientation(stepNumber, color, orientation, createModuleState);
  }

  updateStepTurns(
    stepNumber: number,
    color: string,
    turnAmount: number | "fl",
    createModuleState: ICreateModuleState,
    _panelState: unknown
  ): void {
    updateStepTurns(stepNumber, color, turnAmount, createModuleState);
    // A turns edit can convert to/from FLOAT, which changes the letter.
    // Reuse the proven async letter reconcile (derives gridMode fresh).
    void recalculateLetterForBeat(
      stepNumber,
      createModuleState,
      this.motionQueryHandler
    );
  }

  updateStepPropType(
    stepNumber: number,
    color: string,
    propType: PropType,
    createModuleState: ICreateModuleState,
    _panelState: unknown
  ): void {
    updateStepPropType(stepNumber, color, propType, createModuleState);
  }

  bulkUpdatePropType(
    color: string,
    propType: PropType,
    createModuleState: ICreateModuleState
  ): void {
    bulkUpdatePropType(color, propType, createModuleState);
  }

  updateRotationDirection(
    stepNumber: number,
    color: string,
    rotationDirection: string,
    createModuleState: ICreateModuleState,
    _panelState: unknown
  ): void {
    updateRotationDirection(
      stepNumber,
      color,
      rotationDirection,
      createModuleState,
      this.motionQueryHandler,
    );
  }

  updateArrowAdjustment(
    stepNumber: number,
    color: string,
    adjustmentX: number,
    adjustmentY: number,
    createModuleState: ICreateModuleState
  ): void {
    updateArrowAdjustment(
      stepNumber,
      color,
      adjustmentX,
      adjustmentY,
      createModuleState
    );
  }

  persistBeatWithAdjustments(
    stepNumber: number,
    updatedStepData: StepData,
    createModuleState: ICreateModuleState
  ): void {
    persistBeatWithAdjustments(stepNumber, updatedStepData, createModuleState);
  }

  updateStepDuration(
    stepNumber: number,
    newDuration: number,
    createModuleState: ICreateModuleState
  ): void {
    updateStepDuration(stepNumber, newDuration, createModuleState);
  }

  setStepPathShape(
    stepNumber: number,
    color: HandSide,
    shape: PathShapeValue,
    createModuleState: ICreateModuleState
  ): void {
    setPathShape(stepNumber, color, shape, createModuleState);
  }

  clearStepPathShape(
    stepNumber: number,
    color: HandSide,
    createModuleState: ICreateModuleState
  ): void {
    clearPathShape(stepNumber, color, createModuleState);
  }

  toggleBetaSwap(
    stepNumber: number,
    createModuleState: ICreateModuleState
  ): void {
    toggleBetaSwap(stepNumber, createModuleState);
  }
}

import { motionQueryHandler } from "#lib/shared/pictograph/shared/services/motion-query-handler.js";

export const stepOperator = new StepOperator(motionQueryHandler);
