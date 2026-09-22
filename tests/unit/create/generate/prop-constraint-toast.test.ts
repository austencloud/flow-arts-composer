import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConstraintReport } from "@tka/sequence-engine/generation";
import { ConstraintType } from "@tka/sequence-engine/generation";

// Same module stubs as spell-truncation-toast.test.ts: the actions module
// pulls in the orchestrator, the spell parser and the prop-unlock manager at
// load time, and this test only drives the constraint-report path.
const { generateSequenceMock, parseWordMock, recordCreationMock } = vi.hoisted(
  () => ({
    generateSequenceMock: vi.fn(),
    parseWordMock: vi.fn(),
    recordCreationMock: vi.fn().mockResolvedValue(undefined),
  })
);
vi.mock("$lib/shared/create/services/generation-orchestrator", () => ({
  generationOrchestrator: { generateSequence: generateSequenceMock },
}));
vi.mock(
  "$lib/features/create/spell/get-variation-exploration-orchestrator",
  () => ({
    getVariationExplorationOrchestrator: () => ({ parseWord: parseWordMock }),
  })
);
vi.mock("$lib/shared/gamification/get-prop-unlock-manager", () => ({
  getPropUnlockManager: () => ({ recordCreation: recordCreationMock }),
}));
const { mockAuthState } = vi.hoisted(() => ({
  mockAuthState: { isAuthenticated: true, isAnonymous: false, role: "user" },
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: mockAuthState,
}));

import {
  createGenerationActionsState,
  PROP_CONSTRAINT_SHORTFALL_TEXT,
} from "$lib/features/create/generate/state/generate-actions.svelte";
import { createSpellModeState } from "$lib/features/create/generate/state/spell-mode-state.svelte";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import {
  GenerationMode,
  DifficultyLevel,
  type GenerationOptions,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { UIGenerationConfig } from "$lib/shared/create/utils/config-mapper";

function makeConfig(): UIGenerationConfig {
  return {
    mode: "spell",
    loopEnabled: false,
    length: 8,
    level: 2,
    turnIntensity: 1.0,
    gridMode: GridMode.DIAMOND,
    propContinuity: "continuous",
    period: "halved",
    loopType: "",
    constraintPreset: "smooth",
    handPathMode: "mixed",
    motionTypeFilter: null,
    durationTemplateId: null,
    spellTargetLength: null,
    handRelationship: "free",
    propRelationship: "free",
    matchHandTurns: false,
  } as UIGenerationConfig;
}

function report(propScore: number | null): ConstraintReport {
  return {
    score: propScore ?? 1,
    satisfied: propScore === null || propScore === 1,
    details:
      propScore === null
        ? []
        : [
            {
              constraint: ConstraintType.PROP_RELATIONSHIP,
              score: propScore,
              description: "prop timing",
              mode: "soft",
            },
          ],
  } as unknown as ConstraintReport;
}

function generatedWith(constraintReport: ConstraintReport) {
  generateSequenceMock.mockImplementation(
    async (
      _options: GenerationOptions,
      hooks?: { onConstraintReport?: (r: ConstraintReport) => void }
    ) => {
      hooks?.onConstraintReport?.(constraintReport);
      return { id: "generated", word: "AB", steps: [], metadata: {} };
    }
  );
}

const freeform: GenerationOptions = {
  mode: GenerationMode.FREEFORM,
  length: 4,
  gridMode: GridMode.DIAMOND,
  propType: PropType.FAN,
  difficulty: DifficultyLevel.BEGINNER,
};

describe("prop constraint shortfall toast", () => {
  beforeEach(() => {
    generateSequenceMock.mockReset();
    parseWordMock.mockReset();
    recordCreationMock.mockClear();
  });

  it("tells the user when the prop timing was not fully met", async () => {
    generatedWith(report(0.5));
    const toastInfoSpy = vi.spyOn(toast, "info");
    const actions = createGenerationActionsState();
    await actions.onGenerateClicked(freeform);
    expect(toastInfoSpy).toHaveBeenCalledWith(
      PROP_CONSTRAINT_SHORTFALL_TEXT,
      6000
    );
    toastInfoSpy.mockRestore();
  });

  it("stays quiet when the prop timing held or was not requested", async () => {
    const toastInfoSpy = vi.spyOn(toast, "info");
    const actions = createGenerationActionsState();
    generatedWith(report(1));
    await actions.onGenerateClicked(freeform);
    generatedWith(report(null));
    await actions.onGenerateClicked(freeform);
    expect(toastInfoSpy).not.toHaveBeenCalled();
    toastInfoSpy.mockRestore();
  });

  it("also reports from the spell path", async () => {
    parseWordMock.mockResolvedValue({
      success: true,
      expandedLetters: ["A", "B"],
      letterSources: [],
    });
    generatedWith(report(0.25));
    const toastInfoSpy = vi.spyOn(toast, "info");
    const spellState = createSpellModeState();
    spellState.setInputWord("AB");
    const actions = createGenerationActionsState(
      undefined,
      undefined,
      () => makeConfig(),
      () => spellState
    );
    await actions.onSpellGenerate();
    expect(toastInfoSpy).toHaveBeenCalledWith(
      PROP_CONSTRAINT_SHORTFALL_TEXT,
      6000
    );
    toastInfoSpy.mockRestore();
  });
});
