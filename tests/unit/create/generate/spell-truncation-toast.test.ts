import { describe, it, expect, vi, beforeEach } from "vitest";

// onSpellGenerate() pulls in a wide service surface at module load time
// (generationOrchestrator, the spell word-parse orchestrator, the prop-unlock
// manager). Stub each to a minimal shape so the test drives only the
// truncation branch under test - see docs/superpowers/specs/active/
// 2026-07-18-onboarding-silent-work-loss.md, finding spell-truncation-silent.
const { generateSequenceMock, parseWordMock, recordCreationMock } = vi.hoisted(
  () => ({
    generateSequenceMock: vi.fn(),
    parseWordMock: vi.fn(),
    recordCreationMock: vi.fn().mockResolvedValue(undefined),
  })
);
vi.mock("#lib/shared/create/services/generation-orchestrator.js", () => ({
  generationOrchestrator: { generateSequence: generateSequenceMock },
}));

vi.mock(
  "#lib/features/create/spell/get-variation-exploration-orchestrator.js",
  () => ({
    getVariationExplorationOrchestrator: () => ({ parseWord: parseWordMock }),
  })
);

vi.mock("#lib/shared/gamification/get-prop-unlock-manager.js", () => ({
  getPropUnlockManager: () => ({ recordCreation: recordCreationMock }),
}));

const { mockAuthState } = vi.hoisted(() => ({
  mockAuthState: { isAuthenticated: false, isAnonymous: false, role: "user" },
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: mockAuthState,
}));

import { createGenerationActionsState } from "#lib/features/create/generate/state/generate-actions.svelte.js";
import { createSpellModeState } from "#lib/features/create/generate/state/spell-mode-state.svelte.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { UIGenerationConfig } from "#lib/shared/create/utils/config-mapper.js";

function makeConfig(
  overrides: Partial<UIGenerationConfig> = {}
): UIGenerationConfig {
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
    ...overrides,
  };
}

/** Bare-bones steps; 70 is enough to exceed the 64-step cap. */
function makeSteps(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    letter: "A",
    stepNumber: i + 1,
  }));
}

describe("onSpellGenerate — truncation toast (mirrors onGenerateClicked)", () => {
  beforeEach(() => {
    generateSequenceMock.mockReset();
    parseWordMock.mockReset();
    recordCreationMock.mockClear();
    mockAuthState.isAuthenticated = false;
    mockAuthState.isAnonymous = false;
    mockAuthState.role = "user";
  });

  it.each([false, true])(
    "preserves relationship and matched turns in Spell (LOOP=%s)",
    async (loopEnabled) => {
      parseWordMock.mockResolvedValue({
        success: true,
        expandedLetters: ["D", "J"],
        letterSources: [],
      });
      generateSequenceMock.mockResolvedValue({
        id: "relationship",
        word: "DJ",
        steps: makeSteps(2),
        metadata: {},
      });
      const spellState = createSpellModeState();
      spellState.setInputWord("DJ");
      const actions = createGenerationActionsState(
        undefined,
        undefined,
        () =>
          makeConfig({
            handRelationship: "TO",
            propRelationship: "free",
            matchHandTurns: true,
            loopEnabled,
            loopType: "rotated",
            period: "quartered",
          }),
        () => spellState
      );
      await actions.onSpellGenerate();
      expect(generateSequenceMock).toHaveBeenCalledWith(
        expect.objectContaining({
          word: "DJ",
          handRelationship: "TO",
          propRelationship: "free",
          matchHandTurns: true,
          mode: loopEnabled ? "circular" : "freeform",
          ...(loopEnabled
            ? { period: "halved", loopSpecWire: expect.any(Object) }
            : {}),
        }),
        expect.objectContaining({ onConstraintReport: expect.any(Function) })
      );
      expect(actions.lastGeneratedSequence?.id).toBe("relationship");
    }
  );

  it("fires the neutral truncation toast for a guest when the spelled word's sequence exceeds the 64-step cap", async () => {
    parseWordMock.mockResolvedValue({
      success: true,
      expandedLetters: [
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "H",
        "I",
        "J",
        "K",
        "L",
      ],
      letterSources: [],
    });
    generateSequenceMock.mockResolvedValue({
      id: "seq-1",
      word: "ABCDEFGHIJKL",
      steps: makeSteps(70),
      metadata: {},
    });

    const spellState = createSpellModeState();
    spellState.setInputWord("CAKEWORDXXXX");

    const toastInfoSpy = vi.spyOn(toast, "info");

    const actions = createGenerationActionsState(
      undefined,
      undefined,
      () => makeConfig(),
      () => spellState
    );

    await actions.onSpellGenerate();

    // Guests share the 64 ceiling with accounts, so the note carries no
    // account ask (the eight-step guest cap was removed 2026-10).
    expect(toastInfoSpy).toHaveBeenCalledWith("Capped to 64 steps.", 5000);
    expect(actions.lastGeneratedSequence?.steps.length).toBe(64);

    toastInfoSpy.mockRestore();
  });

  it("does NOT truncate a guest's twelve-step word (no eight-step guest cap)", async () => {
    parseWordMock.mockResolvedValue({
      success: true,
      expandedLetters: ["A", "B", "C"],
      letterSources: [],
    });
    generateSequenceMock.mockResolvedValue({
      id: "seq-2",
      word: "ABC",
      steps: makeSteps(12),
      metadata: {},
    });

    const spellState = createSpellModeState();
    spellState.setInputWord("ABC");

    const toastInfoSpy = vi.spyOn(toast, "info");

    const actions = createGenerationActionsState(
      undefined,
      undefined,
      () => makeConfig(),
      () => spellState
    );

    await actions.onSpellGenerate();

    expect(toastInfoSpy).not.toHaveBeenCalled();
    expect(actions.lastGeneratedSequence?.steps.length).toBe(12);

    toastInfoSpy.mockRestore();
  });
});
