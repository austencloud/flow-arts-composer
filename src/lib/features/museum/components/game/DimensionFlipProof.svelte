<script lang="ts">
  import "../museum-theme.css";
  import { Canvas } from "@threlte/core";
  import { useProgress } from "@threlte/extras";
  import Museum3DScene from "./Museum3DScene.svelte";
  import { MUSEUM_EXHIBIT_SEQUENCES } from "../../data/museum-exhibit-sequences";
  import { tileKey } from "../../domain/museum-grid-types";
  import type {
    MuseumGrid,
    ExhibitDefinition,
    PerformerDefinition,
    WingRegion,
  } from "../../domain/museum-grid-types";
  import type { RoomEdge } from "../../domain/layout-types";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { SOLID_TYPES } from "../../services/museum-physics-provider";
  import VirtualJoystick from "#lib/shared/components/touch/VirtualJoystick.svelte";
  import { museum3dEditorState } from "../../state/museum-3d-editor-state.svelte";
  import PlacementPickerPanel from "../editor/PlacementPickerPanel.svelte";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import type { ModuleId } from "#lib/shared/navigation/domain/types.js";
  import PlaqueView from "../panel/PlaqueView.svelte";
  import SequenceView from "../panel/SequenceView.svelte";
  import DocumentView from "../panel/DocumentView.svelte";
  import DecodeConsole from "../panel/DecodeConsole.svelte";
  import StickyNote from "../panel/StickyNote.svelte";
  import MuseumCaptionBar from "./MuseumCaptionBar.svelte";
  import { MuseumNarrationPlayer } from "../../services/museum-narration-player.svelte";
  import { roomStamp } from "../../data/museum-narration";
  import { placeFreeNotes, type PlacedNote } from "../../services/museum-free-notes";
  import { openInComposer } from "../../services/museum-composer-handoff";
  import { goto } from "$app/navigation";
  import SequenceBrowserOverlay from "#lib/features/museum/scenes/procedural/overlay/SequenceBrowserOverlay.svelte";
  import { getMuseumDocent } from "#lib/features/museum/services/museum-docent.svelte.js";
  import PerfMonitor from "#lib/shared/3d/components/PerfMonitor.svelte";
  import { getMuseumPerformanceRecorder } from "../../get-museum-performance-recorder";

  import { onMount } from "svelte";

  interface Props {
    grid: MuseumGrid;
    /** Room graph edges consumed by the 3D corridor streamer. */
    edges?: RoomEdge[];
    /** Called with 0-1 progress as assets load */
    onLoadProgress?: (progress: number) => void;
    /** Called when all assets AND geometry are ready - scene is fully interactive */
    onAllLoaded?: () => void;
    /** Called during async geometry build with the current phase name */
    onBuildStage?: (stage: string) => void;
    /** Start directly in FPS/3rd-person mode (skip top-down flip) */
    startInFps?: boolean;
    initialCameraMode?: "first-person" | "third-person";
    cameraModePersistenceKey?: string;
    /** Session-storage key for preserving camera state across HMR. */
    persistenceKey?: string;
    /** Fired when the player enters a new wing (or leaves all wings). */
    onWingChange?: (wingId: string | null) => void;
    /** Fired when the camera crosses the terrain waterline (underwater state). */
    onSubmergedChange?: (submerged: boolean) => void;
    /** False when the museum is mounted-but-hidden (keep-alive) - pause the scene */
    visible?: boolean;
    /**
     * Optional injection map for resolving performer/formation sequenceIds to a
     * user's PRIVATE library sequence (personal-museum reuse). Passed through to
     * Museum3DScene. Undefined in the official museum (default behavior).
     */
    userSequenceData?: Map<string, SequenceData>;
    /**
     * Optional per-refId pictograph bitmaps for wall plaques (personal-museum
     * slots). Passed through to Museum3DScene. Undefined in the official museum.
     */
    plaquePictographs?: Map<string, ImageBitmap>;
    /**
     * Optional in-world focus callback (personal-museum curation). Fired when the
     * player presses E facing an exhibit (refId of the focused slot) and again
     * with null when the panel/focus is dismissed. Omitted in the official
     * museum, where it is a no-op and behavior is identical.
     */
    onExhibitFocus?: (refId: string | null) => void;
    /** Optional route-level back action. Defaults to the existing app navigation. */
    onBack?: () => void;
    backAriaLabel?: string;
    /** Enables museum timing and renderer counters without showing shared debug UI. */
    performanceRecordingEnabled?: boolean;
  }

  const props: Props = $props();
  const performanceRecorder = getMuseumPerformanceRecorder();
  // Destructure non-reactive props; grid is accessed via props.grid in $derived/$effect for reactivity
  const startInFps = props.startInFps ?? false;

  function handleBack(): void {
    if (props.onBack) {
      props.onBack();
      return;
    }
    handleModuleChange("create" as ModuleId);
  }

  // useProgress hooks into Three.js DefaultLoadingManager globally.
  // Every texture and GLTF model automatically reports here.
  const { active, progress, finishedOnce } = useProgress();

  // Pipe progress to parent
  $effect(() => {
    props.onLoadProgress?.($progress);
  });

  // The scene is truly ready when BOTH conditions are met:
  // 1. Geometry build completed (InstancedMeshes populated)
  // 2. Textures/models finished loading (Three.js DefaultLoadingManager)
  // Either can finish first depending on cache state.
  let sceneReady = $state(false);
  let texturesReady = $state(false);
  let meshesReady = $state(false);
  let shadersReady = $state(false);
  let settleTimer: ReturnType<typeof setTimeout> | null = null;

  function checkFullyReady(): void {
    if (sceneReady) return;
    if (!texturesReady || !meshesReady || !shadersReady) return;
    sceneReady = true;
    requestAnimationFrame(() => {
      props.onAllLoaded?.();
    });
  }

  function handleGeometryReady(): void {
    meshesReady = true;
    checkFullyReady();
  }

  function handleShaderWarmupReady(): void {
    shadersReady = true;
    checkFullyReady();
  }

  // Under memory pressure (especially mobile, where the WebGL context cap is as
  // low as 2-8 per principal) the browser can evict our context even while
  // mounted. preventDefault keeps it recoverable; on restore we force the ready
  // gate after a short grace so we never strand on a black canvas.
  let canvasAreaEl: HTMLDivElement | undefined;
  let canvasEl: HTMLCanvasElement | null = null;
  let contextRestoreTimer: ReturnType<typeof setTimeout> | null = null;

  function handleContextLost(e: Event): void {
    e.preventDefault();
    console.warn("[DimensionFlipProof] WebGL context lost");
  }
  function handleContextRestored(): void {
    console.warn("[DimensionFlipProof] WebGL context restored");
    if (contextRestoreTimer) clearTimeout(contextRestoreTimer);
    contextRestoreTimer = setTimeout(() => {
      texturesReady = true;
      meshesReady = true;
      shadersReady = true;
      checkFullyReady();
    }, 2000);
  }

  $effect(() => {
    if ($finishedOnce && !$active && !texturesReady) {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        if (!texturesReady) {
          texturesReady = true;
          checkFullyReady();
        }
      }, 500);
    } else if ($active && settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
  });

  const TILE_SIZE = 0.5;
  const HMR_KEY = props.persistenceKey ?? "museum-hmr-state";

  // ── HMR state restore ──
  // sessionStorage survives Vite HMR remounts but clears on tab close - perfect for this.
  type ViewMode = "top-down" | "first-person" | "third-person";

  interface HmrState {
    playerWorldX: number;
    playerWorldZ: number;
    /** Legacy field - kept for backward compatibility with old sessionStorage */
    isInFPS?: boolean;
    /** New field - stores the exact view mode */
    viewMode?: ViewMode;
    topDownHeight: number;
    playerYaw: number;
    isEditorMode?: boolean;
  }

  // Compute saved HMR state once at init - plain const, no reactivity needed
  const savedHmrState: HmrState | null = (() => {
    let state: HmrState | null = null;
    try {
      const raw = sessionStorage.getItem(HMR_KEY);
      if (raw) state = JSON.parse(raw) as HmrState;
    } catch {
      // sessionStorage unavailable or corrupt - start fresh
    }

    // Validate saved position is on a walkable tile. After layout changes (rooms move),
    // the saved position may land in void or wall space, trapping the player outside.
    if (state) {
      const tileX = Math.round(state.playerWorldX / TILE_SIZE);
      const tileY = Math.round(state.playerWorldZ / TILE_SIZE);
      const tile = props.grid.tiles.get(`${tileX},${tileY}`);
      if (!tile || SOLID_TYPES.has(tile.type)) {
        try {
          sessionStorage.removeItem(HMR_KEY);
        } catch {
          /* non-critical */
        }
        return null;
      }
    }
    return state;
  })();

  // ── Input state ──
  let flipRequested = $state(0);
  let resetRequested = $state(0);
  // Counter for instant mode switches (first-person → third-person)
  let modeChangeRequested = $state(0);
  // Plain object (not $state) for key tracking - Museum3DScene reads this every frame
  // in its useTask loop, bypassing Svelte reactivity. A raw Set avoids proxy overhead.
  const heldKeys = new Set<string>();

  // ── Touch movement ────────────────────────────────────────────────────────
  //
  // Before this the museum was unwalkable on a phone. Look worked — the camera
  // controller falls back to drag-look when it cannot get pointer lock — but
  // every movement path in the walker reads `heldKeys`, and a phone has no
  // keyboard to fill it. You could stand in a chamber and pivot, nothing more.
  //
  // The stick drives BOTH paths, because the museum has two: first-person
  // movement lives in the camera controller (analog, so a half-push is a half
  // step), and the top-down 2D mode reads `heldKeys`, which is boolean and can
  // only be fed by synthesising the keys the keyboard would have sent.
  // Whether to show the stick is decided from the DEVICE, not from having seen
  // a touch event. The obvious route — the shared InputCapabilities singleton's
  // shouldShowTouchUI() — cannot work here: the camera controller lives in
  // @austencloud/camera-3d and calls `createInputCapabilities()` for itself, so
  // the pointer events it observes never reach the app-side singleton, whose
  // currentPointerType stays null forever. A coarse pointer means no mouse,
  // which is the actual question, and it is true on the first frame rather than
  // after the visitor has already tapped something.
  let isTouchDevice = $state(false);
  onMount(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    isTouchDevice = coarse.matches;
    const onChange = (e: MediaQueryListEvent) => (isTouchDevice = e.matches);
    coarse.addEventListener("change", onChange);
    return () => coarse.removeEventListener("change", onChange);
  });

  let moveAxis = $state({ x: 0, z: 0 });
  /** Past this the stick counts as "pressed" for the boolean 2D path. */
  const STICK_KEY_THRESHOLD = 0.35;

  function handleJoystick(x: number, y: number): void {
    // `y` arrives already inverted by the primitive — pushing the stick UP is
    // +1, not −1 (VirtualJoystick.calculateInput negates it, and the
    // procedural-engine consumer passes it straight through as `z`). Negating
    // it here made forward walk backwards.
    moveAxis = { x, z: y };
    const press = (code: string, down: boolean) =>
      down ? heldKeys.add(code) : heldKeys.delete(code);
    press("KeyW", y > STICK_KEY_THRESHOLD);
    press("KeyS", y < -STICK_KEY_THRESHOLD);
    press("KeyD", x > STICK_KEY_THRESHOLD);
    press("KeyA", x < -STICK_KEY_THRESHOLD);
  }

  /**
   * The museum's own autopilot. It exists because the presentation-mode ghost
   * can only press DOM and cannot steer a 3D character — so the museum owns the
   * walking and the ghost just presses one button. See museum-docent.svelte.ts.
   */
  const docent = getMuseumDocent({ getGrid: () => props.grid });

  function toggleDocent(): void {
    if (!sceneReady && !docent.active) return;
    if (docent.active) {
      docent.stop("button");
      // Release whatever it was holding, or the player keeps walking into a wall.
      for (const key of ["KeyW", "KeyA", "KeyS", "KeyD"]) heldKeys.delete(key);
    } else {
      docent.start();
    }
  }

  // A real keypress means a human took over — the docent must not fight them for
  // the keyboard.
  function stopDocentOnHumanInput(): void {
    if (docent.active) docent.stop("human-input");
  }

  // ── Zoom state (top-down camera height) ──
  let topDownHeight = $state(savedHmrState?.topDownHeight ?? 12);

  // ── View mode: unified Q-cycle state machine ──
  // Q cycles: top-down → first-person → third-person → top-down.
  // On foot (startInFps) the 2D map is off the cycle: Q toggles first ↔ third.
  function restoreViewMode(): ViewMode {
    // When the parent forces 3D on mount, honor that over stale sessionStorage.
    // Prevents the 2D → 3D → 2D flash that happens when HMR state lags behind
    // the latest movement. A third-person choice still survives the remount.
    if (startInFps) {
      return savedHmrState?.viewMode === "third-person"
        ? "third-person"
        : "first-person";
    }
    if (!savedHmrState) return "top-down";
    if (savedHmrState.viewMode) return savedHmrState.viewMode;
    return savedHmrState.isInFPS ? "first-person" : "top-down";
  }
  let viewMode = $state<ViewMode>(restoreViewMode());
  // Derived for backward compat - template uses isInFPS extensively
  let isInFPS = $derived(viewMode !== "top-down");
  // What Q does next, for the controls hint.
  const qHint = $derived(
    !startInFps
      ? "cycle view"
      : viewMode === "third-person"
        ? "first-person"
        : "third-person"
  );

  // ── Player state (updated every frame by Museum3DScene callback) ──
  let playerWorldX = $state(
    savedHmrState?.playerWorldX ?? props.grid.spawn.x * TILE_SIZE
  );
  let playerWorldZ = $state(
    savedHmrState?.playerWorldZ ?? props.grid.spawn.y * TILE_SIZE
  );
  let playerTileX = $state(props.grid.spawn.x);
  let playerTileY = $state(props.grid.spawn.y);
  let playerFacing = $state("south");

  // Restore editor mode from HMR state
  if (savedHmrState?.isEditorMode) {
    museum3dEditorState.setActive(true);
  }

  // ── Debounced sessionStorage save ──
  // Writes at most every 500ms to avoid per-frame serialization overhead.
  let hmrSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let hmrDirty = false;

  function scheduleHmrSave(): void {
    hmrDirty = true;
    if (hmrSaveTimer !== null) return; // already scheduled
    hmrSaveTimer = setTimeout(() => {
      hmrSaveTimer = null;
      if (!hmrDirty) return;
      hmrDirty = false;
      try {
        const state: HmrState = {
          playerWorldX,
          playerWorldZ,
          viewMode,
          topDownHeight,
          playerYaw: lastKnownYaw,
          isEditorMode: museum3dEditorState.editorActive,
        };
        sessionStorage.setItem(HMR_KEY, JSON.stringify(state));
      } catch {
        // sessionStorage full or unavailable - non-critical
      }
    }, 500);
  }

  // Also flush immediately on mode change (FPS toggle) so the state is captured
  // before a potential HMR remount that could happen right after.
  function flushHmrSave(): void {
    if (hmrSaveTimer !== null) {
      clearTimeout(hmrSaveTimer);
      hmrSaveTimer = null;
    }
    hmrDirty = false;
    try {
      const state: HmrState = {
        playerWorldX,
        playerWorldZ,
        viewMode,
        topDownHeight,
        playerYaw: lastKnownYaw,
        isEditorMode: museum3dEditorState.editorActive,
      };
      sessionStorage.setItem(HMR_KEY, JSON.stringify(state));
    } catch {
      // non-critical
    }
  }

  // Track the latest yaw from Museum3DScene's player updates.
  // We can't read playerYaw from Museum3DScene directly, but we can infer it
  // from the facing direction or receive it via the callback. For now we store
  // the yaw from the saved state and update it when mode changes.
  let lastKnownYaw = savedHmrState?.playerYaw ?? 0;

  // ── Interaction state ──
  let focusedExhibit = $state<ExhibitDefinition | null>(null);
  let focusedPerformer = $state<PerformerDefinition | null>(null);
  let showPanel = $state(false);
  let showSequencePicker = $state(false);
  let focusedNote = $state<PlacedNote | null>(null);

  // ── The audio guide ──
  const narration = new MuseumNarrationPlayer();
  $effect(() => () => narration.dispose());

  // Exhibit cues fire on proximity, not on facing: walking up to the case is
  // enough. Positions resolved once from the grid.
  const exhibitCueTargets = narration
    .exhibitTriggers()
    .flatMap(({ refId, radiusTiles }) => {
      const exhibit = props.grid.exhibits.find((e) => e.id === refId);
      return exhibit
        ? [{ refId, tileX: exhibit.tileX, tileY: exhibit.tileY, radiusTiles }]
        : [];
    });
  const firedExhibitCues = new Set<string>();

  // ── K's posted notes: readable when the visitor is beside the post ──
  const placedNotes = placeFreeNotes(props.grid, TILE_SIZE);
  const NOTE_READ_RADIUS = 1.1; // metres
  let nearNote = $derived.by<PlacedNote | null>(() => {
    let best: PlacedNote | null = null;
    let bestDist = NOTE_READ_RADIUS;
    for (const placed of placedNotes) {
      const dx = placed.worldX - playerWorldX;
      const dz = placed.worldZ - playerWorldZ;
      const dist = Math.hypot(dx, dz);
      if (dist < bestDist) {
        best = placed;
        bestDist = dist;
      }
    }
    return best;
  });

  // ── Wing detection ──
  let currentWing = $derived.by<WingRegion | null>(() => {
    for (const wing of props.grid.wings) {
      const b = wing.bounds;
      if (
        playerTileX >= b.x &&
        playerTileX < b.x + b.width &&
        playerTileY >= b.y &&
        playerTileY < b.y + b.height
      ) {
        return wing;
      }
    }
    return null;
  });

  // Notify parent when the player crosses a wing boundary so the soundscape
  // player can crossfade to the new room's ambient track.
  let lastNotifiedWingId: string | null = null;
  $effect(() => {
    const id = currentWing?.id ?? null;
    if (id !== lastNotifiedWingId) {
      lastNotifiedWingId = id;
      props.onWingChange?.(id);
      narration.enterRoom(id);
    }
  });
  let wingStamp = $derived(currentWing ? roomStamp(currentWing.id) : null);

  // ── Interaction detection: is the player facing an interactable tile? ──
  const FACING_OFFSETS: Record<string, { dx: number; dy: number }> = {
    north: { dx: 0, dy: -1 },
    south: { dx: 0, dy: 1 },
    east: { dx: 1, dy: 0 },
    west: { dx: -1, dy: 0 },
    northeast: { dx: 1, dy: -1 },
    northwest: { dx: -1, dy: -1 },
    southeast: { dx: 1, dy: 1 },
    southwest: { dx: -1, dy: 1 },
  };

  let facingExhibit = $derived.by<ExhibitDefinition | null>(() => {
    const offset = FACING_OFFSETS[playerFacing];
    if (!offset) return null;
    const tx = playerTileX + offset.dx;
    const ty = playerTileY + offset.dy;
    const tile = props.grid.tiles.get(tileKey(tx, ty));
    if (!tile || tile.type !== "exhibit-panel") return null;
    return (
      props.grid.exhibits.find((e) => e.tileX === tx && e.tileY === ty) ?? null
    );
  });

  let facingPerformer = $derived.by<PerformerDefinition | null>(() => {
    const offset = FACING_OFFSETS[playerFacing];
    if (!offset) return null;
    const tx = playerTileX + offset.dx;
    const ty = playerTileY + offset.dy;
    const tile = props.grid.tiles.get(tileKey(tx, ty));
    if (!tile || tile.type !== "performer-station") return null;
    return (
      props.grid.performers.find((p) => p.tileX === tx && p.tileY === ty) ??
      null
    );
  });

  let hasInteractable = $derived(
    facingExhibit !== null || facingPerformer !== null || nearNote !== null
  );
  let interactVerb = $derived.by(() => {
    if (facingExhibit?.document) return "Read";
    if (facingExhibit?.interaction?.kind === "decode") return "Use console";
    if (facingExhibit?.interaction?.kind === "terminal") return "Use terminal";
    if (facingExhibit || facingPerformer) return "Examine";
    if (nearNote) return "Read note";
    return "Examine";
  });

  function closePanel(): void {
    showPanel = false;
    focusedExhibit = null;
    focusedPerformer = null;
    focusedNote = null;
    props.onExhibitFocus?.(null);
  }

  // ── Keyboard handling ──
  function handleKeyDown(e: KeyboardEvent) {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;

    // F2: toggle editor mode
    if (e.key === "F2") {
      e.preventDefault();
      museum3dEditorState.toggle();
      if (museum3dEditorState.editorActive && document.pointerLockElement) {
        document.exitPointerLock();
      }
      flushHmrSave(); // Persist editor mode state immediately for HMR
      return;
    }

    // Skip normal controls when editor is active (editor handles its own keys)
    if (museum3dEditorState.editorActive) return;

    // Q: cycle view mode (top-down → first-person → third-person → top-down)
    if (e.key === "q" || e.key === "Q") {
      e.preventDefault();
      if (viewMode === "top-down") {
        // top-down → first-person: snap to the warmed 3D camera
        // Pointer lock is handled by UCC when it attaches (deferred to avoid blocking)
        flipRequested++;
      } else if (viewMode === "first-person") {
        // first-person → third-person: instant switch, no animation
        modeChangeRequested++;
      } else if (startInFps) {
        // third-person → first-person: no 2D map on foot
        modeChangeRequested++;
      } else {
        // third-person → top-down: snap to the 2D camera
        flipRequested++;
      }
      return;
    }

    // E: interact with exhibit or performer (not during flip animation)
    if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      if (showPanel) {
        // The Order's consoles promise "PRESS E" in their own copy, so E on an
        // open panel does what the plaque says before it does what the HUD
        // says. The decode console handles its own E (see DecodeConsole).
        const kind = focusedExhibit?.interaction?.kind;
        if (kind === "exit" && focusedExhibit?.interaction?.kind === "exit") {
          void openInComposer(focusedExhibit.interaction.sequenceId, "From the Archive");
          return;
        }
        if (kind === "terminal" && focusedExhibit?.interaction?.kind === "terminal") {
          if (document.pointerLockElement) document.exitPointerLock();
          void goto(focusedExhibit.interaction.route);
          return;
        }
        if (kind === "decode") return;
        closePanel();
        // Re-acquire pointer lock if in FPS mode
        if (isInFPS) {
          const canvas = document.querySelector<HTMLCanvasElement>("canvas");
          canvas?.requestPointerLock();
        }
      } else if (facingExhibit) {
        focusedExhibit = facingExhibit;
        focusedPerformer = null;
        showPanel = true;
        props.onExhibitFocus?.(focusedExhibit.id);
        // Release pointer lock so the user can interact with the panel
        if (document.pointerLockElement) document.exitPointerLock();
      } else if (facingPerformer) {
        focusedPerformer = facingPerformer;
        focusedExhibit = null;
        showPanel = true;
        props.onExhibitFocus?.(null);
        if (document.pointerLockElement) document.exitPointerLock();
      } else if (nearNote) {
        focusedNote = nearNote;
        focusedExhibit = null;
        focusedPerformer = null;
        showPanel = true;
        props.onExhibitFocus?.(null);
        if (document.pointerLockElement) document.exitPointerLock();
      }
      return;
    }

    // N: skip the audio guide's current cue
    if (e.key === "n" || e.key === "N") {
      if (narration.current) {
        e.preventDefault();
        narration.skip();
      }
      return;
    }

    // ESC: dismiss panel or picker
    if (e.key === "Escape") {
      if (showSequencePicker) {
        showSequencePicker = false;
        return;
      }
      if (showPanel) {
        closePanel();
        // Re-acquire pointer lock if in FPS mode
        if (isInFPS) {
          const canvas = document.querySelector<HTMLCanvasElement>("canvas");
          canvas?.requestPointerLock();
        }
        return;
      }
    }

    // Home or R: reset to spawn
    if (e.key === "Home" || e.key === "r" || e.key === "R") {
      e.preventDefault();
      resetRequested++;
      // Clear stale HMR state so the player doesn't respawn at the old position after HMR
      try {
        sessionStorage.removeItem(HMR_KEY);
      } catch {
        /* non-critical */
      }
      return;
    }

    // A human pressing a movement key wants the keyboard back.
    if (e.isTrusted) stopDocentOnHumanInput();

    // Movement keys - only track in top-down mode (UCC handles its own keys in FPS)
    if (!isInFPS) {
      heldKeys.add(e.code);
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
    heldKeys.delete(e.code);
  }

  function handleBlur() {
    heldKeys.clear();
  }

  function handleWheel(e: WheelEvent) {
    // Only zoom in top-down mode
    if (isInFPS) return;
    e.preventDefault();
    // Multiplicative zoom: scroll up (negative deltaY) = zoom in, scroll down = zoom out
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    topDownHeight = Math.max(4, Math.min(50, topDownHeight * factor));
  }

  function handlePlayerUpdate(
    worldX: number,
    worldZ: number,
    tileX: number,
    tileY: number,
    facing: string,
    inFPS: boolean,
    yaw: number
  ) {
    // The docent steers by filling the SAME heldKeys set the keyboard fills, so
    // collision, portals and void-recovery all run through MuseumPlayerController
    // exactly as they do for a human. Called from the scene's own frame loop, so
    // its keys land on the next frame.
    docent.step(
      heldKeys,
      { x: worldX / TILE_SIZE, y: worldZ / TILE_SIZE },
      performance.now()
    );

    // Debug seam, same idea as the presenter's window.__ghost: when the docent
    // walks into a wall the only useful question is "which way did it think it
    // was going", and that is invisible from the outside.
    if (import.meta.env.DEV) {
      (window as unknown as { __docent?: unknown }).__docent = {
        active: docent.active,
        status: docent.status,
        keys: [...heldKeys],
        tile: { x: worldX / TILE_SIZE, y: worldZ / TILE_SIZE },
        debug: docent.debug(),
      };
    }

    playerWorldX = worldX;
    playerWorldZ = worldZ;
    playerTileX = tileX;
    playerTileY = tileY;
    playerFacing = facing;
    lastKnownYaw = yaw;

    // Walk up to a case with a cue and the tape starts. Once per visit.
    for (const target of exhibitCueTargets) {
      if (firedExhibitCues.has(target.refId)) continue;
      const dx = target.tileX - tileX;
      const dy = target.tileY - tileY;
      if (dx * dx + dy * dy <= target.radiusTiles * target.radiusTiles) {
        firedExhibitCues.add(target.refId);
        narration.nearExhibit(target.refId);
      }
    }

    // Detect mode change - flush immediately so HMR captures the transition
    const wasInFPS = viewMode !== "top-down";
    if (inFPS && !wasInFPS) {
      // Entered 3D - default to first-person (the flip animation always enters FP)
      viewMode = "first-person";
      flushHmrSave();
    } else if (!inFPS && wasInFPS) {
      // Exited to top-down
      viewMode = "top-down";
      flushHmrSave();
    } else {
      scheduleHmrSave();
    }
  }

  // Called by Museum3DScene when UCC switches between first-person and third-person
  function handleViewModeChange(mode: "first-person" | "third-person") {
    if (viewMode !== mode) {
      viewMode = mode;
      flushHmrSave();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    // Watchdog: never strand the loading overlay on black. If neither the
    // texture nor the geometry track has reported ready within this window
    // (e.g. a worker crash that even the streamer's own guards missed), force
    // the reveal - a usable scene beats an indefinite black screen.
    const watchdog = setTimeout(() => {
      if (!sceneReady) {
        console.warn(
          "[DimensionFlipProof] Ready watchdog fired - forcing scene reveal"
        );
        texturesReady = true;
        meshesReady = true;
        checkFullyReady();
      }
    }, 15_000);

    // Attach context-loss listeners to this component's canvas (scoped to
    // canvasAreaEl, not a global querySelector, so keep-alive coexistence with
    // other modules' canvases can't grab the wrong one). Deferred so the Canvas
    // has rendered its <canvas> element.
    const canvasHookTimer = setTimeout(() => {
      canvasEl =
        canvasAreaEl?.querySelector<HTMLCanvasElement>("canvas") ?? null;
      canvasEl?.addEventListener("webglcontextlost", handleContextLost, false);
      canvasEl?.addEventListener(
        "webglcontextrestored",
        handleContextRestored,
        false
      );
    }, 0);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      // Clean up debounce timer
      if (hmrSaveTimer !== null) clearTimeout(hmrSaveTimer);
      if (settleTimer !== null) clearTimeout(settleTimer);
      clearTimeout(watchdog);
      clearTimeout(canvasHookTimer);
      if (contextRestoreTimer) clearTimeout(contextRestoreTimer);
      canvasEl?.removeEventListener("webglcontextlost", handleContextLost);
      canvasEl?.removeEventListener(
        "webglcontextrestored",
        handleContextRestored
      );
    };
  });

  // Derived: does the focused exhibit have a sequence?
  let exhibitSequenceId = $derived(focusedExhibit?.sequenceId ?? null);
</script>

<div class="museum-container museum-gold-scope">
  <!-- 3D Canvas -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="canvas-area" onwheel={handleWheel} bind:this={canvasAreaEl}>
    <Canvas dpr={1}>
      <PerfMonitor
        active={props.performanceRecordingEnabled}
        onSample={(sample) => performanceRecorder.recordRendererSample(sample)}
      />
      <Museum3DScene
        grid={props.grid}
        edges={props.edges}
        visible={props.visible}
        userSequenceData={props.userSequenceData}
        plaquePictographs={props.plaquePictographs}
        {flipRequested}
        {resetRequested}
        {modeChangeRequested}
        {heldKeys}
        {moveAxis}
        {topDownHeight}
        onPlayerUpdate={handlePlayerUpdate}
        onViewModeChange={handleViewModeChange}
        onBuildStage={props.onBuildStage}
        onSubmergedChange={props.onSubmergedChange}
        onGeometryReady={handleGeometryReady}
        assetsReady={texturesReady}
        onShaderWarmupReady={handleShaderWarmupReady}
        initialFpsActive={viewMode !== "top-down"}
        initialCameraMode={props.initialCameraMode}
        cameraModePersistenceKey={props.cameraModePersistenceKey}
        initialPlayerPos={savedHmrState
          ? { x: savedHmrState.playerWorldX, z: savedHmrState.playerWorldZ }
          : undefined}
        initialPlayerYaw={savedHmrState?.playerYaw}
      />
    </Canvas>
  </div>

  <!-- Touch movement. Sits outside the Canvas so its drags never reach the
       canvas's own pointer handlers — otherwise steering would also spin the
       camera. Hidden entirely on mouse/keyboard, and while the editor is open,
       where the same corner is a drag surface. -->
  {#if isTouchDevice && !museum3dEditorState.editorActive}
    <VirtualJoystick
      onInput={handleJoystick}
      left={24}
      bottom={24}
      size={132}
    />
  {/if}

  <!-- Placement picker panel (HTML overlay, outside Canvas) -->
  {#if museum3dEditorState.editorActive}
    <PlacementPickerPanel currentRoomName={currentWing?.name} />
  {/if}

  <!-- Back button (top-left, non-editor mode) -->
  {#if !museum3dEditorState.editorActive && !showPanel}
    <button
      class="museum-back-btn"
      onclick={handleBack}
      aria-label={props.backAriaLabel ?? "Back to app"}
    >
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
    </button>
  {/if}

  <!-- Docent: the museum walks itself. The presentation-mode ghost presses this
       (data-ghost-kind="docent") because it can only press DOM and has no way to
       steer a 3D character — before this it walked in, said "I haven't looked at
       Museum yet", and stood still in a room it could not explore. Useful for a
       human too: it is the "show me around" button. -->
  {#if !museum3dEditorState.editorActive && !showPanel}
    <button
      class="museum-docent-btn"
      class:on={docent.active}
      onclick={toggleDocent}
      disabled={!sceneReady && !docent.active}
      data-ghost="safe"
      data-ghost-kind={docent.active ? undefined : "docent"}
      data-ghost-label="Look around"
      aria-pressed={docent.active}
      aria-label={docent.active ? "Stop walking me around" : "Walk me around"}
      title={docent.active
        ? "Stop the tour"
        : sceneReady
          ? "Show me around"
          : "Museum is still loading"}
    >
      <i
        class="fas {docent.active ? 'fa-stop' : 'fa-person-walking'}"
        aria-hidden="true"
      ></i>
      <span>{docent.active ? "Stop" : "Look around"}</span>
    </button>
  {/if}

  {#if docent.active && !showPanel}
    <!-- data-ghost-state="presenting" tells the attract presenter that this
         module is currently putting on the show itself, so its
         nothing-pressable-anywhere escape hatch must not fire and drag the ghost
         out of a tour that is going fine. -->
    <div
      class="docent-status"
      role="status"
      aria-live="polite"
      data-ghost-state="presenting"
    >
      {docent.status}
    </div>
  {/if}

  <!-- Wing label (top-left, offset when back button visible) - hidden in editor mode -->
  {#if currentWing && !showPanel && !museum3dEditorState.editorActive}
    <div class="wing-label" class:fps={isInFPS} class:stamped={!!wingStamp}>
      <i class="fas fa-location-dot" aria-hidden="true"></i>
      <span class="wing-name">
        <span>{currentWing.name}</span>
        {#if wingStamp}
          <span class="wing-stamp">{wingStamp}</span>
        {/if}
      </span>
    </div>
  {/if}

  <!-- The audio guide's captions (above the interaction prompt) -->
  {#if !showPanel && !museum3dEditorState.editorActive}
    <MuseumCaptionBar caption={narration.current} />
  {/if}

  <!-- Interaction prompt (bottom-center) -->
  {#if hasInteractable && !showPanel}
    <div class="interaction-prompt" role="status" aria-live="polite">
      <kbd>E</kbd>
      <span>{interactVerb}</span>
    </div>
  {/if}

  <!-- Controls hint (bottom-right) -->
  {#if !showPanel}
    <div class="controls-hint">
      <span class="hint-text">
        {#if isTouchDevice}
          Stick to move {isInFPS ? "• Drag to look" : "• Pinch to zoom"} • Tap an
          exhibit to examine
        {:else}
          WASD move {isInFPS ? "• Mouse look" : "• Scroll zoom"} • Q {qHint} •
          E examine
        {/if}
      </span>
    </div>
  {/if}

  <!-- Overlay panel (right side) -->
  {#if showPanel && focusedExhibit}
    <div class="overlay-panel">
      <button
        class="panel-close"
        aria-label="Close exhibit panel"
        onclick={closePanel}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>

      {#if focusedExhibit.document}
        <!-- A document under glass: the wall label is its cover; the pages follow. -->
        {#if focusedExhibit.plaque}
          <PlaqueView
            title={focusedExhibit.plaque.title}
            subtitle={focusedExhibit.plaque.subtitle}
            body={focusedExhibit.plaque.body}
            footer={focusedExhibit.plaque.barter}
            style={focusedExhibit.plaque.style}
            annotations={focusedExhibit.plaque.annotations}
            draft={focusedExhibit.plaque.draft}
          />
        {/if}
        <DocumentView document={focusedExhibit.document} />
      {:else if focusedExhibit.plaque}
        <PlaqueView
          title={focusedExhibit.plaque.title}
          subtitle={focusedExhibit.plaque.subtitle}
          body={focusedExhibit.plaque.body}
          footer={focusedExhibit.plaque.barter}
          style={focusedExhibit.plaque.style}
          annotations={focusedExhibit.plaque.annotations}
          draft={focusedExhibit.plaque.draft}
        />
      {/if}

      {#if focusedExhibit.interaction?.kind === "decode"}
        <div class="panel-section">
          <DecodeConsole
            sequenceId={focusedExhibit.interaction.sequenceId}
            reveal={focusedExhibit.interaction.reveal}
            annotation={focusedExhibit.interaction.annotation}
          />
        </div>
      {:else if exhibitSequenceId}
        <div class="panel-section">
          <SequenceView sequenceId={exhibitSequenceId} />
        </div>
      {/if}

      {#if focusedExhibit.interaction?.kind === "terminal"}
        {@const route = focusedExhibit.interaction.route}
        <button
          class="action-btn console-action"
          onclick={() => {
            if (document.pointerLockElement) document.exitPointerLock();
            void goto(route);
          }}
        >
          <i class="fas fa-power-off" aria-hidden="true"></i>
          {focusedExhibit.interaction.label}
        </button>
      {:else if focusedExhibit.interaction?.kind === "exit"}
        {@const exitSeq = focusedExhibit.interaction.sequenceId}
        <button
          class="action-btn exit-action"
          onclick={() => void openInComposer(exitSeq, "From the Archive")}
        >
          <i class="fas fa-door-open" aria-hidden="true"></i>
          {focusedExhibit.interaction.label}
        </button>
      {/if}
    </div>
  {/if}

  <!-- Note panel: one of K's posted notes, up close -->
  {#if showPanel && focusedNote}
    <div class="overlay-panel note-panel">
      <button class="panel-close" aria-label="Close note" onclick={closePanel}>
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
      <div class="note-stage">
        <StickyNote text={focusedNote.note.text} era={focusedNote.note.era} lean={-2} />
      </div>
      <p class="note-caption">Posted by K. The building did not remove it.</p>
    </div>
  {/if}

  <!-- Performer panel (right side) -->
  {#if showPanel && focusedPerformer}
    <div class="overlay-panel">
      <button
        class="panel-close"
        aria-label="Close performer panel"
        onclick={closePanel}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>

      <div class="performer-info">
        <div class="performer-header">
          <i class="fas {focusedPerformer.handout ? 'fa-user-tie' : 'fa-person'}" aria-hidden="true"></i>
          <h3>{focusedPerformer.label ?? "Performer Station"}</h3>
        </div>
        {#if focusedPerformer.description}
          <p class="performer-desc">{focusedPerformer.description}</p>
        {/if}
      </div>

      {#if focusedPerformer.handout}
        <DocumentView document={focusedPerformer.handout} />
      {/if}

      {#if focusedPerformer.sequenceId}
        <div class="panel-section">
          <SequenceView sequenceId={focusedPerformer.sequenceId} />
        </div>
      {/if}

      {#if !focusedPerformer.handout}
        <button
          class="change-sequence-btn"
          onclick={() => (showSequencePicker = true)}
        >
          <i class="fas fa-exchange-alt" aria-hidden="true"></i>
          Change Sequence
        </button>
      {/if}
    </div>
  {/if}

  <SequenceBrowserOverlay
    visible={showSequencePicker}
    onSelect={(seqId) => {
      if (focusedPerformer) {
        focusedPerformer.sequenceId = seqId;
        // Trigger Svelte reactivity by replacing the performer in the array
        props.grid.performers = props.grid.performers.map((p) =>
          p.id === focusedPerformer?.id ? { ...p, sequenceId: seqId } : p
        );
      }
      showSequencePicker = false;
    }}
    onClose={() => (showSequencePicker = false)}
  />
</div>

<style>
  .museum-container {
    --museum-hud-edge: clamp(1rem, 0.5rem + 0.5vw, 2.25rem);
    --museum-hud-button: clamp(2.5rem, 1.5rem + 1vw, 4rem);
    width: 100%;
    height: 100%;
    position: relative;
    background: #0a0a0a;
  }

  .canvas-area {
    width: 100%;
    height: 100%;
  }

  /* Back button - top-left circle, takes you out of the museum */
  /* Sits beside the back button, same visual family. Filled while walking so it
     reads as a live state rather than an action. */
  .museum-docent-btn {
    position: absolute;
    top: calc(var(--museum-hud-edge) + var(--museum-hud-top-offset, 0px));
    left: calc(var(--museum-hud-edge) + var(--museum-hud-button) + 0.5rem);
    height: var(--museum-hud-button);
    padding: 0 0.85rem;
    gap: 0.45rem;
    border-radius: calc(var(--museum-hud-button) / 2);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(6px);
    color: rgba(255, 255, 255, 0.72);
    font-size: clamp(0.75rem, 0.6rem + 0.2vw, 0.95rem);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 90;
  }

  .museum-docent-btn:hover {
    color: white;
    background: rgba(0, 0, 0, 0.62);
  }

  .museum-docent-btn.on {
    background: rgba(139, 92, 246, 0.85);
    border-color: rgba(196, 181, 253, 0.9);
    color: white;
  }

  .docent-status {
    position: absolute;
    top: calc(
      var(--museum-hud-edge) + var(--museum-hud-top-offset, 0px) +
        var(--museum-hud-button) + 0.5rem
    );
    left: calc(var(--museum-hud-edge) + var(--museum-hud-button) + 0.5rem);
    padding: 0.35rem 0.7rem;
    border-radius: 0.5rem;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(6px);
    color: rgba(255, 255, 255, 0.85);
    font-size: clamp(0.7rem, 0.6rem + 0.15vw, 0.85rem);
    z-index: 90;
    pointer-events: none;
  }

  .museum-back-btn {
    position: absolute;
    top: calc(var(--museum-hud-edge) + var(--museum-hud-top-offset, 0px));
    left: var(--museum-hud-edge);
    width: var(--museum-hud-button);
    height: var(--museum-hud-button);
    border-radius: 50%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(6px);
    color: rgba(255, 255, 255, 0.7);
    font-size: clamp(1rem, 0.7rem + 0.3vw, 1.5rem);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 90;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .museum-back-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    color: #fff;
  }

  /* Wing label */
  .wing-label {
    position: absolute;
    top: calc(var(--museum-hud-edge) + var(--museum-hud-top-offset, 0px));
    left: calc(var(--museum-hud-edge) + var(--museum-hud-button) + 0.625rem);
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--museum-hud-button);
    padding: clamp(0.5rem, 0.35rem + 0.15vw, 0.8rem)
      clamp(0.875rem, 0.55rem + 0.3vw, 1.4rem);
    background: rgba(18, 18, 28, 0.85);
    border: 1px solid var(--museum-gold-15);
    border-radius: 8px;
    color: var(--museum-gold-80);
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(0.875rem, 0.625rem + 0.25vw, 1.375rem);
    pointer-events: none;
    z-index: 10;
    animation: fade-in 0.3s ease;
  }

  .wing-label i {
    font-size: 12px;
    opacity: 0.6;
  }

  /* Interaction prompt */
  .interaction-prompt {
    position: absolute;
    bottom: clamp(3.75rem, 2.5rem + 1vw, 6.5rem);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: clamp(0.5rem, 0.35rem + 0.15vw, 0.8rem)
      clamp(1rem, 0.65rem + 0.3vw, 1.5rem);
    background: rgba(18, 18, 28, 0.9);
    border: 1.5px solid var(--museum-gold-25);
    border-radius: 8px;
    color: var(--museum-gold-80);
    font-size: clamp(0.875rem, 0.625rem + 0.25vw, 1.375rem);
    pointer-events: none;
    z-index: 10;
    animation: fade-in 0.2s ease;
  }

  .interaction-prompt kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    background: var(--museum-gold-15);
    border: 1px solid var(--museum-gold-30);
    border-radius: 4px;
    font-family: monospace;
    font-size: 13px;
    font-weight: 600;
    color: var(--museum-gold-90);
  }

  /* Controls hint */
  .controls-hint {
    position: absolute;
    bottom: var(--museum-hud-edge);
    right: var(--museum-hud-edge);
    z-index: 10;
    pointer-events: none;
  }

  .hint-text {
    font-size: clamp(0.75rem, 0.55rem + 0.2vw, 1.125rem);
    color: rgba(255, 255, 255, 0.2);
  }

  /* Overlay panel */
  .overlay-panel {
    position: absolute;
    top: 16px;
    right: 16px;
    bottom: 16px;
    width: min(360px, 40%);
    background: rgba(18, 18, 28, 0.95);
    border: 1px solid var(--museum-gold-12);
    border-radius: 12px;
    padding: 24px;
    overflow-y: auto;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 20px;
    animation: panel-slide-in 0.25s ease;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, var(--museum-gold-20)) transparent;
  }

  .panel-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--museum-gold-08);
    border: 1px solid var(--museum-gold-15);
    border-radius: 6px;
    color: var(--museum-gold-50);
    cursor: pointer;
    font-size: 12px;
  }

  .panel-close:hover {
    background: var(--museum-gold-15);
    color: var(--museum-gold-80);
  }

  .panel-section {
    border-top: 1px solid var(--museum-gold-10);
    padding-top: 16px;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes panel-slide-in {
    from {
      opacity: 0;
      transform: translateX(16px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .performer-info {
    padding: 16px;
    background: rgba(140, 200, 140, 0.04);
    border: 1px solid rgba(140, 200, 140, 0.12);
    border-radius: 8px;
  }

  .performer-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .performer-header i {
    color: #8cc88c;
    font-size: 1.1rem;
  }

  .performer-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #8cc88c;
    font-weight: 500;
  }

  .change-sequence-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 10px 16px;
    background: rgba(140, 200, 140, 0.08);
    border: 1px solid rgba(140, 200, 140, 0.2);
    border-radius: 6px;
    color: rgba(140, 200, 140, 0.7);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .change-sequence-btn:hover {
    background: rgba(140, 200, 140, 0.14);
    border-color: rgba(140, 200, 140, 0.35);
    color: rgba(140, 200, 140, 0.9);
  }

  .performer-desc {
    margin: 10px 0 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.6;
    color: var(--museum-gold-60);
  }

  /* The wing label's threshold stamp: the Order's clinical line under the name */
  .wing-name {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .wing-stamp {
    font-family: monospace;
    font-size: 0.62em;
    letter-spacing: 0.12em;
    color: var(--museum-gold-45);
  }

  .wing-label.stamped {
    align-items: flex-start;
    padding-top: 0.45rem;
    padding-bottom: 0.45rem;
  }

  .wing-label.stamped i {
    margin-top: 0.35em;
  }

  /* Exhibit actions: boot the terminal, leave through the shop */
  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 12px 16px;
    border-radius: 6px;
    font-size: var(--font-size-min, 14px);
    letter-spacing: 0.04em;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .console-action {
    background: rgba(125, 255, 154, 0.08);
    border: 1px solid #1f3a2a;
    color: #7dff9a;
    font-family: Consolas, "Courier New", monospace;
    text-transform: uppercase;
  }

  .console-action:hover {
    background: rgba(125, 255, 154, 0.16);
    border-color: #4fd37a;
  }

  .exit-action {
    background: var(--museum-gold-12);
    border: 1px solid var(--museum-gold-40);
    color: var(--museum-gold-90);
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.05rem;
  }

  .exit-action:hover {
    background: var(--museum-gold-20);
    border-color: var(--museum-gold-60);
  }

  /* One of K's posted notes, read up close */
  .note-panel {
    justify-content: center;
  }

  .note-stage {
    padding: 24px 18px;
  }

  .note-caption {
    margin: 0;
    text-align: center;
    font-family: Georgia, "Times New Roman", serif;
    font-size: var(--font-size-compact, 12px);
    font-style: italic;
    color: var(--museum-gold-40);
  }

  @media (max-width: 40rem) {
    .wing-label {
      max-width: calc(
        100vw - var(--museum-hud-edge) * 3 - var(--museum-hud-button)
      );
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .controls-hint {
      right: 0.75rem;
      left: 0.75rem;
      text-align: center;
    }

    .hint-text {
      font-size: 0.68rem;
    }
  }
</style>
