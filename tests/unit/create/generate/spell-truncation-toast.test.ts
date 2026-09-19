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
  mockAuthState: { isAuthenticated: false, isAnonymous: false, role: "user" },
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: mockAuthState,
}));

import { createGenerationActionsState } from "$lib/features/create/generate/state/generate-actions.svelte";
import { createSpellModeState } from "$lib/features/create/generate/state/spell-mode-state.svelte";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { UIGenerationConfig } from "$lib/shared/create/utils/config-mapper";
import { AUTH_NUDGE_TEXTS } from "$lib/shared/auth/domain/auth-nudge-trigger";

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

/** 12 bare-bones steps - enough to exceed the guest 8-step cap. */
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

  it("fires the guest-tier truncation toast when the spelled word's sequence exceeds the step cap", async () => {
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
      steps: makeSteps(12),
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

    // Centralized copy (auth-nudge-trigger.ts) — the hand-rolled "Capped to 8
    // steps. Sign up free for up to 64." duplicate was consolidated onto
    // AUTH_NUDGE_TEXTS["step-cap-guest"] (2026-07-18 nudge-copy spec).
    expect(toastInfoSpy).toHaveBeenCalledWith(
      AUTH_NUDGE_TEXTS["step-cap-guest"],
      5000
    );
    expect(actions.lastGeneratedSequence?.steps.length).toBe(8);

    toastInfoSpy.mockRestore();
  });

  it("does NOT fire the truncation toast when the sequence is within the step cap", async () => {
    parseWordMock.mockResolvedValue({
      success: true,
      expandedLetters: ["A", "B", "C"],
      letterSources: [],
    });
    generateSequenceMock.mockResolvedValue({
      id: "seq-2",
      word: "ABC",
      steps: makeSteps(3),
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
    expect(actions.lastGeneratedSequence?.steps.length).toBe(3);

    toastInfoSpy.mockRestore();
  });
});
