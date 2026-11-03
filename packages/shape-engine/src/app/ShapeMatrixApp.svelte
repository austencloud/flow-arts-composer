<script lang="ts">
  import { onMount } from "svelte";
  import { loadShapeMatrix } from "../services/shape-matrix-flowers.js";
  import { SHAPE_MATRIX_DEFAULT_PROP } from "../services/prop-pair.js";

  import { setShapeMatrixAppContext } from "./context/shape-matrix-app-context";
  import ShapeMatrixAboutModal from "./components/ShapeMatrixAboutModal.svelte";
  import ShapeMatrixAppShell from "./components/ShapeMatrixAppShell.svelte";
  import {
    createShapeMatrixAppState,
    type ShapeMatrixAppPersistence,
    type ShapeMatrixPropSource,
  } from "./state/shape-matrix-app-state.svelte";
  import { followPropSource } from "./state/follow-prop-source.svelte";
  import {
    DEFAULT_ELEMENT_ICONS,
    setShapeEngineHostContext,
    type ShapeEngineVariant,
    type TracePick,
  } from "./context/shape-engine-host-context";
  import type { ShapeMatrixAppSnapshot } from "./state/shape-matrix-app-state.svelte";
  import type { ElementIcons } from "@tka/shape-domain";
  import {
    provideStrings,
    setStrings,
    type ShapeEngineStrings,
  } from "../strings.svelte.js";
  import { DEFAULT_THEORY_RATIO } from "@tka/shape-domain";
  import {
    SHAPE_MATRIX_DEFAULT_LEVEL,
    SHAPE_MATRIX_DEFAULT_TURN,
  } from "@tka/shape-domain";

  interface Props {
    persistence?: ShapeMatrixAppPersistence;
    /** Where the prop pair lives when a host owns it; absent on the standalone route. */
    propSource?: ShapeMatrixPropSource;
    /**
     * "standalone" hosts (the public /shape-engine route) carry the
     * app's own identity block in the header. "embedded" hosts (the Create
     * module's Shape tab) already name the surface through module chrome, so
     * the header drops the
     * title and leads with the controls. "mirror" hosts (the Poi Mirror
     * demo) trace a pick themselves: one Trace this action replaces Open,
     * Save, Share and Customize.
     */
    variant?: ShapeEngineVariant;
    /** The host's translations; anything left out falls back to English. */
    strings?: Partial<ShapeEngineStrings>;
    /** Where the app starts when `persistence` restores nothing. */
    initial?: Partial<ShapeMatrixAppSnapshot>;
    /** Element icon URLs; the Composer's own copies when left out. */
    icons?: ElementIcons;
    /** Mirror only: the pick to trace, from the Trace this action. */
    onTrace?: (pick: TracePick) => void;
    /** Mirror only: shows a Back action that returns to the host. */
    onBack?: () => void;
  }

  let {
    persistence,
    propSource,
    variant = "standalone",
    strings,
    initial,
    icons,
    onTrace,
    onBack,
  }: Props = $props();
  setShapeEngineHostContext({
    get variant() {
      return variant;
    },
    get icons() {
      return icons ?? DEFAULT_ELEMENT_ICONS;
    },
    get onTrace() {
      return onTrace;
    },
    get onBack() {
      return onBack;
    },
  });
  // svelte-ignore state_referenced_locally
  provideStrings(strings);
  // A host that switches language hands in new strings without remounting.
  $effect.pre(() => {
    setStrings(strings);
  });
  let host: HTMLDivElement;
  let shell: ShapeMatrixAppShell | undefined;

  export function handleBack(): boolean {
    return shell?.handleBack() ?? false;
  }
  const defaults: ShapeMatrixAppSnapshot = {
    surface: "matrix",
    theoryLeftRatio: DEFAULT_THEORY_RATIO,
    theoryRightRatio: DEFAULT_THEORY_RATIO,
    theoryMode: "SS",
    theoryPair: null,
    level: SHAPE_MATRIX_DEFAULT_LEVEL,
    leftTurn: SHAPE_MATRIX_DEFAULT_TURN,
    rightTurn: SHAPE_MATRIX_DEFAULT_TURN,
    activeAxis: "both",
    labelMode: "turns",
    leftPropType: propSource?.left ?? SHAPE_MATRIX_DEFAULT_PROP,
    rightPropType: propSource?.right ?? SHAPE_MATRIX_DEFAULT_PROP,
    pair: null,
    mode: null,
    propMode: null,
    solo: null,
  };
  const state = createShapeMatrixAppState(
    {
      loadMatrix: loadShapeMatrix,
      syncState: (snapshot) => persistence?.persist(snapshot),
      link: persistence?.link,
      onPropPairChange: propSource
        ? (pair, catDog) => propSource.set({ ...pair, catDog })
        : undefined,
    },
    defaults,
    false
  );
  setShapeMatrixAppContext(state);

  onMount(() => {
    // A host's own saved state wins over the starting point it hands in.
    const restored =
      persistence?.restore() ?? (initial ? { ...defaults, ...initial } : null);
    if (restored)
      state.restoreState(restored, { keepPropPair: propSource !== undefined });

    // The compact seam is the shell stylesheet's `(width < 75rem) or
    // (height < 42rem)` container query. Measuring in rem here, not fixed
    // pixels, keeps the compact markup and the compact styles switching on
    // the same frame when the root font size is anything but 16px.
    const applyLayout = (width: number, height: number) => {
      const rem =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const compact = width < 75 * rem || height < 42 * rem;
      state.setCompact(compact);
    };
    const bounds = host.getBoundingClientRect();
    applyLayout(bounds.width, bounds.height);

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      applyLayout(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(host);

    void state.load();

    return () => {
      observer.disconnect();
      // An orphaned load resolving after this tab closes would otherwise
      // still write its snapshot and its pair into settings.
      state.dispose();
    };
  });

  followPropSource(state, propSource);
</script>

<div class="shape-matrix-app-host" bind:this={host}>
  <ShapeMatrixAppShell {variant} bind:this={shell} />
  <ShapeMatrixAboutModal />
</div>

<style>
  .shape-matrix-app-host {
    container: shape-matrix-app / size;
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    color-scheme: dark;
  }
</style>
