<script lang="ts">
  import { onMount } from "svelte";
  import { loadShapeMatrix } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";

  import { setShapeMatrixAppContext } from "./context/shape-matrix-app-context";
  import ShapeMatrixAboutModal from "./components/ShapeMatrixAboutModal.svelte";
  import ShapeMatrixAppShell from "./components/ShapeMatrixAppShell.svelte";
  import {
    createShapeMatrixAppState,
    type ShapeMatrixAppPersistence,
  } from "./state/shape-matrix-app-state.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { DEFAULT_THEORY_RATIO } from "$lib/shared/shape-matrix/domain/theory-ratio";

  interface Props {
    persistence?: ShapeMatrixAppPersistence;
    /**
     * "standalone" hosts (the public /shape-engine route) carry the
     * app's own identity block in the header. "embedded" hosts (the Toys tab)
     * already name the surface through module chrome, so the header drops the
     * title and leads with the controls.
     */
    variant?: "standalone" | "embedded";
  }

  let { persistence, variant = "standalone" }: Props = $props();
  let host: HTMLDivElement;
  let shell: ShapeMatrixAppShell | undefined;

  export function handleBack(): boolean {
    return shell?.handleBack() ?? false;
  }
  const state = createShapeMatrixAppState(
    {
      loadMatrix: loadShapeMatrix,
      syncState: (snapshot) => persistence?.persist(snapshot),
      link: persistence?.link,
    },
    {
      surface: "matrix",
      theoryLeftRatio: DEFAULT_THEORY_RATIO,
      theoryRightRatio: DEFAULT_THEORY_RATIO,
      theoryMode: "SS",
      theoryPair: null,
      level: 2,
      leftTurn: 2,
      rightTurn: 2,
      activeAxis: "both",
      labelMode: "turns",
      propType: PropType.STAFF,
      pair: null,
      mode: null,
      propMode: null,
      solo: null,
    },
    false
  );
  setShapeMatrixAppContext(state);

  onMount(() => {
    const restored = persistence?.restore() ?? null;
    if (restored) state.restoreState(restored);

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

    return () => observer.disconnect();
  });
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
