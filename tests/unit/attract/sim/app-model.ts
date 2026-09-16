/**
 * A fake app for the ghost to drive.
 *
 * The presenter's failures are failures of SEQUENCING — it sets a turn and
 * never applies an option, it adds one step and clears, it never sprees, it
 * never touches generate. None of that is a motor or a pixel problem, so none
 * of it needs a browser to observe. What it needs is the real intention bag and
 * the real scoring running against a world that reacts the way the app reacts,
 * for a few hundred decisions, with every decision written down.
 *
 * So this models the app as state + annotated DOM. Pressing a `start-placement`
 * really does create a sequence; pressing `clear` really does raise a confirm;
 * the generate module really is annotated with nothing, because that is the
 * truth today and hiding it would hide the finding.
 *
 * Fidelity contract: this models WHAT IS ANNOTATED and WHAT PRESSING IT DOES.
 * It does not model layout, timing of real mounts, or anything visual. Findings
 * about decision order are trustworthy; findings about how something looks are
 * not, and must be checked in a browser.
 */

export interface SimState {
  moduleId: string | null;
  tabId: string | null;
  seqLen: number;
  isPlaying: boolean;
  activeEffects: Set<string>;
  viewerOpen: boolean;
  propDrawerOpen: boolean;
  actionsPanelOpen: boolean;
  /** Filters applied in the library. Each one narrows the grid. */
  browseFilters: number;
  filterPopoverOpen: boolean;
  /** An unsolicited overlay is up — a first-run prompt. Blocks everything. */
  blockerUp: boolean;
  /** A step is selected and its editor is open. */
  stepEditorOpen: boolean;
  /** The zero-based step displayed by the stage transport. */
  currentStep: number;
  /** All vs Continuous. Continuous shows only what flows on from HERE. */
  continuousOnly: boolean;
  /** Virtual-clock time at which the current playthrough finishes. */
  playingUntil: number;
  /** Words are how a transform proves it changed something. */
  word: string;
  practiceOn: boolean;
  mirrorOn: boolean;
  confirmUp: boolean;
  /** Virtual-clock time until which a module is running its own tour. */
  presentingUntil: number;
  /** Turn presses that never got applied to a step — the complaint, counted. */
  turnPresses: number;
  clears: number;
  /** Generator settings pressed — the generate-tab version of turn-fiddling. */
  generatorTweaks: number;
  /** Longest sequence this session ever reached. */
  peakSeqLen: number;
  /** Number of exact sequence snapshots available to Undo. */
  undoDepth: number;
}

export interface PressEvent {
  kind: string;
  label: string;
  moduleId: string | null;
}

/** Modules the sidebar offers. Mirrors the real nav closely enough to score. */
export const SIM_MODULES = [
  "create",
  "browse",
  "library",
  "practice",
  "museum",
  "play",
  "learn",
] as const;

/**
 * What each module puts on screen, by annotated kind.
 *
 * `create` is split by tab because that IS the finding: the construct tab is
 * dense with annotated controls and the generate tab has none, so a ghost that
 * navigates by "what can I press here" can never spend time in generate.
 */
function screenKinds(s: SimState): Record<string, number> {
  // A blocker with a backdrop makes every other control fail the hit-test, so
  // the world really is just the one button until it is dismissed.
  if (s.blockerUp) return { dismiss: 1 };
  if (s.confirmUp) return { confirm: 1, dismiss: 0 };
  if (s.viewerOpen)
    return {
      stage: 1,
      play: 1,
      tempo: 3,
      effect: 16,
      "close-overlay": 1,
      viewer: 0,
    };

  switch (s.moduleId) {
    case "create":
      if (s.tabId === "generate") {
        // The generate card grid: one Generate button plus the settings that
        // change in place (length/level steppers, the grid-mode toggle).
        // Cards that open an overlay stay unannotated, so the ghost cannot
        // walk itself into a modal it has no way out of.
        return {
          generate: 1,
          "generate-option": 6,
          "step-cell": s.seqLen,
          play: s.seqLen > 0 ? 1 : 0,
          stage: 1,
        };
      }
      return {
        ...(s.seqLen === 0
          ? { "start-placement": 8 }
          : {
              // Continuity is a property of the TRANSITION, not of the letter
              // (getReversalCount takes the surrounding sequence). So the
              // surviving set both shrinks AND changes as the sequence grows —
              // which is the observation the ghost has to make to understand
              // what the filter is really doing.
              option: s.continuousOnly ? 3 + ((s.seqLen * 3) % 6) : 24,
            }),
        "option-filter": s.seqLen > 0 ? 3 : 0,
        turn: s.seqLen > 0 ? 2 : 0,
        "step-cell": s.seqLen,
        clear: s.seqLen > 0 ? 1 : 0,
        play: s.seqLen > 0 ? 1 : 0,
        stage: 1,
        tempo: s.seqLen > 0 ? 3 : 0,
        effect: s.seqLen > 0 ? 16 : 0,
        "effect-param": s.activeEffects.size > 0 ? 4 : 0,
        undo: s.undoDepth > 0 ? 1 : 0,
        // Transport + view toggles ride along with the stage.
        "step-nav": s.seqLen >= 2 ? 2 : 0,
        "view-toggle": s.seqLen > 0 ? 3 : 0,
        // The step editor opens on a selected step.
        "step-edit": s.stepEditorOpen ? 8 : 0,
        "sequence-actions": s.seqLen > 0 && !s.actionsPanelOpen ? 1 : 0,
        // The actions panel: transforms always, Extend only when the sequence
        // genuinely closes — the real SequenceTransformActions renders that button
        // inside `{#if onExtend && canExtend}`, so its presence IS the signal.
        transform: s.actionsPanelOpen ? 6 : 0,
        extend:
          s.actionsPanelOpen && s.seqLen >= 4 && s.seqLen % 2 === 0 ? 1 : 0,
        "prop-picker": s.seqLen > 0 && !s.propDrawerOpen ? 1 : 0,
        prop: s.propDrawerOpen ? 6 : 0,
        viewer: s.seqLen > 0 ? 1 : 0,
        practice: s.seqLen > 0 && !s.practiceOn ? 1 : 0,
        mirror: s.practiceOn && !s.mirrorOn ? 1 : 0,
        "practice-stop": s.practiceOn ? 1 : 0,
        curio: 2,
      };
    case "browse":
    case "library": {
      // A filtered library shows fewer items — that is the whole point of the
      // filter, and it is also what lets the ghost notice it has narrowed too
      // far and reach for the reset.
      const items =
        s.browseFilters === 0 ? 12 : Math.max(2, 12 - s.browseFilters * 5);
      return {
        "gallery-item": items,
        "browse-filter": 5,
        "filter-option": s.filterPopoverOpen ? 4 : 0,
        "browse-section": 4,
        curio: 1,
      };
    }
    case "museum":
      return { docent: 1 };
    case "play":
      return { curio: 3 };
    case "learn":
      return { curio: 2 };
    default:
      return {};
  }
}

const LABELS: Record<string, string[]> = {
  "start-placement": ["alpha1", "beta3", "gamma5"],
  option: ["A", "B", "D", "G", "P", "Σ", "Ψ", "W-"],
  "option-filter": ["Continuous", "All", "Reversals"],
  turn: ["Blue turns", "Red turns"],
  effect: ["Trails", "Fire", "LED", "Bloom", "Goo", "Ink", "Silk", "Pulse"],
  prop: ["Staff", "Fan", "Club", "Buugeng"],
  tempo: ["Slow", "Medium", "Fast"],
  curio: ["Mandala", "Tunnel", "Card"],
  "gallery-item": ["someone's sequence"],
  "browse-filter": ["Level", "Length", "Favorites", "LOOP type", "Turns"],
  "filter-option": ["All", "Level 2", "Level 3", "8 steps"],
  "browse-section": ["Level 1", "Level 2", "March", "April"],
  transform: ["Mirror", "Flip", "Swap", "Invert", "Rotate L", "Rotate R"],
  "step-nav": ["Previous step", "Next step"],
  "view-toggle": ["Toggle grid", "Motion visibility", "Comparison mode"],
  "step-edit": [
    "blue orientation in",
    "red orientation out",
    "Swap beta offset",
  ],
  "generate-option": [
    "Increase Length",
    "Decrease Length",
    "Increase Level",
    "Grid Mode",
  ],
};

export function simBaseWord(length: number): string {
  return "ABDGPSWX".slice(0, Math.min(8, length));
}

export interface SimApp {
  state: SimState;
  /** Rebuild document.body to match state. Called after every mutation. */
  render: () => void;
  /** Apply the effect of pressing an element. Unknown elements are inert. */
  press: (el: HTMLElement) => void;
  /** Programmatic module switch — the host's escape hatch. */
  goTo: (moduleId: string, tabId?: string | null) => void;
  presses: PressEvent[];
  /** A module is running its own show — the ghost should stand back. */
  presenting: () => boolean;
  /** Playback runs for the length of the sequence, then stops by itself. */
  playing: () => boolean;
  /** Apply virtual-clock expirations before the DOM or sensors read state. */
  syncTime: () => void;
}

export function createSimApp(
  pick: <T>(arr: T[]) => T,
  now: () => number = () => 0
): SimApp {
  const state: SimState = {
    moduleId: "create",
    tabId: "construct",
    seqLen: 0,
    isPlaying: false,
    activeEffects: new Set(),
    viewerOpen: false,
    propDrawerOpen: false,
    actionsPanelOpen: false,
    continuousOnly: false,
    stepEditorOpen: false,
    currentStep: 0,
    browseFilters: 0,
    filterPopoverOpen: false,
    blockerUp: true,
    word: "",
    playingUntil: 0,
    practiceOn: false,
    mirrorOn: false,
    confirmUp: false,
    presentingUntil: 0,
    turnPresses: 0,
    clears: 0,
    generatorTweaks: 0,
    peakSeqLen: 0,
    undoDepth: 0,
  };

  const presses: PressEvent[] = [];
  let generationSerial = 0;
  interface SequenceSnapshot {
    seqLen: number;
    word: string;
    currentStep: number;
    stepEditorOpen: boolean;
  }
  const history: SequenceSnapshot[] = [];

  function rememberSequence(): void {
    history.push({
      seqLen: state.seqLen,
      word: state.word,
      currentStep: state.currentStep,
      stepEditorOpen: state.stepEditorOpen,
    });
    state.undoDepth = history.length;
  }

  function replaceSequence(length: number, word = ""): void {
    rememberSequence();
    state.seqLen = length;
    state.word = word;
    state.currentStep = 0;
    state.stepEditorOpen = false;
    state.isPlaying = false;
    state.playingUntil = 0;
  }

  /**
   * Built as an HTML string on purpose: the shared vitest setup replaces
   * `document.createElement` with a plain object fake for every tag, so nodes
   * made that way cannot be appended. The parser path is untouched by it.
   */
  function el(kind: string, label: string, index: number): string {
    const active =
      kind === "effect" && state.activeEffects.has(label)
        ? " data-ghost-active"
        : "";
    const playing =
      kind === "stage" && state.isPlaying ? ' data-ghost-state="playing"' : "";
    const disabled =
      kind === "step-nav" &&
      ((label.startsWith("Previous") && state.currentStep === 0) ||
        (label.startsWith("Next") && state.currentStep >= state.seqLen - 1))
        ? " disabled"
        : "";
    return (
      `<button data-ghost="safe" data-ghost-kind="${kind}" ` +
      `data-ghost-label="${label}" data-sim-index="${index}"${active}${playing}${disabled}>${label}</button>`
    );
  }

  function render(): void {
    const html: string[] = [];

    // The sidebar. Hidden by an immersive module or an overlay, exactly like
    // the real one — that is what makes escape-room reachable.
    const immersive = state.moduleId === "museum";
    if (!state.viewerOpen && !state.confirmUp && !immersive) {
      html.push(`<aside class="ac-sidebar collapsed ghost-hover-boundary">`);
      for (const id of SIM_MODULES) {
        html.push(
          `<button class="module-button${state.moduleId === id ? " active" : ""}" ` +
            `data-tour-module="${id}" data-ghost-label="${id}">` +
            `<span class="module-label">${id}</span></button>`
        );
      }
      if (state.moduleId === "create") {
        for (const tab of ["construct", "generate"]) {
          html.push(
            `<button class="section-button${state.tabId === tab ? " active" : ""}" ` +
              `data-sim-tab="${tab}" data-ghost-label="${tab}" aria-label="${tab}">` +
              `<span class="section-label">${tab}</span></button>`
          );
        }
      }
      html.push(`</aside>`);
    }

    for (const [kind, count] of Object.entries(screenKinds(state))) {
      for (let i = 0; i < count; i++) {
        const pool = LABELS[kind] ?? [kind];
        html.push(el(kind, pool[i % pool.length]!, i));
      }
    }

    /*
     * Something worth just watching — but ONLY on a screen that actually has a
     * stage. `activeEffects` is global state, so an earlier version rendered
     * this in the museum and in empty rooms too, where linger became the only
     * satisfiable intention and won 78% of every decision in the session.
     * In the real app data-ghost-linger lives on specific surfaces (the stage,
     * MandalaPane); it does not follow the ghost around the building.
     */
    const hasStage = (screenKinds(state).stage ?? 0) > 0;
    if (hasStage && (state.isPlaying || state.activeEffects.size > 0)) {
      html.push(`<div data-ghost-linger data-ghost-label="the stage"></div>`);
    }

    document.body.innerHTML = html.join("");
  }

  function goTo(moduleId: string, tabId: string | null = null): void {
    if (moduleId !== "browse" && moduleId !== "library") {
      state.browseFilters = 0;
      state.filterPopoverOpen = false;
    }
    state.moduleId = moduleId;
    state.tabId = moduleId === "create" ? (tabId ?? "construct") : tabId;
    state.viewerOpen = false;
    render();
  }

  function press(node: HTMLElement): void {
    const kind = node.getAttribute("data-ghost-kind");
    const label = node.getAttribute("data-ghost-label") ?? "";

    if (node.classList.contains("module-button")) {
      goTo(node.getAttribute("data-tour-module")!);
      presses.push({ kind: "nav-module", label, moduleId: state.moduleId });
      return;
    }
    if (node.classList.contains("section-button")) {
      state.tabId = node.getAttribute("data-sim-tab");
      presses.push({ kind: "nav-tab", label, moduleId: state.moduleId });
      render();
      return;
    }
    if (!kind) return;

    presses.push({ kind, label, moduleId: state.moduleId });

    switch (kind) {
      case "start-placement":
        replaceSequence(1);
        break;
      case "option":
        rememberSequence();
        state.seqLen += 1;
        break;
      case "generate": {
        // A whole sequence at once — the thing the generate tab is for.
        generationSerial += 1;
        const length = 4 + (pick([0, 2, 4, 8]) ?? 0);
        const generatedWord = ["XWSPGDBA", "SGWAPBDX", "PDXABWGS"][
          (generationSerial - 1) % 3
        ]!;
        replaceSequence(length, generatedWord.slice(0, Math.min(8, length)));
        break;
      }
      case "generate-option":
        state.generatorTweaks += 1;
        break;
      case "turn":
        state.turnPresses += 1;
        break;
      case "clear":
        state.confirmUp = true;
        break;
      case "confirm":
        state.confirmUp = false;
        replaceSequence(0);
        state.activeEffects.clear();
        state.clears += 1;
        break;
      case "play":
        state.isPlaying = !state.isPlaying;
        // A sequence takes about a second a step and then stops on its own.
        state.playingUntil = state.isPlaying ? now() + state.seqLen * 1000 : 0;
        break;
      case "effect":
        if (state.activeEffects.has(label)) state.activeEffects.delete(label);
        else state.activeEffects.add(label);
        break;
      case "step-cell":
        // Selecting a step is what opens its editor.
        state.currentStep = Number(node.getAttribute("data-sim-index") ?? 0);
        state.stepEditorOpen = true;
        break;
      case "step-edit":
        rememberSequence();
        state.word = `${state.word || simBaseWord(state.seqLen)}*`;
        break;
      case "step-nav":
        state.currentStep = label.startsWith("Next")
          ? Math.min(state.seqLen - 1, state.currentStep + 1)
          : Math.max(0, state.currentStep - 1);
        break;
      case "browse-filter":
        state.filterPopoverOpen = !state.filterPopoverOpen;
        break;
      case "filter-option":
        // Choosing applies the filter AND closes the popover, like handleSelect.
        state.filterPopoverOpen = false;
        // Index 0 is the "All" reset in these popovers.
        state.browseFilters =
          node.getAttribute("data-sim-index") === "0"
            ? 0
            : state.browseFilters + 1;
        break;
      case "browse-section":
        break;
      case "dismiss":
        state.blockerUp = false;
        break;
      case "option-filter":
        state.continuousOnly = !state.continuousOnly;
        break;
      case "sequence-actions":
        state.actionsPanelOpen = true;
        break;
      case "extend":
        // Completes the loop: the sequence comes back round to its start.
        rememberSequence();
        state.seqLen = state.seqLen * 2;
        break;
      case "transform":
        // Same steps, different sequence — length unchanged, word changed,
        // which is exactly the evidence `transformation` learns from.
        rememberSequence();
        state.word = `${state.word || simBaseWord(state.seqLen)}'`;
        break;
      case "undo": {
        const previous = history.pop();
        if (previous) {
          state.seqLen = previous.seqLen;
          state.word = previous.word;
          state.currentStep = previous.currentStep;
          state.stepEditorOpen = previous.stepEditorOpen;
        }
        state.undoDepth = history.length;
        break;
      }
      case "prop-picker":
        state.propDrawerOpen = true;
        break;
      case "prop":
        state.propDrawerOpen = false;
        break;
      case "viewer":
        state.viewerOpen = true;
        break;
      case "close-overlay":
        state.viewerOpen = false;
        break;
      case "practice":
        state.practiceOn = true;
        break;
      case "mirror":
        state.mirrorOn = true;
        break;
      case "practice-stop":
        state.practiceOn = false;
        state.mirrorOn = false;
        break;
      case "docent":
        // The module takes over and walks the room for a while. `presenting` is
        // what tells the ghost to stand back rather than keep pressing.
        state.presentingUntil = now() + 90_000;
        break;
      case "curio":
        // A curio opens something ephemeral. Nothing structural changes.
        break;
      case "gallery-item":
        replaceSequence(4 + (pick([0, 1, 2, 3]) ?? 0));
        break;
      default:
        break;
    }

    state.peakSeqLen = Math.max(state.peakSeqLen, state.seqLen);
    render();
  }

  function syncTime(): void {
    if (state.isPlaying && now() >= state.playingUntil) {
      state.isPlaying = false;
      state.playingUntil = 0;
      render();
    }
  }

  render();
  return {
    state,
    render,
    press,
    goTo,
    presses,
    presenting: () => now() < state.presentingUntil,
    playing: () => {
      syncTime();
      return state.isPlaying;
    },
    syncTime,
  };
}
