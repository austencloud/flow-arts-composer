import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { Snippet } from "svelte";
import type { UnifiedPlaybackContext } from "$lib/shared/timeline/unified-playback-context";
import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";

export interface StudioCardFrame {
  sequence: SequenceData;
  highlightedStepIndex: number;
  options: Partial<SequenceExportOptions> | null;
  automatic: boolean;
}

export interface StudioAnimationFrame {
  sequence: SequenceData;
  position: number;
  playing: boolean;
  left: PropState | null;
  right: PropState | null;
  step: SequenceData["steps"][number] | SequenceData["startPosition"] | null;
  leftPropType?: PropType;
  rightPropType?: PropType;
}

interface CanvasDestination {
  owner: object;
  target: HTMLElement;
  frame: () => StudioAnimationFrame;
}

export interface StudioControls {
  playing: boolean;
  bpm: number;
  propType: PropType;
  toggle: () => void;
  setBpm: (value: number) => void;
  setProp: (value: PropType) => void;
}

export function createViewerStudioSurfaces() {
  let active = $state(false);
  let canvas = $state.raw<HTMLElement | null>(null);
  let canvasHome = $state.raw<HTMLElement | null>(null);
  let inspector = $state.raw<HTMLElement | null>(null);
  let card = $state.raw<HTMLElement | null>(null);
  let cardDestinations = $state.raw<
    { owner: object; target: HTMLElement; frame: () => StudioCardFrame }[]
  >([]);
  let transport = $state.raw<HTMLElement | null>(null);
  let transportDestination = $state.raw<{
    target: HTMLElement;
    playback: UnifiedPlaybackContext;
    trailing: Snippet;
  } | null>(null);
  let externalInspectorTarget = $state.raw<HTMLElement | null>(null);
  let destinations = $state.raw<CanvasDestination[]>([]);
  let inspectorTarget = $state.raw<HTMLElement | null>(null);
  let inspectorContent = $state<"animation" | "card" | "studio">("animation");
  let movingSurfaces = $state<Record<string, boolean>>({});
  let controls = $state.raw<(() => StudioControls) | null>(null);
  let entry = $state({ position: 0, playing: false, bpm: 60, revision: 0 });
  return {
    get inspectorContent() {
      return inspectorContent;
    },
    setInspectorContent(content: "animation" | "card" | "studio") {
      // Keep the selected half while away, so returning never flashes the
      // animation controls before discovering that the Card was selected.
      inspectorContent = content;
    },
    get externalInspectorTarget() {
      return externalInspectorTarget;
    },
    setExternalInspectorTarget(target: HTMLElement | null) {
      externalInspectorTarget = target;
    },
    get cardTarget() {
      return active ? (cardDestinations[0]?.target ?? null) : null;
    },
    get cardFrame() {
      return active ? (cardDestinations[0]?.frame() ?? null) : null;
    },
    registerCard(node: HTMLElement) {
      card = node;
      return () => {
        if (card === node) card = null;
      };
    },
    ownsCard(owner: object) {
      return card !== null && cardDestinations[0]?.owner === owner;
    },
    requestCard(
      owner: object,
      target: HTMLElement,
      frame: () => StudioCardFrame
    ) {
      cardDestinations = [
        ...cardDestinations.filter((d) => d.owner !== owner),
        { owner, target, frame },
      ];
      return () => {
        cardDestinations = cardDestinations.filter((d) => d.owner !== owner);
      };
    },
    get transportAvailable() {
      return transport !== null;
    },
    get transportTarget() {
      return active ? (transportDestination?.target ?? null) : null;
    },
    get transportPlayback() {
      return active ? (transportDestination?.playback ?? null) : null;
    },
    get transportTrailing() {
      return active ? transportDestination?.trailing : undefined;
    },
    registerTransport(node: HTMLElement) {
      transport = node;
      return () => {
        if (transport === node) transport = null;
      };
    },
    requestTransport(
      target: HTMLElement,
      playback: UnifiedPlaybackContext,
      trailing: Snippet
    ) {
      transportDestination = { target, playback, trailing };
      return () => {
        if (transportDestination?.target === target)
          transportDestination = null;
      };
    },
    get active() {
      return active;
    },
    get entry() {
      return entry;
    },
    get canvasAvailable() {
      return canvas !== null;
    },
    get canvasHome() {
      return canvasHome;
    },
    get inspectorAvailable() {
      return inspector !== null;
    },
    get canvasTarget() {
      return active ? (destinations[0]?.target ?? null) : null;
    },
    get frame() {
      return active ? (destinations[0]?.frame() ?? null) : null;
    },
    get inspectorTarget() {
      return active ? inspectorTarget : null;
    },
    get moving() {
      return Object.values(movingSurfaces).some(Boolean);
    },
    get canvasMoving() {
      return movingSurfaces.canvas === true;
    },
    get controls() {
      return active ? (controls?.() ?? null) : null;
    },
    setControls(getControls: () => StudioControls) {
      controls = getControls;
      return () => {
        if (controls === getControls) controls = null;
      };
    },
    setMoving(value: boolean) {
      movingSurfaces.canvas = value;
    },
    setSurfaceMoving(surface: string, value: boolean) {
      movingSurfaces[surface] = value;
    },
    enter(position: number, playing: boolean, bpm: number) {
      entry = { position, playing, bpm, revision: entry.revision + 1 };
      active = true;
    },
    leave() {
      active = false;
    },
    registerCanvas(node: HTMLElement) {
      canvas = node;
      canvasHome = node.parentElement;
      return () => {
        if (canvas === node) {
          canvas = null;
          canvasHome = null;
        }
      };
    },
    registerInspector(node: HTMLElement) {
      inspector = node;
      return () => {
        if (inspector === node) inspector = null;
      };
    },
    requestCanvas(
      owner: object,
      target: HTMLElement,
      frame: () => StudioAnimationFrame
    ) {
      destinations = [
        ...destinations.filter((d) => d.owner !== owner),
        { owner, target, frame },
      ];
      return () => {
        destinations = destinations.filter((d) => d.owner !== owner);
      };
    },
    ownsCanvas(owner: object) {
      return canvas !== null && destinations[0]?.owner === owner;
    },
    requestInspector(target: HTMLElement) {
      inspectorTarget = target;
      return () => {
        if (inspectorTarget === target) inspectorTarget = null;
      };
    },
  };
}
export type ViewerStudioSurfaces = ReturnType<
  typeof createViewerStudioSurfaces
>;
