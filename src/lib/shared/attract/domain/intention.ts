/**
 * The Intention — one small curiosity the ghost can have
 * (spec: docs/superpowers/specs/2026-08-04-ghost-mind-design.md §The Intention).
 *
 * The intention SEQUENCE is never authored. Each intention only knows whether
 * it is currently possible, how appealing it is right now, what it is thinking,
 * and how to act itself out. The mind loop does the rest, which is what buys
 * hand-choreographed quality per action AND emergent breadth across the app.
 */

import type { AttractGhost } from "../services/attract-ghost.svelte";
import type { Rng } from "../services/rng";
import type { Trail } from "../services/trail";
import type { GhostKind } from "./annotations";

export type GhostActivityId =
  | "compose"
  | "generate"
  | "inspect"
  | "reconsider"
  | "finish"
  | "style"
  | "change-prop"
  | "practice"
  | "viewer"
  | "browse"
  | "visit"
  | "museum"
  | "reset"
  | "admire";

export interface GhostActivityStep {
  intentionId: string;
  optional?: boolean;
  targetModuleId?: string;
  targetTabId?: string;
}

export type GhostActivityGoal = "make" | "inspect" | "discover" | "correct";

/**
 * One imaginable future of an activity: the same goal pursued through a
 * different step sequence. The Ghost forecasts each variant separately and
 * chooses between its own imagined futures — the counterfactual step.
 */
export interface GhostActivityVariant {
  id: string;
  steps: GhostActivityStep[];
}

export const DEFAULT_ACTIVITY_VARIANT = "default";

export type GhostSequenceBand = "empty" | "fragment" | "formed" | "long";

export interface GhostActivitySituation {
  moduleId: string | null;
  tabId: string | null;
  sequenceBand: GhostSequenceBand;
  hasEffects: boolean;
  galleryBudgetSpent: boolean;
  cameraGranted: boolean;
  capabilities: string[];
}

export interface GhostActivityObservation {
  situation: GhostActivitySituation;
  sequenceLength: number;
  sequenceWord: string | null;
  effectIds: string[];
  presentationRevision: number;
  /** Which revision the Ghost has actually shown — a replay moves nothing. */
  playedRevision: number;
  understoodConcepts: number;
  encounteredControls: number;
}

export type GhostActivityPredictionSource = "activity" | "goal" | "prior";

export type GhostActivityPredictionDimension =
  | "completion"
  | "achievement"
  | "presentationChange"
  | "discovery"
  | "novelty"
  | "value";

/** Observable consequences the Ghost expects before choosing an activity. */
export interface GhostActivityPrediction {
  activityId: GhostActivityId;
  variantId: string;
  goal: GhostActivityGoal;
  source: GhostActivityPredictionSource;
  matches: number;
  completion: number;
  achievement: number;
  presentationChange: number;
  discovery: number;
  novelty: number;
  value: number;
  confidence: number;
  reliability: number;
  uncertainty: number;
}

export interface ActiveGhostActivityExperience {
  activityId: GhostActivityId;
  variantId: string;
  /** Rolling snapshot so each step can be diffed against the one before it. */
  lastObservation: GhostActivityObservation;
  steps: GhostStepOutcome[];
  goal: GhostActivityGoal;
  startedAt: number;
  before: GhostActivityObservation;
  prediction: GhostActivityPrediction;
  successfulActions: number;
  perceptions: number;
  watchedPayoffs: number;
  failedSteps: number;
}

export interface GhostActivityEvidence {
  presentationChanged: boolean;
  sequenceChanged: boolean;
  effectsChanged: boolean;
  conceptsLearned: number;
  encountersLearned: number;
}

export interface GhostActivityEpisode {
  activityId: GhostActivityId;
  variantId: string;
  goal: GhostActivityGoal;
  situation: GhostActivitySituation;
  outcome: "completed" | "abandoned";
  startedAt: number;
  endedAt: number;
  successfulActions: number;
  perceptions: number;
  watchedPayoffs: number;
  failedSteps: number;
  evidence: GhostActivityEvidence;
  achievement: number;
  novelty: number;
  value: number;
  prediction: GhostActivityPrediction;
  predictionError: number;
  predictionAccuracy: number;
  surprises: GhostActivityPredictionDimension[];
  resultSignature: string;
}

/**
 * What one step of a plan actually did. The episode used to be the smallest
 * unit of learning, which meant the Ghost could learn "that variant scored
 * badly" but never "THAT step is the one wasting my time".
 */
export interface GhostStepOutcome {
  intentionId: string;
  ok: boolean;
  /** Anything at all moved: a drawer, an overlay, the sequence, the screen. */
  productive: boolean;
  /** Something the audience can see moved. */
  visible: boolean;
  optional: boolean;
}

/** Running tally for one intention in one kind of situation. */
export interface GhostStepStat {
  attempts: number;
  productive: number;
  visible: number;
}

export interface GhostExperienceMemory {
  active: ActiveGhostActivityExperience | null;
  episodes: GhostActivityEpisode[];
  last: GhostActivityEpisode | null;
  /** Keyed `intentionId|situation` — the step-level ledger. */
  stepStats: Map<string, GhostStepStat>;
  /** Landed steps that produced nothing where history expected something. */
  noticedDuds: number;
  /** Optional steps dropped from a plan because history calls them dead. */
  prunedSteps: number;
  /** Activities rescued by skipping an impossible step instead of dying. */
  repairedActivities: number;
  /** Steps dropped mid-activity after a surprise, not at selection time. */
  replannedSteps: number;
  recorded: number;
  valueTotal: number;
  lowValueEpisodes: number;
  highValueEpisodes: number;
  informedSelections: number;
  boostedSelections: number;
  reducedSelections: number;
  exploratorySelections: number;
  predictionsRecorded: number;
  predictionErrorTotal: number;
  initialPredictionCount: number;
  initialPredictionErrorTotal: number;
  accuratePredictions: number;
  confidentMisses: number;
  /** Selections where two or more imagined futures were actually compared. */
  counterfactualSelections: number;
  /** Counterfactual selections that rejected the activity's default future. */
  counterfactualDivergences: number;
  /** Imagined futures forecast below neutral that the comparison passed over. */
  suppressedFutures: number;
  lastPrediction: {
    prediction: GhostActivityPrediction;
    multiplier: number;
  } | null;
}

export interface ActiveGhostActivity {
  id: GhostActivityId;
  variantId: string;
  steps: GhostActivityStep[];
  stepIndex: number;
  startedAt: number;
}

export interface GhostActivityMemory {
  current: ActiveGhostActivity | null;
  completed: Map<GhostActivityId, number>;
  abandoned: Map<GhostActivityId, number>;
  lastEndedAt: Map<GhostActivityId, number>;
}

export type GhostNavigationOptionKind = "module" | "tab";

export interface GhostNavigationOption {
  kind: GhostNavigationOptionKind;
  id: string;
  label: string;
}

export interface GhostNavigationFamiliarity {
  /** Stable fingerprint of the labels that were genuinely visible. */
  signature: string;
  reads: number;
  lastReadAt: number;
}

export interface GhostNavigationMemory {
  /** Labels actually rendered after the rail opened, in the order observed. */
  options: GhostNavigationOption[];
  /** The option chosen after looking. Consumed by the following press. */
  choice: GhostNavigationOption | null;
  lastReadAt: number;
  /** What this rail looked like in each module/tab context when last opened. */
  familiarityByContext: Map<string, GhostNavigationFamiliarity>;
  /** Whether the latest read matched a recent, previously inspected rail. */
  lastReadWasFamiliar: boolean;
  /** Full scans versus direct recognitions, exposed for behavioral audits. */
  deliberateReads: number;
  recognizedReads: number;
}

export interface GhostModuleEpisode {
  visits: number;
  productiveVisits: number;
  lastVisitedAt: number;
}

export interface GhostPlaybackMemory {
  /** Increments whenever a successful action changes what Play would show. */
  presentationRevision: number;
  lastPlayedRevision: number;
  lastPlayedSurface: string | null;
  lastPlayedAt: number;
}

export type IntentionCategory =
  | "build"
  | "playback"
  | "effects"
  | "props"
  | "explore"
  | "admire"
  | "reset"
  | "invite";

export const INTENTION_CATEGORIES: IntentionCategory[] = [
  "build",
  "playback",
  "effects",
  "props",
  "explore",
  "admire",
  "reset",
  "invite",
];

/** Mood hint for the body (companion spec: Taco Cat). The dot ignores it. */
export type GhostMood = "curious" | "delighted" | "bored" | "unsure" | "still";

/**
 * How well the ghost understands one idea the app embodies
 * (spec: 2026-08-06-ghost-understanding-design.md).
 *
 * A CONCEPT is not a control. `undo` is a control; "this is forgiving, you can
 * take things back" is a concept. A person's relationship to a control has a
 * history — they do not know it exists, then they are surprised by it, then
 * they get it — and watching that history happen is most of what makes watching
 * someone use software interesting.
 *
 * There is deliberately no "curious" stage. Curiosity is not a belief, it is a
 * REASON TO ACT, and it already has a home: the intention's `can`. Storing it
 * would have meant a stage nothing could ever set.
 */
export type UnderstandingStage = "unaware" | "confused" | "understood";

/** Ideas the ghost can come to understand. Ids are stable; stages are not. */
export const CONCEPTS = [
  /** The picker recommends what flows on from here; it does not restrict you. */
  "continuity",
  /** A sequence that closes can be completed for you. */
  "extension",
  /** It is forgiving — a step can be taken back. */
  "reversibility",
  /** The whole sequence can change without being rebuilt. */
  "transformation",
  /** You can ask for a sequence instead of making one. */
  "generation",
  /** How it looks is separate from what it is. */
  "layering",
] as const;

export type ConceptId = (typeof CONCEPTS)[number];

/** What the sensors read off the live DOM every tick. Never feature imports. */
export interface GhostWorld {
  moduleId: string | null;
  tabId: string | null;
  hasSequence: boolean;
  sequenceLength: number;
  /** The sequence's word, already routed through simplifyRepeatedWord. */
  sequenceWord: string | null;
  isPlaying: boolean;
  activeEffectIds: string[];
  viewerOpen: boolean;
  pickerOpen: boolean;
  /** Modules the ghost can actually reach from the nav right now. */
  reachableModules: string[];
  /**
   * How many pressable, actually-visible elements of each annotated kind are
   * on screen. Every `can` is written against this, so a precondition can only
   * be true when the thing it wants to touch is really there — which is the
   * one failure mode that makes the ghost look broken.
   */
  available: Record<GhostKind, number>;
  /** Elements inviting the ghost to sit and watch. */
  lingerCount: number;
  /**
   * The camera permission is ALREADY granted for this origin, so entering
   * practice will show a mirror instead of raising a native permission prompt.
   * Fails closed: false on any browser that will not answer the question
   * (Safari does not implement the camera permission query), because a prompt
   * the ghost cannot see, press or dismiss is a dead stop in front of
   * strangers.
   */
  cameraGranted: boolean;
  /**
   * A module is currently putting on the show itself — the museum docent walking
   * the player around. The ghost stands back, and the escape hatch must not fire
   * just because an immersive module has nothing left to press: a tour in progress
   * is the opposite of being stuck.
   */
  presenting: boolean;
  /**
   * The camera stream is actually live and attached — not merely that the mirror
   * was switched on. "Wait — can it see me?" must never appear over a black
   * rectangle or a failed permission.
   */
  cameraLive: boolean;
}

/** A world where nothing is possible. Every `can` must be false against it. */
export const EMPTY_WORLD: GhostWorld = {
  moduleId: null,
  tabId: null,
  hasSequence: false,
  sequenceLength: 0,
  sequenceWord: null,
  isPlaying: false,
  activeEffectIds: [],
  viewerOpen: false,
  pickerOpen: false,
  reachableModules: [],
  available: {
    "start-placement": 0,
    option: 0,
    "option-filter": 0,
    turn: 0,
    "step-cell": 0,
    generate: 0,
    "generate-option": 0,
    "sequence-actions": 0,
    extend: 0,
    transform: 0,
    "step-edit": 0,
    undo: 0,
    clear: 0,
    confirm: 0,
    dismiss: 0,
    "close-overlay": 0,
    practice: 0,
    mirror: 0,
    "practice-stop": 0,
    docent: 0,
    play: 0,
    stage: 0,
    tempo: 0,
    "step-nav": 0,
    "view-toggle": 0,
    effect: 0,
    "effect-param": 0,
    prop: 0,
    "prop-picker": 0,
    "nav-module": 0,
    "nav-tab": 0,
    viewer: 0,
    "gallery-item": 0,
    "browse-filter": 0,
    "filter-option": 0,
    "browse-section": 0,
    curio: 0,
  },
  lingerCount: 0,
  cameraGranted: false,
  presenting: false,
  cameraLive: false,
};

/** What the mind remembers for the session. Survives takeover/resume. */
export interface GhostMemory {
  /** intentionId -> times performed this session. */
  performed: Map<string, number>;
  visitedModules: Set<string>;
  lastCategory: IntentionCategory | null;
  /** category -> 0..1, rises on performance, decays every tick. */
  fatigue: Map<IntentionCategory, number>;
  /** ms spent in the current module. Rising pressure to move on. */
  moduleDwellMs: number;
  /**
   * Controls the ghost has already asked "what does this do?" about, so it asks
   * about a new one next time. Lives here rather than in the intention module so
   * the whole of what a tour remembers is seeded, inspectable via
   * `window.__ghost.memory`, and reset with the mind rather than with an HMR
   * reload.
   */
  askedAbout: Set<string>;
  /**
   * Modules that turned out to have nothing the ghost can do. Recorded when a
   * tick finds no satisfiable intention at all, which is the only honest
   * signal that a room is empty — `available` counts controls, not usefulness.
   *
   * Without this the tour becomes a montage of doors: 8 of 26 module visits in
   * a 289-decision session consisted of arriving and immediately leaving.
   */
  barrenModules: Set<string>;
  /**
   * Per-session budgets an intention spends. An OBJECT, not loose numbers: the
   * context handed to `perform` is a shallow copy of world + memory, so a
   * scalar written through the context would be dropped on the floor. Anything
   * an intention needs to increment has to live behind a reference.
   */
  budgets: {
    /** Gallery opens so far. Firestore reads cost money over a four-hour jam. */
    galleryOpens: number;
    /**
     * Invitations offered so far. "You can take this from me" is worth saying
     * and worth saying rarely: the whole point is that it reads as an aside
     * from something busy, not as signage. Capped per session and spaced.
     */
    invites: number;
    /**
     * `trail.lastAt()` when the last invitation ran, for the spacing half of
     * that budget. Lives INSIDE budgets for the reason documented above: the
     * context handed to `perform` is a shallow copy, so a bare scalar on memory
     * would be written to a throwaway object and silently lost.
     */
    lastInviteAt: number;
    /**
     * `trail.lastAt()` when the ghost last produced something worth looking at
     * — any intention carrying a `savor`. Read by clear-and-restart, which
     * must not bin a thing the ghost has only just finished.
     *
     * The simulation that earned this: five extends in one session, and ALL
     * FIVE were followed by a clear within 4-22 seconds. The single most
     * impressive press in the app, and every time the ghost completed the loop
     * it immediately threw it away.
     */
    lastPayoffAt: number;
  };
  /**
   * What the ghost currently believes about each idea in the app. Absent means
   * `unaware`. Written ONLY by an intention's `learn`, which is handed the
   * world before and after its own action — so a belief can never run ahead of
   * the evidence for it.
   *
   * A Map rather than a scalar for the same reason `budgets` is an object: the
   * context handed to `perform` is a shallow copy, so anything written through
   * it has to live behind a reference.
   */
  concepts: Map<ConceptId, UnderstandingStage>;
  /**
   * A small scratchpad per concept, for evidence that only means something
   * across two encounters — e.g. continuity is only understood once the ghost
   * has seen that the surviving option set CHANGED between two collapses,
   * which no single before/after can show.
   */
  conceptNotes: Map<ConceptId, string>;
  /**
   * The activity currently holding the Ghost's attention. Fish keep swimming a
   * chosen behavior until it ends; this gives the presenter the same ability to
   * finish a thought instead of redrawing from the whole bag after every click.
   */
  activities: GhostActivityMemory;
  /** What the Ghost has physically opened and read in the sidebar. */
  navigation: GhostNavigationMemory;
  /** Outcomes of entering a room, not merely the fact that it was entered. */
  moduleEpisodes: Map<string, GhostModuleEpisode>;
  /** Whether replay would reveal anything the Ghost has not just watched. */
  playback: GhostPlaybackMemory;
  /** General lessons learned from completed and abandoned activities. */
  experience: GhostExperienceMemory;
  /** The last action that actually ran, used by reactions such as Undo. */
  lastIntentionId: string | null;
  rng: Rng;
  trail: Trail;
}

export type GhostContext = GhostWorld & GhostMemory;

export interface Intention {
  id: string;
  category: IntentionCategory;

  /** A perception gathers evidence; an action changes the app. */
  operation?: "perceive" | "act";

  /** A successful perform changes the presentation a later Play would show. */
  changesPresentation?: boolean;

  /**
   * Choose the ONE element this intention will act on, before it says anything.
   *
   * Without this, a thought that names a control and a perform that picks one
   * sample the DOM independently and disagree — the thought took the first
   * fresh match, the perform took a random one. Austen watching it live:
   * "he keeps saying I wonder what side by side is and then not clicking side
   * by side", "said I wanted to slow down and then clicked fast". A presenter
   * that narrates one thing and does another is worse than a silent one.
   *
   * The target is resolved once, the thought is written from it, and the
   * perform acts on exactly it. If it has vanished by then the perform fails
   * honestly rather than quietly substituting a different control.
   */
  target?: (ctx: GhostContext) => HTMLElement | null;

  /** The visible monologue. A function when it names what it is about to touch. */
  thought: string | ((ctx: GhostContext, target: HTMLElement | null) => string);

  /** Hard gate. False means it is not even a candidate this tick. */
  can: (ctx: GhostContext) => boolean;

  /** Appeal right now, 0..1, BEFORE novelty and fatigue are applied. */
  appeal: (ctx: GhostContext) => number;

  /**
   * The choreography, written against the existing motor primitives.
   * Return false when it found nothing to act on — that is a lying
   * precondition and the trail records it. void counts as acted.
   */
  perform: (
    g: AttractGhost,
    ctx: GhostContext,
    target: HTMLElement | null
  ) => Promise<boolean | void>;

  /**
   * Said AFTER the press, once the thing has actually happened. "OK, that was
   * kind of neat" is a reaction, not a motive — it only makes sense on the way
   * out, and the thought slot before the press cannot carry it. Return null to
   * stay quiet, which should be most of the time.
   */
  reaction?: (ctx: GhostContext, target: HTMLElement | null) => string | null;

  /** Optional mood hint for the body. Defaults to "curious". */
  mood?: GhostMood;

  /**
   * Exempt from the novelty penalty.
   *
   * Novelty (`1 / (1 + timesPerformed)`) exists to stop the ghost repeating
   * itself, and for almost everything that is right. For the handful of
   * intentions whose whole job IS repetition it is catastrophic: adding a step
   * to a sequence is the same action every time, so by the third one novelty
   * has cut its score to a quarter and anything else on screen outscores it.
   *
   * A 400-decision simulation of the shipped bag never once added two steps in
   * a row and never got a sequence past six steps — the ghost demonstrated a
   * start-placement picker rather than a composer, which is exactly what Austen
   * saw: "he won't build a whole sequence."
   *
   * Set this only where repetition is the point, and give the intention its own
   * brake instead (a tapering `appeal`, a ceiling in `can`). Otherwise it never
   * stops.
   */
  repeatable?: boolean;

  /**
   * The idea this intention is an encounter with. Pairs with `learn`.
   */
  concept?: ConceptId;

  /**
   * Read what actually happened and report what the ghost should now believe.
   *
   * Handed the world as it was BEFORE the action and as it is AFTER it, so the
   * only thing that can move a belief forward is an observed delta. Return
   * `null` — the common case — to leave the belief where it was.
   *
   * This constraint is the whole point. The ghost cannot decide it has
   * understood the option filter unless the option count really did collapse
   * when it pressed the toggle; on a screen where Continuous happens to filter
   * nothing, no insight is claimed, because none was available. The earlier
   * attempt at giving the presenter an inner life failed the other way round —
   * lines written first, justifications found second (ca21afa1f6, reverted).
   * Evidence first, line second, or nothing.
   *
   * Runs BEFORE `reaction`, so a reaction may be about what was just realised.
   */
  learn?: (
    before: GhostWorld,
    after: GhostWorld,
    ctx: GhostContext
  ) => UnderstandingStage | null;

  /**
   * Milliseconds to step back and SHUT UP after a successful perform, so the
   * thing that just happened can actually be watched.
   *
   * Declare it only on beats with a real payoff — a sequence playing, an effect
   * lighting up. The ghost glides clear, shrinks, dims, and the caption blanks
   * for this long; then the `reaction` lands on the way back in. That is what
   * gives the show peaks instead of an unbroken stream of clicking.
   *
   * Deliberately opt-in per intention. The global version of this behaviour was
   * a bug (3b912bbc97 — "moves out of the way after clicking"): stepping aside
   * when there is nothing to look at is just the ghost wandering off.
   */
  savor?: number | ((ctx: GhostContext) => number);

  /** Safety actions may interrupt an activity whose next task has not run yet. */
  interrupt?: boolean;
}

/**
 * Natural successors. Momentum is what turns a scored bag into a chain of
 * thought: "make a thing, watch it, dress it up" becomes the LIKELY path
 * without that sequence ever being written down anywhere.
 */
export const FOLLOWS: Record<IntentionCategory, IntentionCategory[]> = {
  build: ["build", "playback"],
  playback: ["effects", "props", "playback", "admire"],
  effects: ["effects", "playback", "admire"],
  props: ["playback", "effects", "admire"],
  explore: ["explore", "build", "admire"],
  admire: ["explore", "playback"],
  reset: ["build"],
  // Nothing follows INTO an invitation: it must win on its own low appeal, never
  // on momentum, or two of them chain and the aside becomes a pitch.
  invite: ["build", "explore", "playback"],
};

export function resolveThought(
  intention: Intention,
  ctx: GhostContext,
  target: HTMLElement | null = null
): string {
  return typeof intention.thought === "function"
    ? intention.thought(ctx, target)
    : intention.thought;
}
