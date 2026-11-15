import { untrack } from "svelte";
import type {
  getSettings,
  updateSettings,
} from "#lib/shared/application/state/app-state.svelte.js";
import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { isHandPathSequence } from "#lib/shared/foundation/domain/models/sequence-kind.js";
import type { getSequenceMotionVisibility } from "#lib/shared/foundation/services/sequence-motion-profile.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { ImageCompositionSyncState } from "../components/image-composition-sync.svelte";
import { SequenceViewerVisibilityState } from "./viewer-visibility-state.svelte";

/** Which hand the viewer's Props picker edits while cat/dog mode is on. */
/** Which hand the prop picker addresses; "both" sets one prop for both hands. */
export type ViewerPropHand = "left" | "right" | "both";

interface ViewerPropVisibilityInputs {
  imageComposition: ImageCompositionSyncState;
  getSequence: () => SequenceData | null;
  getHandPathMode: () => boolean;
  getCollectionPropType?: () => PropType | null | undefined;
  getInitialLeftVisible: () => boolean | undefined;
  getInitialRightVisible: () => boolean | undefined;
  getAnimationServicesReady: () => boolean;
  getHapticService: () => HapticFeedback | null;
  onUrlParamChange: ((key: string, value: string) => void) | undefined;
}

interface ViewerPropVisibilityDependencies {
  getSettings: typeof getSettings;
  updateSettings: typeof updateSettings;
  getSequenceMotionVisibility: typeof getSequenceMotionVisibility;
  updateAnimationPropTypes: (
    leftPropType: PropType,
    rightPropType: PropType
  ) => void;
  setAnimationDarkMode: (darkMode: boolean) => void;
  encodePropForUrl: (propType: PropType) => string;
}

function applyMotionVisibility(
  state: SequenceViewerVisibilityState,
  visibility: { showLeftMotion: boolean; showRightMotion: boolean }
): void {
  state.reset();
  if (!visibility.showLeftMotion) state.setLeftMotion(false);
  if (!visibility.showRightMotion) state.setRightMotion(false);
}

export function createViewerPropVisibilityState(
  inputs: ViewerPropVisibilityInputs,
  dependencies: ViewerPropVisibilityDependencies
) {
  const settings = $derived(dependencies.getSettings());
  const isHandPath = $derived(
    inputs.getHandPathMode() ||
      isHandPathSequence(inputs.getSequence()) ||
      Boolean(inputs.getSequence()?.metadata?.isHandPathVisualization)
  );
  const leftPropType = $derived(settings.leftPropType);
  const rightPropType = $derived(settings.rightPropType);
  const catDogModeEnabled = $derived(settings.catDogMode);
  const activeLeftProp = $derived(
    isHandPath ? PropType.HAND : (leftPropType ?? PropType.STAFF)
  );
  const activeRightProp = $derived(
    isHandPath ? PropType.HAND : (rightPropType ?? PropType.STAFF)
  );
  const activeCatDog = $derived(
    isHandPath ? false : (catDogModeEnabled ?? false)
  );
  // The picker's Both / Left / Right choice. It opens on Both and is never
  // saved; the stored cat/dog flag just follows whether the hands differ.
  let propHand = $state<ViewerPropHand>("both");

  const viewerVisibility = new SequenceViewerVisibilityState();
  applyMotionVisibility(
    viewerVisibility,
    inputs.getSequence()
      ? dependencies.getSequenceMotionVisibility(inputs.getSequence()!)
      : { showLeftMotion: true, showRightMotion: true }
  );

  $effect(() => {
    const sequence = inputs.getSequence();
    void sequence?.id;
    const visibility = sequence
      ? dependencies.getSequenceMotionVisibility(sequence)
      : { showLeftMotion: true, showRightMotion: true };
    untrack(() => {
      applyMotionVisibility(viewerVisibility, {
        showLeftMotion:
          visibility.showLeftMotion && (inputs.getInitialLeftVisible() ?? true),
        showRightMotion:
          visibility.showRightMotion &&
          (inputs.getInitialRightVisible() ?? true),
      });
    });
  });

  $effect(() => {
    if (!inputs.getAnimationServicesReady()) return;
    try {
      dependencies.updateAnimationPropTypes(activeLeftProp, activeRightProp);
    } catch {
      // A viewer can select props before the animation service finishes
      // loading. The service reads the same settings when startup completes.
    }
  });

  function applyPropPair(
    leftPropType: PropType,
    rightPropType: PropType,
    catDogMode: boolean
  ): void {
    void dependencies.updateSettings({
      propViewingMode: "my-props",
      catDogMode,
      leftPropType,
      rightPropType,
    });
    if (inputs.getAnimationServicesReady()) {
      dependencies.updateAnimationPropTypes(leftPropType, rightPropType);
    }
  }

  /**
   * A single-grid picker passes no hand (or "both"): one prop for both hands,
   * cat/dog off. The hand-aware Props page passes the hand it is editing; the
   * other hand keeps its prop and a left pick moves on to the right, the order
   * the global prop drawer walks the pair.
   */
  function handlePropTypeChange(
    propType: PropType,
    hand: ViewerPropHand = "both"
  ): void {
    if (isHandPathSequence(inputs.getSequence())) return;
    if (hand !== "both") {
      const leftPropType = hand === "left" ? propType : activeLeftProp;
      const rightPropType = hand === "right" ? propType : activeRightProp;
      applyPropPair(
        leftPropType,
        rightPropType,
        leftPropType !== rightPropType
      );
      inputs.onUrlParamChange?.(
        hand === "left" ? "bp" : "rp",
        dependencies.encodePropForUrl(propType)
      );
      return;
    }
    applyPropPair(propType, propType, false);
    const encoded = dependencies.encodePropForUrl(propType);
    inputs.onUrlParamChange?.("bp", encoded);
    inputs.onUrlParamChange?.("rp", encoded);
  }

  function setPropHand(hand: ViewerPropHand): void {
    propHand = hand;
  }

  function handleUnifiedDarkModeToggle(): void {
    inputs.getHapticService()?.trigger("selection");
    const darkMode = !inputs.imageComposition.imgDarkMode;
    void dependencies.updateSettings({ darkMode });
    inputs.imageComposition.imageComposition.setDarkMode(darkMode);
    dependencies.setAnimationDarkMode(darkMode);
  }

  return {
    viewerVisibility,
    get isHandPath() {
      return isHandPath;
    },
    get activeLeftProp() {
      return activeLeftProp;
    },
    get activeRightProp() {
      return activeRightProp;
    },
    get activeCatDog() {
      return activeCatDog;
    },
    get propHand() {
      return propHand;
    },
    setPropHand,
    handlePropTypeChange,
    handleUnifiedDarkModeToggle,
  };
}

export type ViewerPropVisibilityState = ReturnType<
  typeof createViewerPropVisibilityState
>;
