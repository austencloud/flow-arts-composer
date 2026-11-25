import { untrack } from "svelte";
import {
  ALL_LAYERS,
  LAYER_KEYS,
  NO_LAYERS,
  allLayersOn,
  type QftLayers,
} from "#lib/shared/notation/qft/qft-layers.js";
import { QFT_PRESETS } from "#lib/shared/notation/qft/qft-presets.js";
import {
  readHandRelations,
  createRoundClock,
  realPace,
  DEFAULT_POI_LENGTH,
  buildTrajectoryIncrements,
  type QftTrajectory,
  type VtgMode,
} from "@tka/shape-domain";
import {
  activeHandsAreValid,
  buildActiveHands,
  minHandRadius,
  resolveSessionHand,
  selectedFlowerIndex,
  selectedPresetId,
  validOriginPhases,
  validVtgModes,
} from "#lib/shared/notation/qft/qft-app-selection.js";
import {
  MAX_POI_LENGTH,
  MAX_SPEED,
  MIN_POI_LENGTH,
  MIN_SPEED,
  type QftHandCount,
  type QftSession,
  type QftSessionHand,
} from "#lib/shared/notation/qft/qft-session.js";

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

const MAX_FRAME_MS = 400;
const RAMP_MS = 380;
const SCRUB_MS = 340;
/** How long a swing takes to come back up to speed after stepping. */
const SWING_RETURN_MS = 2400;
const ONE_HAND_DOCK_TABS = new Set([
  "shape",
  "presets",
  "start",
  "speed",
  "table",
  "layers",
]);
const TWO_HAND_DOCK_TABS = new Set([
  "left",
  "right",
  "timing",
  "speed",
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
  let right = $state<QftSessionHand>(
    copyHand(restored?.right ?? DEFAULT_RIGHT)
  );
  let originPhase = $state(restored?.originPhase ?? 0);
  let vtgMode = $state<VtgMode>(restored?.vtgMode ?? "SS");
  let layers = $state<QftLayers>({ ...(restored?.layers ?? ALL_LAYERS) });

  let showInfo = $state(false);
  let showArchive = $state(false);
  let dockTab = $state<string | null>(null);

  let cursor = $state(restored?.cursor ?? 0);
  let speed = $state(restored?.speed ?? 1);
  let poiLength = $state(restored?.poiLength ?? DEFAULT_POI_LENGTH);
  let playing = $state(restored?.playing ?? true);
  let animating = $state(false);
  /* 1 plays swings at gravity's speed; 0 rests every hand on the notation. */
  let swing = $state(1);
  let swingFrom = 1;
  /* Steps a second; eased, so a new move never jerks to its speed. */
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
    buildActiveHands(handCount, left, right, vtgMode, originPhase) ?? {
      left: resolveSessionHand(left),
      right: handCount === "two" ? resolveSessionHand(right) : undefined,
    }
  );
  const pace = $derived(realPace(hands, poiLength));
  const roundSeconds = $derived(pace.seconds / speed);
  const leftClock = $derived(
    createRoundClock(hands.left, roundSeconds, poiLength)
  );
  const rightClock = $derived(
    hands.right ? createRoundClock(hands.right, roundSeconds, poiLength) : null
  );
  const swung = (clock: (time: number) => number) =>
    (((position + (clock(position) - position) * swing) % 8) + 8) % 8;
  const leftCursor = $derived(swung(leftClock));
  const rightCursor = $derived(rightClock ? swung(rightClock) : position);
  const handRelations = $derived(
    hands.right ? readHandRelations(hands.left, hands.right) : []
  );
  const leftIncrements = $derived(buildTrajectoryIncrements(hands.left));
  const rightIncrements = $derived(
    hands.right ? buildTrajectoryIncrements(hands.right) : null
  );
  const allowedOrigins = $derived(
    validOriginPhases(handCount, left, right, vtgMode)
  );
  const allowedModes = $derived(validVtgModes(left, right));
  const allStageLayersOn = $derived(allLayersOn(layers));

  function normalizeConfiguration(): void {
    if (
      activeHandsAreValid(
        buildActiveHands(handCount, left, right, vtgMode, originPhase)
      )
    ) {
      return;
    }

    const nextModes = validVtgModes(left, right);
    vtgMode = nextModes.includes(vtgMode) ? vtgMode : (nextModes[0] ?? "TS");
    originPhase = validOriginPhases(handCount, left, right, vtgMode)[0] ?? 0;
  }

  /* A session saved under an older rule can hold a swing that is now refused. */
  left.radius = Math.max(minHandRadius(left), left.radius);
  right.radius = Math.max(minHandRadius(right), right.radius);
  normalizeConfiguration();

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
    const move = QFT_PRESETS.find((candidate) => candidate.id === id);
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
    const current = hand === "left" ? left : right;
    const nextRadius = Math.max(minHandRadius(current), Math.min(1.5, radius));
    if (hand === "left") left = { ...left, radius: nextRadius };
    else right = { ...right, radius: nextRadius };
  }

  function setOriginPhase(next: number): void {
    if (allowedOrigins.includes(next)) originPhase = next;
  }

  function setVtgMode(next: VtgMode): void {
    if (!allowedModes.includes(next)) return;
    vtgMode = next;
    /* A swing can only begin this way from some places; move there. */
    normalizeConfiguration();
  }

  function setSpeed(next: number): void {
    speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, next));
  }

  function setPoiLength(next: number): void {
    poiLength = Math.max(MIN_POI_LENGTH, Math.min(MAX_POI_LENGTH, next));
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
      swing = 0;
      scrubbing = false;
      return;
    }

    scrubFrom = cursor;
    scrubTo = target;
    scrubStart = performance.now();
    swingFrom = swing;
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
      speed,
      poiLength,
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
    void [
      entered,
      handCount,
      left,
      right,
      originPhase,
      vtgMode,
      speed,
      poiLength,
      playing,
      layers,
    ];
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
      /* Only a long pause is cut short: a busy computer must not slow the poi. */
      const delta = Math.min(MAX_FRAME_MS, now - last);
      last = now;

      if (scrubbing) {
        const progress = Math.min(1, (now - scrubStart) / SCRUB_MS);
        cursor = scrubFrom + (scrubTo - scrubFrom) * easeOut(progress);
        swing = swingFrom * (1 - easeOut(progress));
        if (progress >= 1) {
          cursor = scrubTo;
          scrubbing = false;
        }
      } else {
        const targetVelocity = playing ? 8 / roundSeconds : 0;
        velocity += (targetVelocity - velocity) * Math.min(1, delta / RAMP_MS);
        if (velocity < 0.001 && !playing) {
          velocity = 0;
          animating = false;
          return;
        }
        cursor += (velocity * delta) / 1000;
        if (playing) swing = Math.min(1, swing + delta / SWING_RETURN_MS);
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
    get leftCursor() {
      return leftCursor;
    },
    get rightCursor() {
      return rightCursor;
    },
    get handRelations() {
      return handRelations;
    },
    get speed() {
      return speed;
    },
    get poiLength() {
      return poiLength;
    },
    /** The slowest real speed of these hands, and who needs it. */
    get pace() {
      return pace;
    },
    get roundSeconds() {
      return roundSeconds;
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
    setSpeed,
    setPoiLength,
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
