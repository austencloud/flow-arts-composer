import { SequenceAnimationOrchestrator } from "#lib/shared/animation-engine/services/sequence-animation-orchestrator.js";
import { AnimationStateManager } from "#lib/shared/animation-engine/services/animation-state-manager.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

interface HeadlessConfig {
  leftPropType: PropType;
  rightPropType: PropType;
  effortPreset?: string;
  pathShape?: string;
}

const HEADLESS_VISIBILITY_MANAGER: AnimationVisibilityStateManager = {
  getVisibility: () => true,
  setVisibility: () => {},
  isDarkMode: () => false,
  getPathShape: () => "arc",
  getEffortPreset: () => "glide",
  setSpeed: () => {},
  getSpeed: () => 1,
} as unknown as AnimationVisibilityStateManager;

export class HeadlessAnimationOrchestrator extends SequenceAnimationOrchestrator {
  private readonly headlessConfig: HeadlessConfig;

  constructor(config: HeadlessConfig) {
    const stateManager = new AnimationStateManager();

    super(stateManager);
    this.headlessConfig = config;

    const vm = {
      ...HEADLESS_VISIBILITY_MANAGER,
      getEffortPreset: () => config.effortPreset ?? "glide",
      getPathShape: () => config.pathShape ?? "arc",
    } as unknown as AnimationVisibilityStateManager;
    this.setVisibilityManager(vm);
  }

  protected override getDefaultPropConfig(): { leftPropType: PropType; rightPropType: PropType } {
    return {
      leftPropType: this.headlessConfig.leftPropType,
      rightPropType: this.headlessConfig.rightPropType,
    };
  }
}
