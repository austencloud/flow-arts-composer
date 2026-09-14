import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Letter } from "../../../src/lib/shared/foundation/domain/models/letter";
import { LetterType } from "../../../src/lib/shared/foundation/domain/models/letter-type";
import { LETTER_TYPE_COLORS } from "../../../src/lib/shared/pictograph/shared/domain/constants/pictograph-constants";
import {
  ROTATION_DIRECTION_LESSON,
  ROTATION_DIRECTION_QUESTIONS,
  TYPE1_ACCENTS,
  TYPE1_LESSON_LETTERS,
  TYPE1_QUESTIONS,
} from "../../../src/lib/features/learn/components/interactive/shared/canonical-lesson-content";
import {
  ALPHA_BETA_MODES,
  GAMMA_MODES,
  HAND_PATH_STEPS,
} from "../../../src/lib/features/learn/components/interactive/foundations/pictograph-foundation-content";
import {
  HAND_MOTIONS_STAGE_SCHEMA_VERSION,
  migrateHandMotionsSavedStep,
} from "../../../src/lib/features/learn/components/interactive/motions/hand-motions-stage";

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("canonical concept lesson content", () => {
  it("moves legacy comparison progress past the inserted bridge", () => {
    expect(HAND_MOTIONS_STAGE_SCHEMA_VERSION).toBe(2);
    expect(migrateHandMotionsSavedStep(4, 1, HAND_PATH_STEPS.length)).toBe(5);
    expect(migrateHandMotionsSavedStep(4, 2, HAND_PATH_STEPS.length)).toBe(4);
    expect(migrateHandMotionsSavedStep(2, 1, HAND_PATH_STEPS.length)).toBe(2);
  });

  it("teaches hand paths before any visible letter", () => {
    expect(HAND_PATH_STEPS.map((item) => item.id)).toEqual([
      "shift",
      "dash",
      "static",
    ]);
    expect(HAND_PATH_STEPS.every((item) => item.sequence.word === "")).toBe(
      true
    );
    expect(
      HAND_PATH_STEPS.every((item) =>
        item.sequence.steps.every((step) => step.letter === null)
      )
    ).toBe(true);
  });

  it("orders all six timing/direction modes before the letter lessons", () => {
    expect(ALPHA_BETA_MODES.map((mode) => mode.id)).toEqual([
      "ss",
      "ts",
      "so",
      "to",
    ]);
    expect(GAMMA_MODES.map((mode) => mode.id)).toEqual(["qo", "qs"]);
    expect(
      [...ALPHA_BETA_MODES, ...GAMMA_MODES].map((mode) => [
        mode.timing,
        mode.direction,
      ])
    ).toEqual([
      ["Split", "Same"],
      ["Together", "Same"],
      ["Split", "Opposite"],
      ["Together", "Opposite"],
      ["Quarter", "Opposite"],
      ["Quarter", "Same"],
    ]);
  });

  it("isolates pro and anti with canonical A/B pictographs", () => {
    expect(ROTATION_DIRECTION_LESSON.map((item) => item.id)).toEqual([
      "pro",
      "anti",
    ]);
    expect(ROTATION_DIRECTION_LESSON.map((item) => item.letter)).toEqual([
      Letter.A,
      Letter.B,
    ]);
    expect(
      ROTATION_DIRECTION_QUESTIONS.map((question) => question.answer)
    ).toEqual(["pro", "anti"]);
  });

  it("keeps the published Type 1 lesson scoped to A/B/C and G/H/I", () => {
    expect(TYPE1_LESSON_LETTERS.map((item) => item.letter)).toEqual([
      Letter.A,
      Letter.B,
      Letter.C,
      Letter.G,
      Letter.H,
      Letter.I,
    ]);
    expect(TYPE1_LESSON_LETTERS.map((item) => item.pattern)).toEqual([
      "pro-pro",
      "anti-anti",
      "hybrid",
      "pro-pro",
      "anti-anti",
      "hybrid",
    ]);
    expect(TYPE1_ACCENTS).toBe(LETTER_TYPE_COLORS[LetterType.TYPE1]);
    expect(
      TYPE1_QUESTIONS.every((question) =>
        question.choices.includes(question.answer)
      )
    ).toBe(true);
  });
});

describe("canonical concept lesson composition", () => {
  it("renders foundation motion and letter examples through production paths", () => {
    const stage = readSource(
      "src/lib/features/learn/components/interactive/shared/LessonPictographStage.svelte"
    );
    const motions = readSource(
      "src/lib/features/learn/components/interactive/motions/MotionsConceptExperience.svelte"
    );
    const positions = readSource(
      "src/lib/features/learn/components/interactive/positions/PositionsConceptExperience.svelte"
    );
    const handPlayer = readSource(
      "src/lib/features/learn/components/interactive/foundations/HandMotionPlayer.svelte"
    );
    const inlinePlayer = readSource(
      "src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte"
    );
    const timingBoard = readSource(
      "src/lib/features/learn/components/interactive/motions/TimingDirectionBoard.svelte"
    );
    const timingIntro = readSource(
      "src/lib/features/learn/components/interactive/motions/TimingDirectionIntro.svelte"
    );
    const foundationContent = readSource(
      "src/lib/features/learn/components/interactive/foundations/pictograph-foundation-content.ts"
    );
    const type1 = readSource(
      "src/lib/features/learn/components/interactive/letters/type1/Type1ConceptExperience.svelte"
    );
    const rotation = readSource(
      "src/lib/features/learn/components/interactive/rotation/RotationDirectionConceptExperience.svelte"
    );

    expect(stage).toContain("PictographContainer");
    expect(stage).toContain("startPositionDeriver");
    expect(stage).toContain("PropType.STAFF");
    expect(motions).toContain("HandMotionPlayer");
    expect(motions).toContain("HAND_PATH_STEPS");
    expect(motions).toContain("ALPHA_BETA_MODES");
    expect(motions).toContain("GAMMA_MODES");
    expect(motions).toContain("TND_ELEMENTS");
    expect(motions).toContain("TimingDirectionBoard");
    expect(motions).toContain("TimingDirectionIntro");
    expect(motions).toContain(
      "const timingDirectionIndex = HAND_PATH_STEPS.length"
    );
    expect(motions).toContain('activeMotion?.name ?? "Timing and Direction"');
    expect(motions).toContain('"stageSchemaVersion"');
    expect(motions).toContain("migrateHandMotionsSavedStep");
    expect(motions).toContain('viewMode === "scroll"\n      ? comparisonIndex');
    expect(motions).toContain("getConceptPlacesByLevel(1)");
    expect(motions).toContain("LessonStageFrame");
    expect(motions).toContain("var(--shell-w, 96rem)");
    expect(motions).not.toContain("element-properties");
    expect(motions).not.toContain("activeMode");
    expect(motions).not.toContain("recap-state");
    expect(motions).not.toContain('"Timing + Direction"');
    expect(motions).not.toContain('class="axis-join"');
    expect(motions).not.toContain("letterQueryHandler");
    expect(motions).not.toContain("LessonPictographStage");
    expect(positions).toContain('onComplete?.("hand-motions-intro")');
    expect(positions).toContain("PropPlacementGrid");
    expect(positions).toContain("PictographContainer");
    expect(positions).toContain("leftPropType={PropType.HAND}");
    expect(positions).toContain("rightPropType={PropType.HAND}");
    // The readout and every example name the position. The canonical
    // pictograph already draws the glyph, so a second decorative one beside it
    // would print the same fact twice.
    expect(positions).toContain(
      'built ? POSITION_TYPE_INFO[built].label : "Your position"'
    );
    expect(positions).toContain("POSITION_TYPE_INFO[example.kind].label");
    expect(positions).not.toContain("TKAWordGlyph");
    expect(positions).not.toContain("focusPhase");
    expect(positions).not.toContain("Try it");
    expect(handPlayer).toContain("InlineAnimationPlayer");
    // The player took a `neutralMarkers` prop in b7c50b7ea1 so the timing and
    // direction lessons can show unlabeled motion points. Hands stay the
    // default; assert the fallback rather than a literal that now only holds
    // for one branch.
    expect(handPlayer).toContain("neutralMarkers");
    expect(handPlayer).toMatch(
      /leftPropType=\{neutralMarkers \? "[^"]+" : "hand"\}/
    );
    expect(handPlayer).toMatch(
      /rightPropType=\{neutralMarkers \? "[^"]+" : "hand"\}/
    );
    expect(handPlayer).toContain("hideTkaGlyph");
    expect(handPlayer).toContain("elementalGlyph: showElementalGlyph");
    expect(handPlayer).toContain("{onStepChange}");
    expect(handPlayer).toContain("{onSeekRef}");
    expect(inlinePlayer).toContain("publishSeek(handleSeek)");
    expect(timingBoard).toContain("createLayoutMotion");
    expect(timingBoard).toContain("ChoreoCard");
    expect(timingBoard).toContain("handPathMode");
    expect(timingBoard).toContain("showWord={false}");
    expect(timingBoard).toContain("includeStartPosition");
    expect(timingBoard).not.toContain("includeStartPosition={false}");
    expect(timingBoard).not.toContain("startPositionLayoutOverride");
    expect(timingBoard).not.toContain("clickableStart");
    expect(timingBoard).toContain("customTitleText={mode.element.name}");
    expect(timingBoard).toContain("customNotesText={definitionFor(mode)}");
    expect(timingBoard).toContain("frameColors={{");
    expect(timingBoard).toContain("CARD_SIZES.poker.widthInches");
    expect(timingBoard).toContain("cardAspectRatio={pokerCardAspectRatio}");
    expect(timingBoard).toContain("columnCount={2}");
    expect(timingBoard).not.toContain("choreo-card-artifact");
    expect(timingBoard).toContain("dark: mode.element.darkComplement");
    expect(timingBoard).not.toContain("card-identity");
    expect(timingBoard).toContain("onStepClick={seekToCardStep}");
    expect(timingBoard).toContain("onStepChange={syncFocusedStep}");
    expect(timingBoard).toContain("showElementalGlyph");
    expect(timingBoard).toContain("externalPlaying={playing}");
    expect(timingBoard).toContain("Back to all six relationships");
    expect(timingBoard).toContain("mode.id.toUpperCase()");
    expect(timingBoard).not.toContain("mode.element.element");
    expect(timingBoard).not.toMatch(
      /border-(left|right|top|bottom):\s*[2-9]\d*px/
    );
    // 2d3b8d4e86 rewrote the combined timing/direction panel into three
    // independent examples (placement, timing, direction), dropping the old
    // timing-heading/direction-heading ids and the timingMode/directionMode
    // state names along with it. Assert the current structure instead.
    expect(timingIntro).toContain('aria-label="Timing" use:renderGateTarget={gate}>');
    expect(timingIntro).toContain("<h3>Timing</h3>");
    expect(timingIntro).toContain('aria-label="Direction">');
    expect(timingIntro).toContain("<h3>Direction</h3>");
    expect(timingIntro).toContain("SegmentedControl");
    expect(timingIntro).toContain('semantics="radiogroup"');
    expect(timingIntro).toContain('let timing = $state<TimingMode>("together");');
    expect(timingIntro).toContain(
      'rotations[0] === rotations[1] ? "same" : "opposite"'
    );
    // Static diagrams delegate their selection transitions to the reduced-motion-aware owner.
    expect(timingIntro).toContain(
      'import Crossfade from "$lib/shared/components/Crossfade.svelte"'
    );
    expect(timingIntro).not.toContain("timing-bounce");
    expect(timingIntro).not.toContain("bounce-stage");
    expect(timingIntro).not.toContain("example-bay");
    expect(timingIntro).not.toContain("axis-join");
    expect(timingIntro).not.toMatch(
      /border-(left|right|top|bottom):\s*[2-9]\d*px/
    );
    expect(foundationContent).toContain("PropType.HAND");
    expect(rotation).toContain("letterQueryHandler");
    expect(rotation).toContain("LessonPictographStage");
    expect(type1).toContain("letterQueryHandler");
    expect(type1).toContain("LessonPictographStage");

    expect(motions).not.toContain("MotionVisualizer");
    expect(motions).not.toContain("MOTIONS_INFO");
    expect(motions).not.toContain("MotionTypePage");
    expect(rotation).not.toContain("StaffPositionVisualizer");
    expect(type1).not.toContain("TYPE1_ALPHABET");
    expect(type1).not.toContain("Type1ProspinPage");
  });

  it("publishes motion, timing/direction, and anatomy before letters", () => {
    const registry = readSource(
      "src/lib/features/learn/domain/concept-experience-registry.ts"
    );
    const anatomy = readSource(
      "src/lib/features/learn/components/interactive/foundations/PictographAnatomyConceptExperience.svelte"
    );
    const order = [
      "hand-motions-intro",
      "dual-shifts-alpha-beta",
      "gamma-motion",
      "letter-codex-intro",
      "type1-abc-ghi",
      "words-alpha-beta",
    ].map((id) => registry.indexOf(`conceptId: "${id}"`));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(anatomy).toContain("ArtifactRegionSpotlight");
    expect(anatomy).toContain("PictographContainer");
    expect(anatomy).toContain("Top left: the step number.");
    expect(anatomy).toContain("Bottom right: the hands’ time and direction.");
    expect(anatomy).toContain("Top right: the props’ time and direction.");
  });

  it("walks the guide's six words step by step before a six-word recap", () => {
    const words = readSource(
      "src/lib/features/learn/components/interactive/words/WordsConceptExperience.svelte"
    );
    const progress = readSource(
      "src/lib/features/learn/components/interactive/words/learning-letters-progress.ts"
    );

    // Step machinery: hand-held one-word-at-a-time flow (grid-lesson pattern),
    // in the guide's Alpha/Beta Words order.
    expect(words).toContain("LessonStageControls");
    expect(words).toContain("LEARNING_LETTERS_TOTAL_STEPS");
    expect(words).toContain("recapStepIndex");
    expect(progress).toContain(
      '"AAAA",\n  "BBBB",\n  "CCCC",\n  "GGGG",\n  "HHHH",\n  "IIII",'
    );

    // Connective copy is the guide's own prose, verbatim (lt1-abc-ghi) —
    // approved via docs/learn/copy-reviews/words-alpha-beta.md.
    expect(words).toContain(
      "The first words we will learn correspond to VTG’s 1:1 motions."
    );
    expect(words).toContain(
      "you’ll need to use body turns and/or negative space"
    );
    expect(words.replace(/\s+/g, " ")).toContain(
      "Practice each word once in both directions, then again starting with thumbs out."
    );
  });

  it("keeps video, animation, card, and notes together without revealing the full deck", () => {
    const stage = readSource(
      "src/lib/features/learn/components/interactive/words/LearningWordStage.svelte"
    );
    const words = readSource(
      "src/lib/features/learn/components/interactive/words/WordsConceptExperience.svelte"
    );
    const content = readSource(
      "src/lib/features/learn/components/interactive/words/learning-letter-teaching-content.ts"
    );
    const detail = readSource(
      "src/lib/features/learn/components/ConceptDetailView.svelte"
    );

    expect(words).toContain("loadFoundingCollectionSequences");
    expect(words).toContain("TKAWordGlyph");
    expect(words).toContain("LearningWordStage");
    expect(words).toContain("recap-families");
    expect(words).not.toContain("ChoreoCardThumbnail");
    expect(words).not.toContain("SegmentedControl");
    expect(words).not.toContain("word-choices");
    expect(words).not.toContain("selected-workspace");
    expect(words).not.toContain("visitedSequenceIds");
    expect(stage).toContain("InlineAnimationPlayer");
    expect(stage).toContain("ChoreoCard");
    expect(stage).toContain("PanelGroup");
    expect(stage).toContain("Performance video");
    expect(stage).toContain("Guide notes");
    expect(stage).toContain("showWordHeader={false}");
    expect(stage).toContain("showWord={false}");
    expect(stage).toContain("hideTkaGlyph");
    expect(stage).toContain("derivePropElementalType");
    expect(stage).toContain("visibilityManagerOverride={lessonVisibility}");
    expect(stage).not.toContain("disableContextMenu");
    expect(stage).toContain('id: "performance"');
    expect(stage).toContain('id: "animation"');
    expect(stage).toContain('id: "card"');
    expect(content).toContain("LEARNING_LETTERS_DECK_WORDS");
    expect(content).toContain("video: null");
    expect(content).toContain("explanation: null");
    expect(detail).toContain("background: transparent");

    // Big-screen tiers use the 1680/2600 seams — a 2200 seam is dead on
    // 4K@200% (4k-native-layout.md).
    expect(words).not.toContain("min-width: 2200px");
    expect(stage).not.toContain("min-width: 2200px");

    expect(words).not.toContain("getWordSequenceGenerator");
    expect(words).not.toContain("WORD_LESSON_EXAMPLES");
    expect(words).not.toContain("WORD_QUESTIONS");
    expect(words).not.toContain('"AABB"');
    expect(words).not.toContain("CanonicalWordStage");
    expect(words).not.toContain("answer-grid");
    expect(words).not.toContain("challengeFamilyIndex");
    expect(words).not.toContain("summary-families");
    expect(words).not.toContain("letter-train");
    expect(words).not.toContain('.split("")');
    expect(words).not.toContain("<strong>{word}</strong>");
    expect(words).not.toMatch(/box-shadow:\s*inset\s+0\s+-?\d+px/);
    expect(words).not.toMatch(/border-(left|right|top|bottom):\s*[2-9]\d*px/);
    expect(words).not.toContain("WordVisualizer");
    expect(words).not.toContain("AABBDemoPage");
    expect(words).not.toContain("MorePatternsPage");
  });

  it("keeps rejected concept copy out of the live lesson", () => {
    const words = readSource(
      "src/lib/features/learn/components/interactive/words/WordsConceptExperience.svelte"
    );
    const review = readSource("docs/learn/copy-reviews/words-alpha-beta.md");
    const rejectedSection = review
      .split("## Rejected Copy")[1]
      ?.split("## Grounded Evidence Collected")[0];
    const rejectedCopy = [
      ...(rejectedSection ?? "").matchAll(/^> (.+)$/gm),
    ].map(([, copy]) => copy);

    expect(rejectedCopy.length).toBeGreaterThan(0);
    for (const copy of rejectedCopy) {
      expect(words).not.toContain(copy);
    }
  });
});

describe("concept visual grounding workflow", () => {
  it("requires component ownership evidence before lesson UI changes", () => {
    const skill = readSource(".claude/skills/concepts/SKILL.md");
    const gate = readSource(".claude/skills/concepts/visual-grounding-gate.md");

    expect(skill).toContain("visual-grounding-gate.md");
    expect(gate).toContain("| Capability");
    expect(gate).toContain("no-left-edge-accent-bar.md");
    expect(gate).toContain("TKAWordGlyph");
    expect(gate).toContain("inspectable before selection");
    expect(gate).toContain("simultaneous split/stack contract");
  });
});
