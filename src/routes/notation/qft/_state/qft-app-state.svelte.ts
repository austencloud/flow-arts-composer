import { untrack } from "svelte";
import {
  ALL_LAYERS,
  LAYER_KEYS,
  NO_LAYERS,
  allLayersOn,
  type QftLayers,
} from "#lib/shared/notation/qft/qft-layers.js";
import { GUIDE_MOVES } from "#lib/shared/notation/qft/qft-guide.js";
import {
  activeHandsAreValid,
  buildActiveHands,
  selectedFlowerIndex,
  selectedPresetId,
  validOriginPhases,
  validVtgModes,
} from "#lib/shared/notation/qft/qft-app-selection.js";
import {
  buildTrajectoryIncrements,
  type QftTrajectory,
} from "#lib/shared/notation/qft/qft-trajectory.js";
import type {
  QftHandCount,
  QftSession,
  QftSessionHand,
} from "#lib/shared/notation/qft/qft-session.js";
import type { VtgMode } from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";

export interface QftAppStateDeps {
  loadSession: () => QftSession | null;
  saveSession: (session: QftSession) => void;
}

const DEFAULT_LEFT: QftSessionHand = {
  source: { kind: "flower", index: 6 },
  radius: 1,
};

const DEFAULT_RIGHT: QftSessionHand = {
  source: { kind: "flower", index: 7 },
  radius: 1,
};

const STEP_MS = 1100;
const RAMP_MS = 380;
const SCRUB_MS = 340;
const ONE_HAND_DOCK_TABS = new Set([
  "shape",
  "presets",
  "start",
  "table",
  "layers",
]);
const TWO_HAND_DOCK_TABS = new Set([
  "left",
  "right",
  "timing",
  "table",
  "layers",
]);

function copyTrajectory(trajectory: QftTrajectory): QftTrajectory {
  return {
    ...trajectory,
    propRate: [...trajectory.propRate] as QftTrajectory["propRate"],
  };
}

function copyHand(hand: QftSessionHand): QftSessionHand {
  return {
    radius: hand.radius,
    source:
      hand.source.kind === "custom"
        ? {
            kind: "custom",
            trajectory: copyTrajectory(hand.source.trajectory),
          }
        : { ...hand.source },
  };
}

const easeOut = (value: number) => 1 - (1 - value) ** 3;

export function createQftAppState(deps: QftAppStateDeps) {
  const restored = deps.loadSession();

  let entered = $state(restored?.entered ?? false);
  let handCount = $state<QftHandCount>(restored?.handCount ?? "two");
  let left = $state<QftSessionHand>(copyHand(restored?.left ?? DEFAULT_LEFT));
  let right = $state<QftSessionHand>(copyHand(restored?.right ?? DEFAULT_RIGHT));
  let originPhase = $state(restored?.originPhase ?? 0);
  let vtgMode = $state<VtgMode>(restored?.vtgMode ?? "SS");
  let layers = $state<QftLayers>({ ...(restored?.layers ?? ALL_LAYERS) });

  let showInfo = $state(false);
  let showArchive = $state(false);
  let dockTab = $state<string | null>(null);

  let cursor = $state(restored?.cursor ?? 0);
  let playing = $state(restored?.playing ?? true);
  let animating = $state(false);
  let velocity = 0;
  let scrubbing = false;
  let scrubFrom = 0;
  let scrubTo = 0;
  let scrubStart = 0;

  let phone = $state(false);
  let compact = $state(false);
  let tableCompact = $state(false);

  const position = $derived(((cursor % 8) + 8) % 8);
  const step = $derived(Math.floor(position) % 8);
  const hands = $derived(
    buildActiveHands(handCount, left, right, vtgMode, originPhase)
  );
  const leftIncrements = $derived(buildTrajectoryIncrements(hands.left));
  const rightIncrements = $derived(
    hands.right ? buildTrajectoryIncrements(hands.right) : null
  );
  const allowedOrigins = $derived(
    validOriginPhases(handCount, left, right, vtgMode)
  );
  const allowedModes = $derived(validVtgModes(left, right, originPhase));
  const allStageLayersOn = $derived(allLayersOn(layers));

  function normalizeConfiguration(): void {
    if (
      activeHandsAreValid(
        buildActiveHands(handCount, left, right, vtgMode, originPhase)
      )
    ) {
      return;
    }

    const nextModes = validVtgModes(left, right, 0);
    vtgMode = nextModes.includes(vtgMode) ? vtgMode : (nextModes[0] ?? "TS");
    originPhase = validOriginPhases(handCount, left, right, vtgMode)[0] ?? 0;
  }

  function setHandCount(next: QftHandCount): void {
    handCount = next;
    dockTab = null;
    normalizeConfiguration();
  }

  function selectFlower(hand: "left" | "right", index: number): void {
    const current = hand === "left" ? left : right;
    const next: QftSessionHand = {
      ...current,
      source: { kind: "flower", index },
    };
    if (hand === "left") left = next;
    else right = next;
    normalizeConfiguration();
  }

  function selectPreset(hand: "left" | "right", id: string): void {
    const move = GUIDE_MOVES.find((candidate) => candidate.id === id);
    if (!move) return;
    const next: QftSessionHand = {
      source: { kind: "preset", id },
      radius: move.trajectory.radius,
    };
    if (hand === "left") left = next;
    else right = next;
    normalizeConfiguration();
  }

  function setRadius(hand: "left" | "right", radius: number): void {
    const nextRadius = Math.max(0, Math.min(1.5, radius));
    if (hand === "left") left = { ...left, radius: nextRadius };
    else right = { ...right, radius: nextRadius };
  }

  function setOriginPhase(next: number): void {
    if (allowedOrigins.includes(next)) originPhase = next;
  }

  function setVtgMode(next: VtgMode): void {
    if (allowedModes.includes(next)) vtgMode = next;
  }

  function toggleLayer(key: keyof QftLayers): void {
    layers = { ...layers, [key]: !layers[key] };
  }

  function toggleAllLayers(): void {
    layers = allStageLayersOn ? { ...NO_LAYERS } : { ...ALL_LAYERS };
  }

  function toggleDockTab(id: string): void {
    dockTab = dockTab === id ? null : id;
  }

  const reducedMotion = () =>
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  function stepBy(delta: number): void {
    playing = false;
    velocity = 0;
    const base = scrubbing ? scrubTo : Math.floor(cursor);
    const target = base + delta;

    if (reducedMotion()) {
      cursor = target;
      scrubbing = false;
      return;
    }

    scrubFrom = cursor;
    scrubTo = target;
    scrubStart = performance.now();
    scrubbing = true;
    animating = true;
  }

  function togglePlayback(): void {
    playing = !playing;
  }

  function snapshot(): QftSession {
    return {
      entered,
      handCount,
      left: copyHand(left),
      right: copyHand(right),
      originPhase,
      vtgMode,
      cursor: position,
      playing,
      layers: { ...layers },
    };
  }

  $effect(() => {
    const query = matchMedia("(max-width: 48rem)");
    const sync = () => (phone = query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  });

  $effect(() => {
    const query = matchMedia("(max-width: 64rem), (max-height: 36rem)");
    const sync = () => (compact = query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  });

  $effect(() => {
    const query = matchMedia("(max-width: 48rem), (max-height: 54rem)");
    const sync = () => (tableCompact = query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  });

  $effect(() => {
    const allowed =
      handCount === "one" ? ONE_HAND_DOCK_TABS : TWO_HAND_DOCK_TABS;
    if (dockTab && !allowed.has(dockTab)) dockTab = null;
  });

  $effect(() => {
    void [entered, handCount, left, right, originPhase, vtgMode, playing, layers];
    deps.saveSession(untrack(snapshot));
  });

  $effect(() => {
    const id = setInterval(() => deps.saveSession(snapshot()), 500);
    const flush = () => deps.saveSession(snapshot());
    addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      clearInterval(id);
      removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  });

  $effect(() => {
    if (playing && reducedMotion()) {
      playing = false;
      return;
    }
    if (playing) animating = true;
  });

  $effect(() => {
    if (!animating) return;

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(64, now - last);
      last = now;

      if (scrubbing) {
        const progress = Math.min(1, (now - scrubStart) / SCRUB_MS);
        cursor = scrubFrom + (scrubTo - scrubFrom) * easeOut(progress);
        if (progress >= 1) {
          cursor = scrubTo;
          scrubbing = false;
        }
      } else {
        const targetVelocity = playing ? 1 : 0;
        velocity += (targetVelocity - velocity) * Math.min(1, delta / RAMP_MS);
        if (velocity < 0.001 && !playing) {
          velocity = 0;
          animating = false;
          return;
        }
        cursor += (velocity * delta) / STEP_MS;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });

  return {
    get entered() {
      return entered;
    },
    get handCount() {
      return handCount;
    },
    get left() {
      return left;
    },
    get right() {
      return right;
    },
    get leftTrajectory() {
      return hands.left;
    },
    get rightTrajectory() {
      return hands.right;
    },
    get leftIncrements() {
      return leftIncrements;
    },
    get rightIncrements() {
      return rightIncrements;
    },
    get leftFlowerIndex() {
      return selectedFlowerIndex(left);
    },
    get rightFlowerIndex() {
      return selectedFlowerIndex(right);
    },
    get leftPresetId() {
      return selectedPresetId(left);
    },
    get rightPresetId() {
      return selectedPresetId(right);
    },
    get originPhase() {
      return originPhase;
    },
    get validOriginPhases() {
      return allowedOrigins;
    },
    get vtgMode() {
      return vtgMode;
    },
    get validVtgModes() {
      return allowedModes;
    },
    get position() {
      return position;
    },
    get step() {
      return step;
    },
    get playing() {
      return playing;
    },
    get layers() {
      return layers;
    },
    get allLayersOn() {
      return allStageLayersOn;
    },
    get showInfo() {
      return showInfo;
    },
    get showArchive() {
      return showArchive;
    },
    get dockTab() {
      return dockTab;
    },
    get phone() {
      return phone;
    },
    get compact() {
      return compact;
    },
    get tableCompact() {
      return tableCompact;
    },
    get layerKeys() {
      return LAYER_KEYS;
    },
    enter() {
      entered = true;
    },
    setHandCount,
    selectFlower,
    selectPreset,
    setRadius,
    setOriginPhase,
    setVtgMode,
    toggleLayer,
    toggleAllLayers,
    toggleDockTab,
    stepBy,
    togglePlayback,
    openInfo() {
      showInfo = true;
    },
    closeInfo() {
      showInfo = false;
    },
    openArchive() {
      showArchive = true;
    },
    closeArchive() {
      showArchive = false;
    },
  };
}

export type QftAppState = ReturnType<typeof createQftAppState>;
