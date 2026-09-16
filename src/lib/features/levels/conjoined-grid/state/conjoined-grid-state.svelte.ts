/**
 * Conjoined Grid State Factory
 *
 * Manages reactive state for the unified conjoined grid tab across two modes:
 * - Browse: navigate real pictograph data, filter by junction overlaps
 * - Explore: auto-cycle through placement pair combinations, click-to-place
 *
 * Follows the factory + context pattern: DI services come in as arguments,
 * pure domain services (detectOverlaps, mapToTopology, enumerator) are called directly.
 */

import type { GridTopology, PointRef } from "$lib/shared/multi-grid/domain/models/grid-topology";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { PreparedPictographData } from "$lib/shared/pictograph/shared/domain/models/prepared-pictograph-data";
// The shared letter-query-handler types its grid-mode param with the wider
// grid-enums GridMode (6 values); we reference it here so the dep contract
// matches the real handler signature without a call-site cast.
import type { GridMode as PictographGridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { PrepareOptions } from "$lib/shared/pictograph/shared/services/types";
import type { PlacementPair } from "$lib/shared/multi-grid/services/types";
import type { ConjoinedGridMode, PropPlacement, JunctionOverlap } from "$lib/shared/conjoined-grid/domain/types";
import { TOPOLOGY_PRESETS, type TopologyPreset } from "$lib/shared/multi-grid/domain/constants/topology-presets";
import { detectOverlaps } from "../services/junction-overlap-detector";
import { mapToTopology } from "../services/pictograph-topology-mapper";
import { enumeratePlacementPairs } from "$lib/shared/multi-grid/services/topology-position-enumerator";

// Dependency contract - only the methods we actually call

export interface ConjoinedGridDeps {
  letterQueryHandler: {
    getAllPictographVariations(mode: PictographGridMode): Promise<PictographData[]>;
  };
  pictographPreparer: {
    prepareSingle(p: PictographData, opts?: PrepareOptions): Promise<PreparedPictographData>;
  };
}

// Public API contract

export interface ConjoinedGridState {
  // Topology
  readonly selectedPresetId: string;
  readonly topology: GridTopology;
  selectPreset(id: string): void;

  // Mode
  readonly activeMode: ConjoinedGridMode;
  setMode(mode: ConjoinedGridMode): void;

  // Browse
  readonly allPictographs: PictographData[];
  readonly selectedPictographIndex: number;
  readonly showOverlapsOnly: boolean;
  readonly overlappingIndices: number[];
  readonly preparedPictograph: PreparedPictographData | null;
  loadPictographs(): Promise<void>;
  nextPictograph(): void;
  prevPictograph(): void;
  toggleOverlapsOnly(): void;
  goToNextOverlap(): void;
  goToPrevOverlap(): void;

  // Explore
  readonly allPairs: PlacementPair[];
  readonly currentPairIndex: number;
  readonly isPlaying: boolean;
  readonly playbackSpeed: number;
  readonly manualPlacement: boolean;
  readonly manualLeftRef: PointRef | null;
  readonly manualRightRef: PointRef | null;
  play(): void;
  pause(): void;
  stepForward(): void;
  stepBack(): void;
  setSpeed(ms: number): void;
  toggleManualPlacement(): void;
  placeLeft(ref: PointRef): void;
  placeRight(ref: PointRef): void;

  // Shared derivations
  readonly currentPlacement: PropPlacement | null;
  readonly junctionOverlaps: JunctionOverlap[];
}

// Factory

export function createConjoinedGridState(deps: ConjoinedGridDeps): ConjoinedGridState {

  // Topology

  let selectedPresetId = $state(TOPOLOGY_PRESETS[0]!.id);

  const selectedPreset: TopologyPreset = $derived(
    TOPOLOGY_PRESETS.find((p) => p.id === selectedPresetId) ?? TOPOLOGY_PRESETS[0]!,
  );

  const topology: GridTopology = $derived(selectedPreset.build());

  function selectPreset(id: string): void {
    const exists = TOPOLOGY_PRESETS.some((p) => p.id === id);
    if (!exists) return;
    selectedPresetId = id;
    // Reset mode-specific indices when topology changes
    selectedPictographIndex = 0;
    currentPairIndex = 0;
  }

  // Mode

  let activeMode = $state<ConjoinedGridMode>("browse");

  function setMode(mode: ConjoinedGridMode): void {
    activeMode = mode;
  }

  // Browse mode

  let allPictographs = $state<PictographData[]>([]);
  let selectedPictographIndex = $state(0);
  let showOverlapsOnly = $state(false);
  let preparedPictograph = $state<PreparedPictographData | null>(null);

  // Indices of pictographs whose placement causes a junction overlap
  const overlappingIndices: number[] = $derived(
    allPictographs.reduce<number[]>((acc, picto, i) => {
      const placement = mapToTopology(picto, topology);
      if (placement && detectOverlaps(topology, placement).length > 0) {
        acc.push(i);
      }
      return acc;
    }, []),
  );

  async function loadPictographs(): Promise<void> {
    // Use the first grid's mode to query matching pictographs
    const gridMode = topology.grids[0]?.mode ?? "diamond";
    allPictographs = await deps.letterQueryHandler.getAllPictographVariations(gridMode);
    selectedPictographIndex = 0;
    await prepareCurrent();
  }

  async function prepareCurrent(): Promise<void> {
    const picto = allPictographs[selectedPictographIndex];
    if (!picto) {
      preparedPictograph = null;
      return;
    }
    preparedPictograph = await deps.pictographPreparer.prepareSingle(picto);
  }

  function nextPictograph(): void {
    if (allPictographs.length === 0) return;
    selectedPictographIndex = (selectedPictographIndex + 1) % allPictographs.length;
    prepareCurrent();
  }

  function prevPictograph(): void {
    if (allPictographs.length === 0) return;
    selectedPictographIndex =
      (selectedPictographIndex - 1 + allPictographs.length) % allPictographs.length;
    prepareCurrent();
  }

  function toggleOverlapsOnly(): void {
    showOverlapsOnly = !showOverlapsOnly;
    if (showOverlapsOnly && overlappingIndices.length > 0) {
      // Jump to the first overlapping pictograph
      selectedPictographIndex = overlappingIndices[0]!;
      prepareCurrent();
    }
  }

  function goToNextOverlap(): void {
    if (overlappingIndices.length === 0) return;
    const currentPos = overlappingIndices.findIndex((i) => i > selectedPictographIndex);
    selectedPictographIndex =
      currentPos >= 0 ? overlappingIndices[currentPos]! : overlappingIndices[0]!;
    prepareCurrent();
  }

  function goToPrevOverlap(): void {
    if (overlappingIndices.length === 0) return;
    // Find the last overlapping index that's before the current position
    const candidates = overlappingIndices.filter((i) => i < selectedPictographIndex);
    selectedPictographIndex =
      candidates.length > 0
        ? candidates[candidates.length - 1]!
        : overlappingIndices[overlappingIndices.length - 1]!;
    prepareCurrent();
  }

  // Explore mode

  let currentPairIndex = $state(0);
  let isPlaying = $state(false);
  let playbackSpeed = $state(500);
  let manualPlacement = $state(false);
  let manualLeftRef = $state<PointRef | null>(null);
  let manualRightRef = $state<PointRef | null>(null);

  // All (blue, red) placement pair combinations for the current topology
  const allPairs: PlacementPair[] = $derived(enumeratePlacementPairs(topology));

  function play(): void {
    if (allPairs.length === 0) return;
    isPlaying = true;
  }

  function pause(): void {
    isPlaying = false;
  }

  function stepForward(): void {
    if (allPairs.length === 0) return;
    currentPairIndex = (currentPairIndex + 1) % allPairs.length;
  }

  function stepBack(): void {
    if (allPairs.length === 0) return;
    currentPairIndex = (currentPairIndex - 1 + allPairs.length) % allPairs.length;
  }

  function setSpeed(ms: number): void {
    playbackSpeed = Math.max(50, ms);
  }

  function toggleManualPlacement(): void {
    manualPlacement = !manualPlacement;
    if (!manualPlacement) {
      manualLeftRef = null;
      manualRightRef = null;
    }
  }

  function placeLeft(ref: PointRef): void {
    manualLeftRef = ref;
  }

  function placeRight(ref: PointRef): void {
    manualRightRef = ref;
  }

  // Playback timer - advances currentPairIndex while isPlaying is true
  $effect(() => {
    if (!isPlaying) return;
    if (allPairs.length === 0) {
      isPlaying = false;
      return;
    }

    const interval = setInterval(() => {
      if (currentPairIndex >= allPairs.length - 1) {
        isPlaying = false;
        return;
      }
      currentPairIndex++;
    }, playbackSpeed);

    return () => clearInterval(interval);
  });

  // Shared derivations

  // The current placement from whichever mode is active
  const currentPlacement: PropPlacement | null = $derived.by(() => {
    if (activeMode === "browse") {
      const picto = allPictographs[selectedPictographIndex];
      if (!picto) return null;
      return mapToTopology(picto, topology);
    }

    // Explore mode
    if (manualPlacement) {
      if (!manualLeftRef || !manualRightRef) return null;
      return { left: manualLeftRef, right: manualRightRef };
    }

    const pair = allPairs[currentPairIndex];
    if (!pair) return null;
    return { left: pair.left, right: pair.right };
  });

  // Junction overlaps for the current placement
  const junctionOverlaps: JunctionOverlap[] = $derived(
    currentPlacement ? detectOverlaps(topology, currentPlacement) : [],
  );

  // Public API

  return {
    // Topology
    get selectedPresetId() {
      return selectedPresetId;
    },
    get topology() {
      return topology;
    },
    selectPreset,

    // Mode
    get activeMode() {
      return activeMode;
    },
    setMode,

    // Browse
    get allPictographs() {
      return allPictographs;
    },
    get selectedPictographIndex() {
      return selectedPictographIndex;
    },
    get showOverlapsOnly() {
      return showOverlapsOnly;
    },
    get overlappingIndices() {
      return overlappingIndices;
    },
    get preparedPictograph() {
      return preparedPictograph;
    },
    loadPictographs,
    nextPictograph,
    prevPictograph,
    toggleOverlapsOnly,
    goToNextOverlap,
    goToPrevOverlap,

    // Explore
    get allPairs() {
      return allPairs;
    },
    get currentPairIndex() {
      return currentPairIndex;
    },
    get isPlaying() {
      return isPlaying;
    },
    get playbackSpeed() {
      return playbackSpeed;
    },
    get manualPlacement() {
      return manualPlacement;
    },
    get manualLeftRef() {
      return manualLeftRef;
    },
    get manualRightRef() {
      return manualRightRef;
    },
    play,
    pause,
    stepForward,
    stepBack,
    setSpeed,
    toggleManualPlacement,
    placeLeft,
    placeRight,

    // Shared derivations
    get currentPlacement() {
      return currentPlacement;
    },
    get junctionOverlaps() {
      return junctionOverlaps;
    },
  };
}
