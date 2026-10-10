<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { getCoralSceneRenderer } from "../get-coral-scene-renderer";
  import { getOceanBackgroundSystem } from "../get-ocean-background-system";
  import {
    type FishMarineLife,
    type FishMood,
    OceanBackgroundOrchestrator,
    type OceanLayers,
    fishDebugConfig,
    type QualityLevel,
  } from "@austencloud/backgrounds";
  import * as BackgroundsPackage from "@austencloud/backgrounds";
  import { ChipToggle, ChipGroup } from "@austencloud/chip-toggle";
  import CollapsibleLabSection from "#lib/shared/components/lab/CollapsibleLabSection.svelte";
  import LabStatusBar from "#lib/shared/components/lab/LabStatusBar.svelte";
  import PersonalityBars from "./PersonalityBars.svelte";
  import type { CoralSceneRenderer } from "../services/coral-scene-renderer";
  import { createOceanLabState } from "../state/deep-ocean-lab-state.svelte";
  import {
    type ColorPreset,
    moodOptions as MOOD_OPTIONS,
    wobbleOptions as WOBBLE_OPTIONS,
    rareBehaviorOptions as RARE_BEHAVIOR_OPTIONS,
    getMoodColor as getFishMoodColor,
    triggerMood as triggerMoodAction,
    triggerWobble as triggerWobbleAction,
    triggerRareBehavior as triggerRareBehaviorAction,
    forceHuntOnSelected as forceHuntAction,
    spawnFish as spawnFishAction,
    spawnJellyfish as spawnJellyfishAction,
  } from "../services/fish-behavior-controls";

  // The backgrounds package's FishMoodManager reads `_manualMoodSetAt` at runtime
  // (FishMoodManager.js) but the published FishMarineLife type omits it. Declare a
  // local augmentation so we can write the timestamp without an `as any` cast.
  type CharacterFish = FishMarineLife & {
    _manualMoodSetAt?: number;
    resident?: boolean;
    identitySeed?: number;
    intent?: string;
    intentTimer?: number;
    attention?: {
      kind: "none" | "cursor" | "fish" | "home";
      salience: number;
      dwellRemaining: number;
    };
    perception?: {
      cursorThreat: number;
      cursorInterest: number;
      cursorSpeed: number;
      socialOpportunity: number;
      homeDisplacement: number;
    };
    memory?: {
      cursorFamiliarity: number;
      cursorAlarm: number;
      socialAffinity: Map<number, number>;
    };
    escapeEventCount?: number;
    escapeManeuver?: {
      phase: "coil" | "propulsion" | "coast" | "stabilize";
      source: { kind: "cursor" | "alarm" | "predator" };
      elapsed: number;
      totalDuration: number;
      curvature: number;
      accelerationBodyLengths: number;
      jerkBodyLengths: number;
      peakAccelerationBodyLengths: number;
      peakJerkBodyLengths: number;
      peakObservedSpeedBodyLengths: number;
      minimumClearanceBodyLengths: number;
    };
    lastEscapeMetrics?: {
      sourceKind: "cursor" | "alarm" | "predator";
      duration: number;
      peakSpeedBodyLengths: number;
      minimumClearanceBodyLengths: number;
      peakAccelerationBodyLengths: number;
      peakJerkBodyLengths: number;
    };
  };
  type ManualMoodFish = CharacterFish;
  type CharacterBackgroundExports = {
    setOceanFishSimulationSeed?: (seed: string | number) => void;
    getOceanFishSimulationSeed?: () => number;
  };
  const characterBackgrounds = BackgroundsPackage as CharacterBackgroundExports;

  // Canvas reference
  let canvas: HTMLCanvasElement | null = $state(null);
  let isLoading = $state(true);
  let initError = $state<string | null>(null);

  // One-shot visual-feedback timers — tracked so they can be cleared on destroy.
  const feedbackTimers = new Set<ReturnType<typeof setTimeout>>();
  let backgroundSystem: OceanBackgroundOrchestrator | null = $state(null);
  let animationFrame: number | null = $state(null);
  let lastFrameTime = 0;

  // Quality settings
  let quality: QualityLevel = $state("high");

  // Coral renderer
  let coralRenderer: CoralSceneRenderer = getCoralSceneRenderer();
  let showCoral = $state(true);
  let coralCount = $state(0);

  // Layer toggles
  let layers = $state<OceanLayers>({
    gradient: true,
    lightRays: true,
    caustics: true,
    particles: true,
    bubbles: true,
    fish: true,
    jellyfish: true,
  });

  // Stats display
  let stats = $state({ fish: 0, jellyfish: 0, bubbles: 0, particles: 0 });
  let lastStatsUpdate = 0;

  // Fish behavior state
  let fishList: CharacterFish[] = $state([]);
  let selectedFishIndex = $state(0);
  let showOverlay = $state(true);
  let simulationSeed = $state("resident-cast-17");
  let didSelectInitialResident = false;

  // Track active trigger buttons for visual feedback
  let activeMoodTrigger = $state<FishMood | null>(null);
  let activeWobbleTrigger = $state<string | null>(null);

  // Derived state
  let selectedFish = $derived(fishList[selectedFishIndex] ?? null);

  // Status bar counters
  let statusCounters = $derived([
    { icon: "fa-fish", value: stats.fish, label: "Fish" },
    { icon: "fa-disease", value: stats.jellyfish, label: "Jellyfish" },
    { icon: "fa-circle", value: stats.bubbles, label: "Bubbles" },
    ...(showCoral
      ? [{ icon: "fa-seedling", value: coralCount, label: "Coral" }]
      : []),
  ]);

  // Status chips for selected fish
  let statusChips = $derived.by(() => {
    if (!selectedFish) return [];
    return [
      {
        label: selectedFish.resident ? "resident" : "ambient",
        color: selectedFish.resident ? "cyan" : "gray",
      },
      {
        label: selectedFish.behavior,
        color: getBehaviorChipColor(selectedFish.behavior),
      },
      {
        label: selectedFish.mood ?? "calm",
        color: getMoodChipColor(selectedFish.mood ?? "calm"),
      },
    ];
  });

  function getBehaviorChipColor(
    behavior: string
  ): "cyan" | "orange" | "red" | "purple" | "gray" {
    switch (behavior) {
      case "cruising":
        return "cyan";
      case "turning":
        return "orange";
      case "darting":
        return "red";
      case "bursting":
        return "orange";
      case "schooling":
        return "purple";
      case "investigating":
        return "purple";
      case "socializing":
        return "cyan";
      case "resting":
        return "gray";
      case "returning":
        return "orange";
      default:
        return "gray";
    }
  }

  function getMoodChipColor(
    mood: string
  ): "cyan" | "blue" | "green" | "orange" | "red" | "purple" | "gray" {
    switch (mood) {
      case "calm":
        return "cyan";
      case "curious":
        return "purple";
      case "alert":
        return "orange";
      case "playful":
        return "green";
      case "hungry":
        return "red";
      case "tired":
        return "gray";
      case "social":
        return "purple";
      default:
        return "gray";
    }
  }

  function getMoodColor(mood: FishMood): string {
    switch (mood) {
      case "calm":
        return "#22d3ee";
      case "curious":
        return "#a855f7";
      case "alert":
        return "#f59e0b";
      case "playful":
        return "#22c55e";
      case "hungry":
        return "#ef4444";
      case "tired":
        return "#6b7280";
      case "social":
        return "#ec4899";
      default:
        return "#ffffff";
    }
  }

  async function initializeSystem() {
    if (!canvas) return;

    // Wait for layout to be computed
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const containerEl = canvas.parentElement;
    if (containerEl) {
      canvas.width = containerEl.clientWidth || 800;
      canvas.height = containerEl.clientHeight || 600;
    }

    // Ensure we have valid dimensions
    if (canvas.width === 0 || canvas.height === 0) {
      canvas.width = 800;
      canvas.height = 600;
    }

    initError = null;
    try {
      const system = getOceanBackgroundSystem();
      backgroundSystem = system;

      if (system) {
        const dimensions = { width: canvas.width, height: canvas.height };
        await system.initialize(dimensions, quality, {
          spawnFishOnScreen: true,
        });

        system.setLayerVisibility(layers);
        stats = system.getStats();
        updateFishList();

        // Initialize coral silhouettes
        if (showCoral) {
          await coralRenderer.initialize(canvas.width, canvas.height);
          coralCount = coralRenderer.getCoralCount();
        }

        startAnimation();
      }
      isLoading = false;
    } catch (error) {
      isLoading = false;
      const message = error instanceof Error ? error.message : String(error);
      initError = message;
      console.error("Failed to initialize Ocean Lab:", error);
      toast.error(`Ocean Lab failed to load: ${message}`);
    }
  }

  function updateFishList() {
    if (!backgroundSystem) return;
    fishList = (backgroundSystem.getFish?.() ?? []) as CharacterFish[];
    if (!didSelectInitialResident) {
      const residentIndex = fishList.findIndex((fish) => fish.resident);
      if (residentIndex >= 0) selectedFishIndex = residentIndex;
      didSelectInitialResident = true;
    }
  }

  function startAnimation() {
    if (!canvas || !backgroundSystem) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = (currentTime: number) => {
      if (!canvas || !backgroundSystem) return;

      const deltaTime = currentTime - lastFrameTime;
      const clampedDelta = Math.min(deltaTime, 50);
      const frameMultiplier = clampedDelta / 16.67;
      lastFrameTime = currentTime;

      const dimensions = { width: canvas.width, height: canvas.height };

      try {
        backgroundSystem.update(dimensions, frameMultiplier);
        ctx.clearRect(0, 0, dimensions.width, dimensions.height);
        backgroundSystem.draw(ctx, dimensions);

        // Draw coral layers after the background system (back -> mid -> front)
        if (showCoral && coralRenderer.isReady()) {
          coralRenderer.update(frameMultiplier);
          coralRenderer.drawLayer(
            ctx,
            "back",
            dimensions.width,
            dimensions.height
          );
          coralRenderer.drawLayer(
            ctx,
            "mid",
            dimensions.width,
            dimensions.height
          );
          coralRenderer.drawLayer(
            ctx,
            "front",
            dimensions.width,
            dimensions.height
          );
        }
      } catch {
        // Swallow frame errors from backgrounds package (e.g. unknown wobble types)
        // to keep the animation loop alive
      }

      // Update stats and fish list periodically
      if (currentTime - lastStatsUpdate > 500) {
        stats = backgroundSystem.getStats();
        updateFishList();
        lastStatsUpdate = currentTime;
      }

      // Draw home zones (if enabled)
      if (fishDebugConfig.showHomeZones && layers.fish) {
        for (const f of fishList) {
          drawHomeZone(ctx, f);
        }
      }

      // Draw hunt visualization (if enabled)
      if (fishDebugConfig.showHunts && layers.fish) {
        drawHunts(ctx);
      }

      // Draw fish selection overlay
      const selected = fishList[selectedFishIndex];
      if (selected && showOverlay && layers.fish) {
        drawSelectionIndicator(ctx, selected);
        drawFishOverlay(ctx, selected);
      }

      animationFrame = requestAnimationFrame(animate);
    };

    lastFrameTime = performance.now();
    animationFrame = requestAnimationFrame(animate);
  }

  function drawSelectionIndicator(
    ctx: CanvasRenderingContext2D,
    f: FishMarineLife
  ) {
    const headJoint = f.spineJoints?.[0];
    const x = headJoint?.x ?? f.x;
    const y = headJoint?.y ?? f.y;

    ctx.save();
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(x, y, f.bodyLength * 0.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawFishOverlay(ctx: CanvasRenderingContext2D, f: CharacterFish) {
    const headJoint = f.spineJoints?.[0];
    const x = headJoint?.x ?? f.x;
    const y = (headJoint?.y ?? f.y) - f.bodyLength - 20;

    ctx.save();
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = getMoodColor(f.mood ?? "calm");
    ctx.fillText(
      `${f.behavior} · ${f.intent ?? "cruise"} · ${f.mood ?? "calm"}`,
      x,
      y
    );

    if (f.focusPoint && f.attention?.kind !== "none") {
      ctx.strokeStyle = "rgba(34, 211, 238, 0.28)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(x, headJoint?.y ?? f.y);
      ctx.lineTo(f.focusPoint.x, f.focusPoint.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHomeZone(ctx: CanvasRenderingContext2D, f: FishMarineLife) {
    const homeZone = f.homeZone;
    if (!homeZone) return;

    const radius = 150;
    const isSelected = fishList[selectedFishIndex] === f;

    ctx.save();

    ctx.strokeStyle = isSelected
      ? `rgba(34, 211, 238, ${0.3 + homeZone.affinity * 0.4})`
      : `rgba(100, 150, 200, ${0.15 + homeZone.affinity * 0.2})`;
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.setLineDash([8, 8]);

    ctx.beginPath();
    ctx.arc(homeZone.x, homeZone.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (isSelected) {
      const headJoint = f.spineJoints?.[0];
      const fishX = headJoint?.x ?? f.x;
      const fishY = headJoint?.y ?? f.y;

      ctx.strokeStyle = "rgba(34, 211, 238, 0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(fishX, fishY);
      ctx.lineTo(homeZone.x, homeZone.y);
      ctx.stroke();

      ctx.fillStyle = "rgba(34, 211, 238, 0.6)";
      ctx.beginPath();
      ctx.arc(homeZone.x, homeZone.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawHunts(ctx: CanvasRenderingContext2D) {
    const fishAnimator = backgroundSystem?.getFishAnimator?.();
    if (!fishAnimator) return;

    const huntingHandler = fishAnimator.getHuntingHandler?.();
    if (!huntingHandler) return;

    const activeHunts = huntingHandler.getActiveHunts();
    const actualFish = backgroundSystem?.getFish?.() ?? [];
    const fishById = new Map(actualFish.map((f) => [f.fishId ?? 0, f]));

    for (const hunt of activeHunts) {
      const predator = fishById.get(hunt.hunterId);
      const prey = fishById.get(hunt.targetId);
      if (!predator || !prey) continue;

      const predatorHead = predator.spineJoints?.[0];
      const predatorX = predatorHead?.x ?? predator.x;
      const predatorY = predatorHead?.y ?? predator.y;

      const preyHead = prey.spineJoints?.[0];
      const preyX = preyHead?.x ?? prey.x;
      const preyY = preyHead?.y ?? prey.y;

      ctx.save();

      const isChasing = hunt.state === "chasing";
      ctx.strokeStyle = isChasing
        ? "rgba(239, 68, 68, 0.6)"
        : "rgba(249, 115, 22, 0.4)";
      ctx.lineWidth = isChasing ? 2 : 1;
      ctx.setLineDash(isChasing ? [] : [6, 6]);

      ctx.beginPath();
      ctx.moveTo(predatorX, predatorY);
      ctx.lineTo(preyX, preyY);
      ctx.stroke();

      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = isChasing ? "#ef4444" : "#f97316";
      ctx.fillText(
        hunt.state.toUpperCase(),
        predatorX,
        predatorY - predator.bodyLength - 8
      );

      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(preyX, preyY, 12, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
  }

  function stopAnimation() {
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  // Forward canvas-relative cursor position to the ocean system so fish flee.
  // The canvas backing-store px == offsetX/offsetY here because the canvas is
  // sized to its container (width/height set in initializeSystem/handleResize)
  // and CSS-stretched to fill, so offset coords map to logical fish-space px.
  function handleOceanPointerMove(e: MouseEvent) {
    backgroundSystem?.setPointer?.(e.offsetX, e.offsetY, true);
  }

  function handleOceanPointerLeave() {
    backgroundSystem?.setPointer?.(0, 0, false);
  }

  function handleResize() {
    if (!canvas || !backgroundSystem) return;

    const containerEl = canvas.parentElement;
    if (containerEl) {
      const oldWidth = canvas.width;
      const oldHeight = canvas.height;
      canvas.width = containerEl.clientWidth;
      canvas.height = containerEl.clientHeight;
      const oldDimensions = { width: oldWidth, height: oldHeight };
      const newDimensions = { width: canvas.width, height: canvas.height };
      backgroundSystem.handleResize?.(oldDimensions, newDimensions);

      if (coralRenderer.isReady()) {
        coralRenderer.handleResize(
          oldWidth,
          oldHeight,
          canvas.width,
          canvas.height
        );
      }
    }
  }

  async function regenerate() {
    stopAnimation();
    if (backgroundSystem) {
      backgroundSystem.cleanup?.();
    }
    coralRenderer.cleanup();
    backgroundSystem = null;
    await initializeSystem();
  }

  async function replaySeed() {
    const seed = simulationSeed.trim();
    if (!seed) {
      toast.error("Enter a replay seed first.");
      return;
    }
    if (!characterBackgrounds.setOceanFishSimulationSeed) {
      toast.error("This backgrounds build does not include fish replay yet.");
      return;
    }
    characterBackgrounds.setOceanFishSimulationSeed(seed);
    selectedFishIndex = 0;
    didSelectInitialResident = false;
    await regenerate();
  }

  function spawnFish() {
    if (!backgroundSystem || !canvas) return;
    const dimensions = { width: canvas.width, height: canvas.height };
    const fishAnimator = backgroundSystem.getFishAnimator();
    const newFish = fishAnimator.createFish(dimensions, true, true);
    backgroundSystem.getFish().push(newFish);
    stats = backgroundSystem.getStats();
    updateFishList();
  }

  function spawnJellyfish() {
    if (!backgroundSystem || !canvas) return;
    const dimensions = { width: canvas.width, height: canvas.height };
    const jellyfishAnimator = backgroundSystem.getJellyfishAnimator();
    const newJellyfish = jellyfishAnimator.createJellyfish(dimensions);
    backgroundSystem.getJellyfish().push(newJellyfish);
    stats = backgroundSystem.getStats();
  }

  function enableAllLayers() {
    layers = {
      gradient: true,
      lightRays: true,
      caustics: true,
      particles: true,
      bubbles: true,
      fish: true,
      jellyfish: true,
    };
    if (backgroundSystem) {
      backgroundSystem.setLayerVisibility(layers);
    }
  }

  function setQuality(q: QualityLevel) {
    quality = q;
    regenerate();
  }

  function toggleLayer(layer: keyof OceanLayers) {
    layers[layer] = !layers[layer];
    if (backgroundSystem) {
      backgroundSystem.setLayerVisibility(layers);
    }
  }

  async function toggleCoral() {
    showCoral = !showCoral;
    if (showCoral && !coralRenderer.isReady() && canvas) {
      await coralRenderer.initialize(canvas.width, canvas.height);
      coralCount = coralRenderer.getCoralCount();
    }
  }

  function selectNextFish() {
    if (fishList.length === 0) return;
    selectedFishIndex = (selectedFishIndex + 1) % fishList.length;
  }

  function selectPrevFish() {
    if (fishList.length === 0) return;
    selectedFishIndex =
      (selectedFishIndex - 1 + fishList.length) % fishList.length;
  }

  function triggerMood(mood: FishMood) {
    const actualFish = backgroundSystem?.getFish?.();
    if (!actualFish || actualFish.length === 0) return;

    const f = actualFish[selectedFishIndex];
    if (!f) return;

    f.mood = mood;
    f.moodTimer = 0;
    (f as ManualMoodFish)._manualMoodSetAt = performance.now();

    activeMoodTrigger = mood;
    const moodTimer = setTimeout(() => {
      if (activeMoodTrigger === mood) activeMoodTrigger = null;
    }, 300);
    feedbackTimers.add(moodTimer);
  }

  function triggerWobble(wobbleType: FishMarineLife["wobbleType"]) {
    const actualFish = backgroundSystem?.getFish?.();
    if (!actualFish || actualFish.length === 0) return;

    const f = actualFish[selectedFishIndex];
    if (!f) return;

    f.wobbleType = wobbleType;
    f.wobbleTimer = 1.2;
    f.wobbleIntensity = 1;

    activeWobbleTrigger = wobbleType ?? null;
    const wobbleTimer = setTimeout(() => {
      if (activeWobbleTrigger === wobbleType) activeWobbleTrigger = null;
    }, 300);
    feedbackTimers.add(wobbleTimer);
  }

  onMount(() => {
    initializeSystem();
    window.addEventListener("resize", handleResize);
  });

  onDestroy(() => {
    stopAnimation();
    for (const timer of feedbackTimers) clearTimeout(timer);
    feedbackTimers.clear();
    if (backgroundSystem) {
      backgroundSystem.cleanup?.();
    }
    coralRenderer.cleanup();
    window.removeEventListener("resize", handleResize);
  });

  const moodOptions: {
    mood: FishMood;
    label: string;
    icon: string;
    color: ColorPreset;
  }[] = [
    { mood: "calm", label: "Calm", icon: "water", color: "cyan" },
    { mood: "curious", label: "Curious", icon: "search", color: "default" },
    { mood: "alert", label: "Alert", icon: "exclamation", color: "amber" },
    { mood: "playful", label: "Playful", icon: "star", color: "emerald" },
    { mood: "tired", label: "Tired", icon: "bed", color: "gray" },
    { mood: "social", label: "Social", icon: "users", color: "rose" },
  ];

  const wobbleOptions: {
    type: NonNullable<FishMarineLife["wobbleType"]>;
    label: string;
    icon: string;
    color: ColorPreset;
  }[] = [
    { type: "curious_tilt", label: "Curious", icon: "search", color: "blue" },
    { type: "startled_dart", label: "Startle", icon: "bolt", color: "amber" },
    { type: "playful_wiggle", label: "Wiggle", icon: "star", color: "emerald" },
    { type: "tired_drift", label: "Drift", icon: "bed", color: "gray" },
  ];

  // Rare behavior options for manual triggering
  const rareBehaviorOptions: {
    type: string;
    label: string;
    icon: string;
    color: ColorPreset;
  }[] = [
    { type: "barrel_roll", label: "Roll", icon: "sync", color: "cyan" },
    { type: "freeze", label: "Freeze", icon: "snowflake", color: "blue" },
    { type: "double_take", label: "Look", icon: "eye", color: "amber" },
    { type: "happy_flip", label: "Flip", icon: "arrow-up", color: "emerald" },
    { type: "sync_swim", label: "Sync", icon: "link", color: "rose" },
  ];

  // Track active rare behavior triggers
  let activeRareTrigger = $state<string | null>(null);

  // Hunt stats for display
  let huntStats = $derived.by(() => {
    const fishAnimator = backgroundSystem?.getFishAnimator?.();
    if (!fishAnimator)
      return {
        activeHunts: 0,
        totalHunts: 0,
        successfulCatches: 0,
        escapes: 0,
      };
    const huntingHandler = fishAnimator.getHuntingHandler?.();
    if (!huntingHandler)
      return {
        activeHunts: 0,
        totalHunts: 0,
        successfulCatches: 0,
        escapes: 0,
      };
    return huntingHandler.getStats();
  });

  function forceHuntOnSelected() {
    const actualFish = backgroundSystem?.getFish?.();
    if (!actualFish || actualFish.length < 2) return;

    const fishAnimator = backgroundSystem?.getFishAnimator?.();
    if (!fishAnimator) return;

    const huntingHandler = fishAnimator.getHuntingHandler?.();
    if (!huntingHandler) return;

    const selected = actualFish[selectedFishIndex];
    if (!selected) return;

    // If selected is a predator, find prey
    // If selected is prey, find a predator to hunt it
    if (huntingHandler.isPredator(selected)) {
      const prey = actualFish.find(
        (f) => huntingHandler.isPrey(f) && f !== selected
      );
      if (prey) {
        huntingHandler.forceHunt(selected, prey, performance.now() / 1000);
      }
    } else if (huntingHandler.isPrey(selected)) {
      const predator = actualFish.find(
        (f) => huntingHandler.isPredator(f) && f !== selected
      );
      if (predator) {
        huntingHandler.forceHunt(predator, selected, performance.now() / 1000);
      }
    }
  }

  function triggerRareBehavior(type: string) {
    const actualFish = backgroundSystem?.getFish?.();
    if (!actualFish || actualFish.length === 0) return;

    const f = actualFish[selectedFishIndex];
    if (!f) return;

    // For sync swim, find a partner
    let partner: FishMarineLife | undefined;
    if (type === "sync_swim") {
      partner = actualFish.find((other, idx) => idx !== selectedFishIndex);
    }

    // Set wobble animation with appropriate duration
    const wobbleType = type as FishMarineLife["wobbleType"];
    f.wobbleType = wobbleType;
    f.wobbleTimer =
      type === "barrel_roll" ? 0.8 : type === "freeze" ? 0.6 : 0.5;
    f.wobbleIntensity = 1;

    if (partner && type === "sync_swim") {
      partner.wobbleType = "sync_pulse";
      partner.wobbleTimer = 0.4;
      partner.wobbleIntensity = 0.8;
    }

    activeRareTrigger = type;
    const rareTimer = setTimeout(() => {
      if (activeRareTrigger === type) activeRareTrigger = null;
    }, 300);
    feedbackTimers.add(rareTimer);
  }
</script>

<div class="ocean-lab">
  <div class="controls themed-scrollbar-accent">
    <div class="header">
      <h2>Ocean Lab</h2>
      <span class="badge">Interactive</span>
    </div>

    <!-- Status Bar -->
    <LabStatusBar counters={statusCounters} />

    <!-- Quick Commands -->
    <ChipGroup>
      <ChipToggle
        icon="sync"
        label="Regen"
        layout="vertical"
        color="cyan"
        onclick={regenerate}
      />
      <ChipToggle
        icon="plus"
        label="Fish"
        layout="vertical"
        color="cyan"
        onclick={spawnFish}
      />
      <ChipToggle
        icon="plus"
        label="Jelly"
        layout="vertical"
        color="cyan"
        onclick={spawnJellyfish}
      />
      <ChipToggle
        icon="eye"
        label="All On"
        layout="vertical"
        color="cyan"
        onclick={enableAllLayers}
      />
    </ChipGroup>

    <!-- Scene Layers -->
    <CollapsibleLabSection
      title="Layers"
      icon="fa-layer-group"
      defaultOpen={true}
      accentColor="cyan"
    >
      <ChipGroup>
        <ChipToggle
          label="Gradient"
          icon="fill-drip"
          active={layers.gradient}
          color="cyan"
          onclick={() => toggleLayer("gradient")}
        />
        <ChipToggle
          label="Rays"
          icon="sun"
          active={layers.lightRays}
          color="cyan"
          onclick={() => toggleLayer("lightRays")}
        />
        <ChipToggle
          label="Caustics"
          icon="water"
          active={layers.caustics}
          color="cyan"
          onclick={() => toggleLayer("caustics")}
        />
        <ChipToggle
          label="Particles"
          icon="dot-circle"
          active={layers.particles}
          color="cyan"
          onclick={() => toggleLayer("particles")}
        />
        <ChipToggle
          label="Bubbles"
          icon="circle"
          active={layers.bubbles}
          color="cyan"
          onclick={() => toggleLayer("bubbles")}
        />
        <ChipToggle
          label="Fish"
          icon="fish"
          active={layers.fish}
          color="cyan"
          onclick={() => toggleLayer("fish")}
        />
        <ChipToggle
          label="Jellyfish"
          icon="disease"
          active={layers.jellyfish}
          color="cyan"
          onclick={() => toggleLayer("jellyfish")}
        />
        <ChipToggle
          label="Coral"
          icon="seedling"
          active={showCoral}
          color="cyan"
          onclick={toggleCoral}
        />
      </ChipGroup>
    </CollapsibleLabSection>

    <!-- Quality -->
    <CollapsibleLabSection
      title="Quality"
      icon="fa-sliders-h"
      defaultOpen={false}
      accentColor="cyan"
    >
      <ChipGroup>
        <ChipToggle
          label="High"
          active={quality === "high"}
          color="cyan"
          onclick={() => setQuality("high")}
        />
        <ChipToggle
          label="Medium"
          active={quality === "medium"}
          color="cyan"
          onclick={() => setQuality("medium")}
        />
        <ChipToggle
          label="Low"
          active={quality === "low"}
          color="cyan"
          onclick={() => setQuality("low")}
        />
      </ChipGroup>
    </CollapsibleLabSection>

    <!-- Fish Behavior Section -->
    <CollapsibleLabSection
      title="Fish Behavior"
      icon="fa-fish"
      defaultOpen={false}
      accentColor="cyan"
    >
      <!-- Fish Selector -->
      <div class="fish-selector">
        <button
          class="nav-btn"
          onclick={selectPrevFish}
          disabled={fishList.length <= 1}
          aria-label="Previous fish"
        >
          <i class="fas fa-chevron-left"></i>
        </button>
        <span class="fish-index"
          >{selectedFishIndex + 1} / {fishList.length}</span
        >
        <button
          class="nav-btn"
          onclick={selectNextFish}
          disabled={fishList.length <= 1}
          aria-label="Next fish"
        >
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>

      <!-- Selected Fish Status -->
      {#if selectedFish}
        <LabStatusBar
          chips={statusChips}
          energy={{ value: selectedFish.energy ?? 1, label: "Energy" }}
        />
      {/if}

      <!-- Display Options -->
      <div class="display-options">
        <ChipToggle
          icon="eye"
          label="Overlay"
          color="cyan"
          active={showOverlay}
          onclick={() => (showOverlay = !showOverlay)}
        />
      </div>

      <!-- Mood Triggers -->
      <div class="subsection-label">Mood</div>
      <div class="trigger-grid cols-3">
        {#each moodOptions as { mood, label, icon, color }}
          <ChipToggle
            {icon}
            {label}
            {color}
            active={activeMoodTrigger === mood}
            onclick={() => triggerMood(mood)}
          />
        {/each}
      </div>

      <!-- Wobble Triggers -->
      <div class="subsection-label">Reactions</div>
      <div class="trigger-grid cols-2">
        {#each wobbleOptions as { type, label, icon, color }}
          <ChipToggle
            {icon}
            {label}
            {color}
            active={activeWobbleTrigger === type}
            onclick={() => triggerWobble(type)}
          />
        {/each}
      </div>

      <!-- Rare Behaviors -->
      <div class="subsection-label">Rare Behaviors</div>
      <div class="trigger-grid cols-3">
        {#each rareBehaviorOptions as { type, label, icon, color }}
          <ChipToggle
            {icon}
            {label}
            {color}
            active={activeRareTrigger === type}
            onclick={() => triggerRareBehavior(type)}
          />
        {/each}
      </div>

      <!-- Hunting -->
      <div class="subsection-label">Hunting</div>
      <div class="trigger-grid cols-2">
        <ChipToggle
          icon="crosshairs"
          label="Force Hunt"
          color="red"
          onclick={forceHuntOnSelected}
        />
      </div>
      <div class="hunt-stats">
        <span class="hunt-stat">
          <i class="fas fa-bullseye"></i>
          {huntStats.activeHunts} active
        </span>
        <span class="hunt-stat">
          <i class="fas fa-check"></i>
          {huntStats.successfulCatches} catches
        </span>
        <span class="hunt-stat">
          <i class="fas fa-running"></i>
          {huntStats.escapes} escapes
        </span>
      </div>

      <!-- Fish Details -->
      {#if selectedFish}
        <div class="subsection-label">Details</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Species</span>
            <span class="info-value">{selectedFish.species}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Speed</span>
            <span class="info-value">{selectedFish.speed.toFixed(0)} px/s</span>
          </div>
          <div class="info-item">
            <span class="info-label">Cast</span>
            <span class="info-value"
              >{selectedFish.resident ? "Resident" : "Ambient"}</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">Intent</span>
            <span class="info-value">{selectedFish.intent ?? "Cruise"}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Attention</span>
            <span class="info-value"
              >{selectedFish.attention?.kind ?? "None"}</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">Salience</span>
            <span class="info-value"
              >{Math.round(
                (selectedFish.attention?.salience ?? 0) * 100
              )}%</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">Familiarity</span>
            <span class="info-value"
              >{Math.round(
                (selectedFish.memory?.cursorFamiliarity ?? 0) * 100
              )}%</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">Alarm</span>
            <span class="info-value"
              >{Math.round(
                (selectedFish.memory?.cursorAlarm ?? 0) * 100
              )}%</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">Known Fish</span>
            <span class="info-value"
              >{selectedFish.memory?.socialAffinity.size ?? 0}</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">Identity</span>
            <span class="info-value identity-value"
              >{selectedFish.identitySeed ?? "Classic"}</span
            >
          </div>
        </div>
        <div class="subsection-label">Fast-start Trace</div>
        <div class="info-grid motion-trace">
          <div class="info-item">
            <span class="info-label">Phase</span>
            <span class="info-value"
              >{selectedFish.escapeManeuver?.phase ??
                (selectedFish.lastEscapeMetrics ? "Complete" : "Idle")}</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">Events</span>
            <span class="info-value">{selectedFish.escapeEventCount ?? 0}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Stimulus</span>
            <span class="info-value"
              >{selectedFish.escapeManeuver?.source.kind ??
                selectedFish.lastEscapeMetrics?.sourceKind ??
                "None"}</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">Clock</span>
            <span class="info-value"
              >{selectedFish.escapeManeuver
                ? `${selectedFish.escapeManeuver.elapsed.toFixed(2)} / ${selectedFish.escapeManeuver.totalDuration.toFixed(2)} s`
                : `${(selectedFish.lastEscapeMetrics?.duration ?? 0).toFixed(2)} s`}</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">Speed</span>
            <span class="info-value"
              >{(selectedFish.speed / Math.max(1, selectedFish.bodyLength)).toFixed(
                2
              )} BL/s</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">Peak</span>
            <span class="info-value"
              >{(
                selectedFish.escapeManeuver?.peakObservedSpeedBodyLengths ??
                selectedFish.lastEscapeMetrics?.peakSpeedBodyLengths ??
                0
              ).toFixed(2)} BL/s</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">Curvature</span>
            <span class="info-value"
              >{(selectedFish.escapeManeuver?.curvature ?? 0).toFixed(2)}</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">Clearance</span>
            <span class="info-value"
              >{(
                selectedFish.escapeManeuver?.minimumClearanceBodyLengths ??
                selectedFish.lastEscapeMetrics?.minimumClearanceBodyLengths ??
                0
              ).toFixed(2)} BL</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">Acceleration</span>
            <span class="info-value"
              >{(
                selectedFish.escapeManeuver?.accelerationBodyLengths ??
                selectedFish.lastEscapeMetrics?.peakAccelerationBodyLengths ??
                0
              ).toFixed(1)} BL/s²</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">Jerk</span>
            <span class="info-value"
              >{(
                selectedFish.escapeManeuver?.jerkBodyLengths ??
                selectedFish.lastEscapeMetrics?.peakJerkBodyLengths ??
                0
              ).toFixed(1)} BL/s³</span
            >
          </div>
        </div>
        {#if selectedFish.personality}
          <PersonalityBars personality={selectedFish.personality} />
        {/if}
      {/if}

      <div class="subsection-label">Replay</div>
      <div class="seed-control">
        <label for="fish-simulation-seed">Simulation seed</label>
        <div class="seed-row">
          <input
            id="fish-simulation-seed"
            class="seed-input"
            bind:value={simulationSeed}
            autocomplete="off"
            spellcheck="false"
          />
          <button class="seed-button" type="button" onclick={replaySeed}>
            Reset cast
          </button>
        </div>
      </div>
    </CollapsibleLabSection>

    <!-- Debug -->
    <CollapsibleLabSection
      title="Debug"
      icon="fa-bug"
      defaultOpen={false}
      accentColor="red"
    >
      <div class="subsection-label">Rendering</div>
      <ChipGroup>
        <ChipToggle
          icon="bone"
          label="Spine"
          color="red"
          active={fishDebugConfig.useSpineRendering}
          onclick={() =>
            (fishDebugConfig.useSpineRendering =
              !fishDebugConfig.useSpineRendering)}
        />
        <ChipToggle
          icon="wave-square"
          label="Wobble"
          color="red"
          active={fishDebugConfig.enableWobble}
          onclick={() =>
            (fishDebugConfig.enableWobble = !fishDebugConfig.enableWobble)}
        />
        <ChipToggle
          icon="wind"
          label="Tail"
          color="red"
          active={fishDebugConfig.enableTailOscillation}
          onclick={() =>
            (fishDebugConfig.enableTailOscillation =
              !fishDebugConfig.enableTailOscillation)}
        />
        <ChipToggle
          icon="rocket"
          label="Propulsion"
          color="red"
          active={fishDebugConfig.enablePropulsion}
          onclick={() =>
            (fishDebugConfig.enablePropulsion =
              !fishDebugConfig.enablePropulsion)}
        />
      </ChipGroup>

      <div class="subsection-label">Social Behaviors</div>
      <ChipGroup>
        <ChipToggle
          icon="users"
          label="Flocking"
          color="amber"
          active={fishDebugConfig.enableFlocking}
          onclick={() =>
            (fishDebugConfig.enableFlocking = !fishDebugConfig.enableFlocking)}
        />
        <ChipToggle
          icon="handshake"
          label="Interact"
          color="amber"
          active={fishDebugConfig.enableInteractions}
          onclick={() =>
            (fishDebugConfig.enableInteractions =
              !fishDebugConfig.enableInteractions)}
        />
        <ChipToggle
          icon="magic"
          label="Rare"
          color="amber"
          active={fishDebugConfig.enableRareBehaviors}
          onclick={() =>
            (fishDebugConfig.enableRareBehaviors =
              !fishDebugConfig.enableRareBehaviors)}
        />
        <ChipToggle
          icon="home"
          label="Zones"
          color="amber"
          active={fishDebugConfig.enableHomeZones}
          onclick={() =>
            (fishDebugConfig.enableHomeZones =
              !fishDebugConfig.enableHomeZones)}
        />
        <ChipToggle
          icon="crosshairs"
          label="Hunting"
          color="red"
          active={fishDebugConfig.enableHunting}
          onclick={() =>
            (fishDebugConfig.enableHunting = !fishDebugConfig.enableHunting)}
        />
      </ChipGroup>

      <div class="subsection-label">Visualization</div>
      <ChipGroup>
        <ChipToggle
          icon="map-marker"
          label="Show Homes"
          color="cyan"
          active={fishDebugConfig.showHomeZones}
          onclick={() =>
            (fishDebugConfig.showHomeZones = !fishDebugConfig.showHomeZones)}
        />
        <ChipToggle
          icon="bolt"
          label="Show Interact"
          color="cyan"
          active={fishDebugConfig.showInteractions}
          onclick={() =>
            (fishDebugConfig.showInteractions =
              !fishDebugConfig.showInteractions)}
        />
        <ChipToggle
          icon="crosshairs"
          label="Show Hunts"
          color="red"
          active={fishDebugConfig.showHunts}
          onclick={() =>
            (fishDebugConfig.showHunts = !fishDebugConfig.showHunts)}
        />
      </ChipGroup>
      <p class="debug-hint">Also: window.fishDebugConfig</p>
    </CollapsibleLabSection>

    <!-- Stats -->
    <CollapsibleLabSection
      title="Stats"
      icon="fa-chart-bar"
      defaultOpen={false}
      accentColor="cyan"
    >
      <div class="stats-grid">
        <div class="stat">
          <span class="stat-value">{stats.fish}</span>
          <span class="stat-label">Fish</span>
        </div>
        <div class="stat">
          <span class="stat-value">{stats.jellyfish}</span>
          <span class="stat-label">Jellyfish</span>
        </div>
        <div class="stat">
          <span class="stat-value">{stats.bubbles}</span>
          <span class="stat-label">Bubbles</span>
        </div>
        <div class="stat">
          <span class="stat-value">{stats.particles}</span>
          <span class="stat-label">Particles</span>
        </div>
      </div>
    </CollapsibleLabSection>
  </div>

  <div class="preview">
    {#if isLoading}
      <div class="loading-overlay">
        <i class="fas fa-spinner fa-spin"></i>
        <span>Loading ocean...</span>
      </div>
    {:else if initError}
      <div class="error-overlay" role="alert">
        <i class="fas fa-triangle-exclamation"></i>
        <span class="error-title">Ocean Lab failed to load</span>
        <span class="error-detail">{initError}</span>
        <button class="retry-btn" onclick={regenerate}>
          <i class="fas fa-rotate-right"></i>
          Retry
        </button>
      </div>
    {/if}
    <canvas
      bind:this={canvas}
      onmousemove={handleOceanPointerMove}
      onmouseleave={handleOceanPointerLeave}
    ></canvas>
  </div>
</div>

<style>
  .ocean-lab {
    display: grid;
    grid-template-columns: 360px 1fr;
    gap: 20px;
    height: 100%;
    min-height: 600px;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: var(--theme-panel-bg, rgba(15, 15, 25, 0.8));
    border-radius: 16px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    overflow-y: auto;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: #ffffff;
  }

  .badge {
    padding: 4px 10px;
    background: linear-gradient(
      135deg,
      rgba(6, 182, 212, 0.3),
      rgba(34, 211, 238, 0.3)
    );
    border: 1px solid rgba(34, 211, 238, 0.4);
    border-radius: 20px;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    color: #22d3ee;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Fish Selector */
  .fish-selector {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-bottom: 8px;
  }

  .nav-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 50%;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  @media (hover: hover) {
    .nav-btn:hover:not(:disabled) {
      background: rgba(34, 211, 238, 0.15);
      border-color: rgba(34, 211, 238, 0.3);
      color: #22d3ee;
    }
  }

  .nav-btn:active:not(:disabled) {
    transform: scale(0.92);
  }

  .nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .fish-index {
    font-size: 1rem;
    font-weight: 600;
    color: #22d3ee;
    min-width: 60px;
    text-align: center;
  }

  /* Display options */
  .display-options {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  /* Subsection labels */
  .subsection-label {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 8px;
    margin-bottom: 4px;
  }

  /* Trigger Grids */
  .trigger-grid {
    display: grid;
    gap: 8px;
  }

  .trigger-grid.cols-2 {
    grid-template-columns: repeat(2, 1fr);
  }

  .trigger-grid.cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }

  /* Info Grid */
  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 8px;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .info-label {
    font-size: var(--font-size-compact, 0.75rem);
    color: #9ca3af;
    text-transform: uppercase;
  }

  .info-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: #22d3ee;
    text-transform: capitalize;
  }

  .identity-value {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.75rem;
    text-transform: none;
  }

  .seed-control {
    display: grid;
    gap: 6px;
  }

  .seed-control label {
    color: #9ca3af;
    font-size: 0.875rem;
  }

  .seed-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .seed-input,
  .seed-button {
    min-height: 40px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    font: inherit;
    font-size: 0.875rem;
  }

  .seed-input {
    min-width: 0;
    padding: 0 10px;
    background: rgba(255, 255, 255, 0.04);
    color: #e5e7eb;
  }

  .seed-button {
    padding: 0 12px;
    background: rgba(34, 211, 238, 0.12);
    color: #67e8f9;
    cursor: pointer;
  }

  .seed-input:focus-visible,
  .seed-button:focus-visible {
    outline: 2px solid #22d3ee;
    outline-offset: 2px;
  }

  @media (hover: hover) {
    .seed-button:hover {
      background: rgba(34, 211, 238, 0.2);
      border-color: rgba(34, 211, 238, 0.35);
    }
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-radius: 10px;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: #22d3ee;
  }

  .stat-label {
    font-size: var(--font-size-compact, 0.75rem);
    color: #9ca3af;
    text-transform: uppercase;
  }

  /* Hunt Stats */
  .hunt-stats {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 8px;
  }

  .hunt-stat {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-compact, 0.75rem);
    color: #9ca3af;
  }

  .hunt-stat i {
    font-size: 0.6rem;
    color: #ef4444;
  }

  /* Debug Section */
  .debug-hint {
    font-size: var(--font-size-compact, 0.75rem);
    color: #9ca3af;
    margin-top: 8px;
    font-style: italic;
  }

  /* Preview */
  .preview {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
    background: #0a1628;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    height: 100%;
    min-height: 400px;
  }

  .preview canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: rgba(10, 22, 40, 0.9);
    color: #22d3ee;
    font-size: var(--font-size-min, 0.875rem);
    z-index: 10;
  }

  .loading-overlay i {
    font-size: 1.5rem;
  }

  .error-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px;
    text-align: center;
    background: rgba(10, 22, 40, 0.92);
    color: var(--theme-error, #fb7185);
    z-index: 10;
  }

  .error-overlay i {
    font-size: 1.75rem;
  }

  .error-title {
    font-size: 1rem;
    font-weight: 600;
  }

  .error-detail {
    font-size: var(--font-size-min, 0.875rem);
    color: #9ca3af;
    max-width: 32ch;
  }

  .retry-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding: 8px 16px;
    background: rgba(34, 211, 238, 0.15);
    border: 1px solid rgba(34, 211, 238, 0.3);
    border-radius: 10px;
    color: #22d3ee;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .retry-btn:hover {
    background: rgba(34, 211, 238, 0.25);
  }

  .retry-btn:focus-visible {
    outline: 2px solid #22d3ee;
    outline-offset: 2px;
  }

  @media (max-width: 800px) {
    .ocean-lab {
      grid-template-columns: 1fr;
      grid-template-rows: auto 400px;
    }
  }

  .nav-btn:focus-visible {
    outline: 2px solid #22d3ee;
    outline-offset: 2px;
  }

  /* Accessibility: Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .nav-btn,
    .retry-btn {
      transition: none;
    }
  }

  /* Accessibility: High contrast */
  @media (prefers-contrast: high) {
    .controls,
    .preview {
      border: 2px solid rgba(255, 255, 255, 0.3);
    }

    .stat {
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .subsection-label,
    .stat-label,
    .info-label,
    .debug-hint {
      color: #d1d5db;
    }
  }
</style>
