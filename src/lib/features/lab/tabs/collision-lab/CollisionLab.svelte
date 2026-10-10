<script lang="ts">

import { getCollisionLabPoseLabelRepository } from "#lib/features/lab/tabs/collision-lab/get-collision-lab-pose-label-repository.js";
import { enumerateDiamondInOut } from "#lib/features/lab/tabs/collision-lab/services/diamond-pose-enumerator.js";
import { getStanceCandidateGenerator } from "#lib/features/lab/tabs/collision-lab/get-stance-candidate-generator.js";
import { getStanceOptimizer } from "#lib/features/lab/tabs/collision-lab/get-stance-optimizer.js";
  /**
   * CollisionLab
   *
   * Root component for the collision lab tab. Resolves services from the
   * DI constructs state, sets context, and wires keyboard
   * shortcuts. Child components consume state via getCollisionLabContext.
   */

  import { onMount, onDestroy } from "svelte";
  import {
    createCollisionLabState,
    type CollisionLabState,
  } from "./state/collision-lab-state.svelte";
  import { setCollisionLabContext } from "./context/collision-lab-context";
  import PoseViewport from "./components/PoseViewport.svelte";
  import PoseScrubber from "./components/PoseScrubber.svelte";
  import CollisionReadout from "./components/CollisionReadout.svelte";
  import LabelControls from "./components/LabelControls.svelte";
  import StanceControls from "./components/StanceControls.svelte";
  import DiagnosticPanel from "./components/DiagnosticPanel.svelte";
  import CandidateGrid from "./components/CandidateGrid.svelte";
  import type { LabelStatus } from "./domain/types";

  let labState = $state<CollisionLabState | null>(null);
  let loadError = $state<string | null>(null);

  // Context must be registered during synchronous component initialization.
  // The holder uses a getter so child components see the state once it's
  // loaded. Children are gated on labState != null in the template below,
  // so the "state not ready" error path should never fire in practice.
  setCollisionLabContext({
    get state() {
      if (!labState) {
        throw new Error(
          "collision-lab state accessed before initialization completed"
        );
      }
      return labState;
    },
  });

  const hotkeyToStatus: Record<string, LabelStatus> = {
    "1": "clear",
    "2": "needs-adjustment",
    "3": "unreachable",
    "4": "skip",
  };

  // Stance is now adjusted via sliders in StanceControls; no preset hotkeys.
  // The only single-key shortcut for stance is `0` → reset to center.

  function handleKeydown(ev: KeyboardEvent) {
    const s = labState;
    if (!s) return;
    // Ignore hotkeys when a form element has focus
    const tag = (ev.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (ev.key === "ArrowRight") {
      s.stepForward();
      ev.preventDefault();
      return;
    }
    if (ev.key === "ArrowLeft") {
      s.stepBackward();
      ev.preventDefault();
      return;
    }
    if (hotkeyToStatus[ev.key]) {
      s.labelCurrent(hotkeyToStatus[ev.key]!);
      ev.preventDefault();
      return;
    }
    if (ev.key === "0") {
      s.resetStance();
      ev.preventDefault();
    }
  }

  onMount(async () => {
    try {
      const repo = getCollisionLabPoseLabelRepository();
      const optimizer = getStanceOptimizer();
      const candidateGenerator = getStanceCandidateGenerator();
      labState = await createCollisionLabState(
        { enumerateDiamondInOut },
        repo,
        optimizer,
        candidateGenerator
      );
    } catch (e) {
      loadError = (e as Error).message;
      console.error("CollisionLab: failed to initialize", e);
    }
    window.addEventListener("keydown", handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleKeydown);
  });
</script>

{#if loadError}
  <div class="error">
    Failed to load Collision Lab: {loadError}
  </div>
{:else if !labState}
  <div class="loading">Loading pose catalog…</div>
{:else}
  <div class="collision-lab">
    <!--
      Split-screen main area: big viewer on the left, 2×3 candidate grid
      on the right. Both fill the remaining viewport height. The grid is
      wide enough that all six cards are visible without scrolling.
    -->
    <div class="viewer">
      <PoseViewport />
    </div>
    <div class="grid">
      <CandidateGrid />
    </div>

    <!--
      Sliders: always visible so the reviewer can see the current stance
      values. Disabled state only dims opacity when no candidate is picked.
    -->
    <div class="sliders">
      <StanceControls />
    </div>

    <!--
      Bottom toolbar row: diagnostic tools + collision readout + label
      buttons, all side by side. Everything the reviewer needs without
      scrolling or collapsing.
    -->
    <div class="bottom-bar">
      <DiagnosticPanel />
      <CollisionReadout />
      <LabelControls />
    </div>

    <!-- Pose scrubber (nav + filters + progress) lives at the very bottom. -->
    <footer class="footer">
      <PoseScrubber />
    </footer>
  </div>
{/if}

<style>
  .collision-lab {
    display: grid;
    /* Viewer slightly wider than the grid so candidates aren't cramped
       but the big preview still gets prominence. */
    grid-template-columns: 1.2fr 1fr;
    /* Rows: [viewer+grid] fills available space, everything else sizes
       to its content. */
    grid-template-rows: minmax(0, 1fr) auto auto auto;
    grid-template-areas:
      "viewer grid"
      "sliders sliders"
      "bottombar bottombar"
      "footer footer";
    gap: 10px;
    padding: 10px;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    container-type: inline-size;
  }
  .viewer {
    grid-area: viewer;
    min-height: 0;
    min-width: 0;
  }
  .grid {
    grid-area: grid;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }
  .sliders {
    grid-area: sliders;
  }
  .bottom-bar {
    grid-area: bottombar;
    display: grid;
    /*
      Three equal columns so diagnostic / collision / labels each take
      one-third of the width. Avoids the old `auto 1fr auto` that
      stretched the collision readout to a giant pill in the middle.
    */
    grid-template-columns: minmax(260px, 1fr) minmax(240px, 1fr) minmax(280px, 1fr);
    gap: 10px;
    align-items: stretch;
  }
  .footer {
    grid-area: footer;
  }

  /* Stack vertically on narrow screens (tablet / portrait). */
  @container (max-width: 900px) {
    .collision-lab {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(280px, 0.9fr) minmax(280px, 1fr) auto auto auto;
      grid-template-areas:
        "viewer"
        "grid"
        "sliders"
        "bottombar"
        "footer";
    }
    .bottom-bar {
      grid-template-columns: 1fr;
    }
  }

  .loading,
  .error {
    padding: 32px;
    text-align: center;
    opacity: 0.7;
  }
  .error {
    color: #ef4444;
  }
</style>
