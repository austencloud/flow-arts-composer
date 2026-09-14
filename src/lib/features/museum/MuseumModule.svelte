<script lang="ts">
  import { buildMuseumGrid } from "./services/museum-grid-builder";
  import { resolveRoomIsolation } from "./services/room-isolation";
  import { GRID_CONFIG } from "./data/museum-room-graph";
  // The museum's rooms come from the composition, not from the raw graph: the
  // graph still carries `vulcan-cave` as one placeholder room, and the walk
  // replaces it with the eleven authored cave rooms so the six element chambers
  // are part of the same building the visitor is already standing in.
  import {
    MUSEUM_WALK_ROOMS as MUSEUM_ROOMS,
    MUSEUM_WALK_EDGES as MUSEUM_EDGES,
    attachMuseumWalkTerrain,
  } from "./data/museum-walk";
  import { serializeGrid, deserializeGrid } from "./domain/museum-grid-types";
  import type { MuseumGrid } from "./domain/museum-grid-types";
  import { createSoundscapePlayer } from "./audio/soundscape-player.svelte";
  import { setSoundscapeContext } from "./audio/soundscape-context";
  import {
    destroyMuseumVillage,
    setMuseumVillageVisible,
  } from "./services/museum-village-manager";
  import RoomPicker from "./components/RoomPicker.svelte";
  import SoundscapeBubble from "./components/audio/SoundscapeBubble.svelte";
  import MuseumPerformanceOverlay from "./components/game/MuseumPerformanceOverlay.svelte";
  import ProgressBar from "$lib/shared/components/loading/ProgressBar.svelte";
  import { getMuseumPerformanceRecorder } from "./get-museum-performance-recorder";

  import { onMount, untrack } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { setDesktopSidebarForcedHidden } from "$lib/shared/layout/desktop-sidebar-state.svelte";
  import {
    suppressBackground,
    releaseBackground,
  } from "$lib/shared/background/shared/state/background-suppression.svelte";

  interface Props {
    /** False when mounted-but-hidden (keep-alive). Default true so the module
     *  behaves normally when rendered standalone or in tests. */
    visible?: boolean;
  }
  let { visible = true }: Props = $props();

  const performanceRecorder = getMuseumPerformanceRecorder();
  let showPerformanceDiagnostics = $derived(
    page.url.searchParams.get("museumPerf") === "1"
  );
  let performanceRecordingEnabled = $derived(
    visible && (import.meta.env.DEV || showPerformanceDiagnostics)
  );

  $effect(() => {
    if (!performanceRecordingEnabled) {
      performanceRecorder.stop();
      return;
    }
    performanceRecorder.start();
    return () => performanceRecorder.stop();
  });

  // A fade-from-black covers the scene until the lobby is ready. A progress
  // bar gives real feedback so a slow or stalled load is visible instead of a
  // bare icon on black. Two parallel load tracks feed it:
  //   - geometry build (tile bucketing → corridors → lobby → fixtures)
  //   - textures/models (Three.js DefaultLoadingManager, 0-1)
  let showOverlay = $state(true);
  let overlayFading = $state(false);

  let textureFraction = $state(0); // 0-1 from DefaultLoadingManager
  let geometryFraction = $state(0); // 0-1 derived from build-stage milestones
  let displayedPercent = $state(0); // monotonic 0-100 shown in the bar
  let stageLabel = $state("Opening the doors");

  // Build-stage strings (emitted by the geometry streamer) → completion
  // fraction + user-facing label. Stages fire in order as the lobby streams in.
  const STAGE_INFO: Record<string, { fraction: number; label: string }> = {
    "Tile bucketing": { fraction: 0.15, label: "Mapping the halls" },
    "Building corridors": { fraction: 0.4, label: "Carving corridors" },
    "Building lobby": { fraction: 0.7, label: "Raising the lobby" },
    "Mounting fixtures": { fraction: 0.9, label: "Hanging the exhibits" },
    "Warming 3D view": { fraction: 0.97, label: "Lighting the entrance" },
    "Drawing 3D preview": { fraction: 0.99, label: "Checking the 3D view" },
  };

  function handleLoadProgress(p: number) {
    if (p > textureFraction) textureFraction = p;
  }

  function handleBuildStage(stage: string) {
    const info = STAGE_INFO[stage];
    if (!info) return;
    stageLabel = info.label;
    if (info.fraction > geometryFraction) geometryFraction = info.fraction;
  }

  // Weighted blend — geometry build dominates the wait, textures fill the rest.
  // Clamped monotonic so the bar never jumps backward if a track resets.
  $effect(() => {
    const blended = (geometryFraction * 0.65 + textureFraction * 0.35) * 100;
    if (blended > displayedPercent) displayedPercent = blended;
  });

  function handleAllLoaded() {
    if (!showOverlay) return; // already revealed — ignore duplicate/late signals
    displayedPercent = 100;
    stageLabel = "Welcome";
    overlayFading = true;
    setTimeout(() => {
      showOverlay = false;
    }, 600);
  }

  // Defer heavy 3D component mount until AFTER the loading overlay has painted.
  // Two rAFs aren't enough - they can fire back-to-back before the browser paints
  // when the main thread is busy with module evaluation. setTimeout(0) properly
  // yields to the browser's task queue, ensuring the overlay is visible first.
  let deferredReady = $state(false);
  onMount(() => {
    // Pause the global animated background while the museum is open. Its rAF
    // runs even when fully occluded by the museum's WebGL canvas, and a trace
    // of the 2D->3D flip showed the ocean background eating ~40% of the main
    // thread behind the scene, stalling the transition. See spec
    // docs/superpowers/specs/2026-06-16-background-suppression-design.md.
    suppressBackground("museum");

    // rAF ensures we're past the first frame, setTimeout ensures the browser
    // has actually painted the overlay before we start the heavy 3D mount.
    // Hidden tabs do not receive animation frames, so waiting only on rAF can
    // strand the museum on its loading screen until the user returns. Move to
    // the task queue whenever the tab is hidden, including when it becomes
    // hidden while the first frame is still pending.
    let rafId = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const startDeferred = () => {
      rafId = 0;
      timeoutId = setTimeout(() => {
        timeoutId = null;
        deferredReady = true;
      }, 0);
    };
    const onVisibilityChange = () => {
      if (document.hidden && !deferredReady && rafId) {
        cancelAnimationFrame(rafId);
        startDeferred();
      }
    };
    if (document.hidden) {
      startDeferred();
    } else {
      rafId = requestAnimationFrame(startDeferred);
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId !== null) clearTimeout(timeoutId);
      // Resume the global animated background for the rest of the app.
      releaseBackground("museum");
      // Restore sidebar when leaving museum
      setDesktopSidebarForcedHidden(false);
      // Tear down the village sim - a module-scope singleton that would
      // otherwise keep its Three.js meshes alive across navigations.
      destroyMuseumVillage();
    };
  });

  // URL query param `?room=vulcan-cave` filters the museum to a single room.
  // null = full museum (all rooms + corridors).
  // Derived from SvelteKit's page store so it updates when goto() navigates.
  let selectedRoom = $derived(page.url.searchParams.get("room"));

  function handleRoomSelect(roomId: string | null) {
    const params = new URLSearchParams(window.location.search);
    if (roomId) {
      params.set("room", roomId);
    } else {
      params.delete("room");
    }
    const qs = params.toString();
    const newUrl = window.location.pathname + (qs ? `?${qs}` : "");
    goto(newUrl, { invalidateAll: true });
  }

  // ── Grid caching ──
  // The grid build pipeline (layout engine, corridor routing, wall derivation,
  // exhibit/performer placement) runs every mount. Caching the result to
  // sessionStorage eliminates this on repeat visits within the same session.
  // A hash of the input config detects changes and invalidates the cache.
  const GRID_CACHE_KEY = "museum-grid-cache";
  const GRID_HASH_KEY = "museum-grid-hash";

  function computeConfigHash(
    rooms: typeof MUSEUM_ROOMS,
    edges: typeof MUSEUM_EDGES
  ): string {
    // Include a version bump whenever layout logic changes (e.g. ROOM_SCALE)
    // layoutVersion 5: the authored Vulcan Cave replaced the placeholder room,
    // so every cached grid from before it is a museum with a hole in the middle.
    const input = JSON.stringify({
      rooms,
      edges,
      config: GRID_CONFIG,
      layoutVersion: 5,
    });
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return String(hash);
  }

  function loadCachedGrid(
    rooms: typeof MUSEUM_ROOMS,
    edges: typeof MUSEUM_EDGES
  ): MuseumGrid | null {
    try {
      const hash = sessionStorage.getItem(GRID_HASH_KEY);
      if (hash !== computeConfigHash(rooms, edges)) return null;
      const raw = sessionStorage.getItem(GRID_CACHE_KEY);
      if (!raw) return null;
      return deserializeGrid(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function cacheGrid(
    grid: MuseumGrid,
    rooms: typeof MUSEUM_ROOMS,
    edges: typeof MUSEUM_EDGES
  ): void {
    try {
      sessionStorage.setItem(GRID_HASH_KEY, computeConfigHash(rooms, edges));
      sessionStorage.setItem(
        GRID_CACHE_KEY,
        JSON.stringify(serializeGrid(grid))
      );
    } catch {
      /* sessionStorage full - non-critical */
    }
  }

  // Build grid for the given room filter. When a room is selected, we pass
  // that room's isolation group (usually just itself) plus the edges between
  // group members, so multi-room suites keep their internal corridors. When
  // null - or when the URL names a room the walk does not contain - the full
  // museum is built. See services/room-isolation.ts for why the fallback is
  // load-bearing rather than defensive padding.
  function buildGridForRoom(roomFilter: string | null): {
    grid: MuseumGrid;
    validation: { valid: boolean; errors: string[] };
  } {
    const isolation = resolveRoomIsolation(
      roomFilter,
      MUSEUM_ROOMS,
      MUSEUM_EDGES
    );
    const { rooms, edges } = isolation;

    if (isolation.unresolved) {
      console.warn(
        `Museum: no room named "${roomFilter}" - showing the whole museum.`
      );
    }

    // Only use cache for the full museum (isolated rooms are cheap to build)
    if (!roomFilter || isolation.unresolved) {
      const cached = loadCachedGrid(rooms, edges);
      if (cached) {
        // Terrain is behaviour, not tiles, and does not survive serialization.
        // Skip this and a cached museum is one where the Sundial's collapse
        // ring, the drowned gallery's shelf and the Moon's low gravity are all
        // flat floor.
        attachMuseumWalkTerrain(cached);
        return { grid: cached, validation: { valid: true, errors: [] } };
      }
    }

    const result = buildMuseumGrid(rooms, edges, GRID_CONFIG);
    attachMuseumWalkTerrain(result.grid);

    if (!roomFilter || isolation.unresolved) {
      cacheGrid(result.grid, rooms, edges);
    }

    return { grid: result.grid, validation: result.validation };
  }

  // Initial grid build
  let currentBuild = $derived.by(() => buildGridForRoom(selectedRoom));

  // Surface the grid from the reactive build
  let generatedGrid = $derived(currentBuild.grid);

  $effect(() => {
    if (!currentBuild.validation.valid) {
      console.error(
        "Museum layout validation failed:",
        currentBuild.validation.errors
      );
    }
  });

  // Museum design validation (dev only)
  // Runs inside $effect so generatedGrid is accessed reactively (avoids state_referenced_locally)
  if (import.meta.env.DEV) {
    $effect(() => {
      const grid = generatedGrid; // subscribe to derived grid
      import("./services/museum-design-validator").then(({ validateAll }) => {
        // Reconstruct PlacedRoom-like objects from grid wings + original room data
        const roomMap = new Map(MUSEUM_ROOMS.map((r) => [r.id, r]));
        const placedRooms = grid.wings.map((wing) => {
          const src = roomMap.get(wing.id);
          return {
            id: wing.id,
            name: wing.name,
            x: wing.bounds.x,
            y: wing.bounds.y,
            w: wing.bounds.width,
            h: wing.bounds.height,
            material: src?.material ?? "stone",
            theme: wing.theme,
            walls: src?.walls,
            performers: src?.performers,
          };
        });

        const violations = validateAll(placedRooms as any, MUSEUM_EDGES, grid);
        if (violations.length > 0) {
          console.group(
            "%c Museum Design Violations",
            "font-weight: bold; color: #d4b878"
          );
          for (const v of violations) {
            const icon =
              v.severity === "error"
                ? "X"
                : v.severity === "warning"
                  ? "!"
                  : "i";
            console.warn(`${icon} [${v.roomId}] ${v.rule}: ${v.message}`);
          }
          console.groupEnd();
        }
      });
    });
  }

  // The live grid starts from the generated walk and is replaced wholesale when
  // a developer isolates a room from the floating room picker.
  // Must use $state.raw: $state would deeply proxy 20k+ tiles, causing a
  // multi-second freeze on init. The grid is replaced wholesale (not mutated
  // in place), so shallow reactivity is correct.
  // Compute initial value eagerly to avoid capturing $derived in $state.raw initializer.
  const initialGrid = untrack(() => buildGridForRoom(selectedRoom).grid);
  let liveGrid = $state.raw<MuseumGrid>(initialGrid);

  // When the room selection changes, the derived generatedGrid updates.
  // Propagate that to liveGrid so the 3D scene rebuilds.
  $effect(() => {
    liveGrid = generatedGrid;
  });

  // Soundscape player - owns audio elements, crossfades on wing change.
  // Wing updates flow in via DimensionFlipProof's onWingChange callback.
  const soundscapePlayer = createSoundscapePlayer();
  setSoundscapeContext(soundscapePlayer);
  onMount(() => soundscapePlayer.initialize());

  // Keep-alive: drive sim pause AND the full-screen sidebar suppression off
  // `visible`, not mount lifetime. Under keep-alive the module stays mounted
  // when you leave museum, so the onMount cleanup no longer fires on a back
  // navigation — gating these on `visible` restores the sidebar (and resumes
  // the sim) the moment museum is hidden. Full teardown (destroyMuseumVillage)
  // still only runs on real unmount (idle eviction) via the onMount cleanup.
  $effect(() => {
    setMuseumVillageVisible(visible);
    setDesktopSidebarForcedHidden(visible);
  });
</script>

<div class="museum-module">
  <!-- Loading gate - brief fade-from-black until lobby is ready -->
  {#if showOverlay}
    <div
      class="museum-loading-overlay"
      class:fading={overlayFading}
      role="status"
      aria-live="polite"
    >
      <div class="overlay-icon">
        <i class="fas fa-landmark" aria-hidden="true"></i>
      </div>
      <div class="overlay-progress">
        <ProgressBar
          percent={displayedPercent}
          label={stageLabel}
          showPercent
          color="rgba(200, 180, 140, 0.85)"
          height={4}
        />
      </div>
    </div>
  {/if}

  <!-- Room picker - floating pill bar for room isolation -->
  {#if deferredReady}
    <RoomPicker {selectedRoom} onSelect={handleRoomSelect} />
  {/if}

  <!-- The walk is the Museum. It renders behind the opaque loading gate and is
       deferred long enough for that gate to reach the screen first. The visitor
       is on foot from the first frame; the 2D map is parked for now. -->
  {#if deferredReady}
    <div class="mode-content">
      {#key selectedRoom}
        {#await import("./components/game/DimensionFlipProof.svelte") then { default: DimensionFlipProof }}
          <DimensionFlipProof
            grid={liveGrid}
            edges={selectedRoom ? [] : MUSEUM_EDGES}
            {visible}
            onAllLoaded={handleAllLoaded}
            onLoadProgress={handleLoadProgress}
            onBuildStage={handleBuildStage}
            startInFps={true}
            onWingChange={(id) => soundscapePlayer.setCurrentWing(id)}
            {performanceRecordingEnabled}
          />
        {/await}
      {/key}
    </div>

    <!-- Floating music-player bubble - audition ambient tracks per wing -->
    <SoundscapeBubble />
  {/if}

  {#if showPerformanceDiagnostics}
    <MuseumPerformanceOverlay />
  {/if}
</div>

<style>
  .museum-module {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #0a0a0a;
    position: relative;
  }

  .mode-content {
    flex: 1;
    overflow: hidden;
  }

  /* Unified loading overlay - covers full module, fades out when ready */
  .museum-loading-overlay {
    position: absolute;
    inset: 0;
    z-index: 50;
    background: #0a0a0a;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: rgba(200, 180, 140, 0.8);
    font-family: Georgia, "Times New Roman", serif;
    opacity: 1;
    transition: opacity 0.6s ease;
  }

  .museum-loading-overlay.fading {
    opacity: 0;
    pointer-events: none;
    transition-duration: 0.8s;
  }

  .overlay-icon {
    font-size: 36px;
    opacity: 0.5;
    animation: overlay-pulse 2s ease-in-out infinite;
    will-change: opacity;
  }

  .overlay-progress {
    width: min(260px, 60vw);
  }

  @keyframes overlay-pulse {
    0%,
    100% {
      opacity: 0.3;
    }
    50% {
      opacity: 0.6;
    }
  }
</style>
