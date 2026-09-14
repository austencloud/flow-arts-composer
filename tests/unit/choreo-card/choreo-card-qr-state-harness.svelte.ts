import type { BrowseViewMode } from "$lib/shared/browse/domain/browse-view-mode";
import {
  createChoreoCardQrState,
  type ChoreoCardQrDeps,
} from "$lib/shared/choreo-card/state/choreo-card-qr-state.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { getQRCodeGenerator } from "$lib/shared/qr/get-qr-code-generator";

interface HarnessOptions {
  sequence: SequenceData;
  leftPropType: PropType;
  rightPropType: PropType;
  generateForSequence: ReturnType<
    typeof getQRCodeGenerator
  >["generateForSequence"];
  generateForUrl?: ReturnType<typeof getQRCodeGenerator>["generateForUrl"];
  isAuthenticated?: boolean;
  qrUrl?: string;
}

export function createChoreoCardQrStateHarness(options: HarnessOptions) {
  let deps = $state<ChoreoCardQrDeps>({
    sequence: options.sequence,
    showQRCode: true,
    darkMode: false,
    isAuthenticated: options.isAuthenticated ?? true,
    qrUrl: options.qrUrl,
    leftPropType: options.leftPropType,
    rightPropType: options.rightPropType,
    browseViewMode: undefined,
  });

  const generator = {
    generateForSequence: options.generateForSequence,
    generateForUrl: options.generateForUrl,
  } as ReturnType<typeof getQRCodeGenerator>;

  let qrState!: ReturnType<typeof createChoreoCardQrState>;
  const dispose = $effect.root(() => {
    qrState = createChoreoCardQrState(() => deps, {
      getGenerator: () => generator,
    });
  });

  return {
    get qrState() {
      return qrState;
    },
    setProps(leftPropType: PropType, rightPropType: PropType) {
      deps = { ...deps, leftPropType, rightPropType };
    },
    setViewMode(browseViewMode: BrowseViewMode | undefined) {
      deps = { ...deps, browseViewMode };
    },
    setQrUrl(qrUrl: string | undefined) {
      deps = { ...deps, qrUrl };
    },
    setSequence(sequence: SequenceData) {
      deps = { ...deps, sequence };
    },
    dispose,
  } as const;
}
