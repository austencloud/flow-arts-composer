import type { BrowseViewMode } from "$lib/shared/browse/domain/browse-view-mode";
import { encodeViewMode } from "$lib/shared/browse/domain/browse-view-mode";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { getQRCodeGenerator } from "$lib/shared/qr/get-qr-code-generator";
import { encodeSequence } from "$lib/shared/navigation/services/sequence-encoder";

export interface ChoreoCardQrDeps {
  readonly sequence: SequenceData;
  readonly showQRCode: boolean;
  readonly qrUrl?: string;
  readonly darkMode: boolean;
  readonly isAuthenticated: boolean;
  readonly leftPropType: PropType | undefined;
  readonly rightPropType: PropType | undefined;
  readonly browseViewMode: BrowseViewMode | undefined;
}

export interface ChoreoCardQrServices {
  readonly getGenerator: typeof getQRCodeGenerator;
  readonly getUrlGenerator?: typeof getQRCodeGenerator;
}

/** Owns QR minting, stale-result rejection, and the per-card QR cache. */
export function createChoreoCardQrState(
  getDeps: () => ChoreoCardQrDeps,
  services: ChoreoCardQrServices
) {
  let dataUrl = $state<string | null>(null);
  let generating = $state(false);
  const cache = new Map<string, string>();
  let activeKey = "";

  const encodedViewMode = $derived.by(() => {
    const mode = getDeps().browseViewMode;
    return mode ? encodeViewMode(mode) : undefined;
  });

  const cacheKey = $derived.by(() => {
    const deps = getDeps();
    if (!deps.showQRCode) return "";
    if (deps.qrUrl) return `url:${deps.darkMode}:${deps.qrUrl}`;
    // Editing a sequence in place keeps its ID; its QR must follow the motions.
    const sequenceId = encodeSequence(deps.sequence);
    const authTag = deps.isAuthenticated ? "a" : "g";
    const leftProp = deps.leftPropType ?? "default";
    const rightProp = deps.rightPropType ?? "default";
    return `${sequenceId}:${deps.darkMode}:${authTag}:${leftProp}:${rightProp}${encodedViewMode ? `:${encodedViewMode}` : ""}`;
  });

  $effect(() => {
    const key = cacheKey;
    if (!key) {
      dataUrl = null;
      generating = false;
      activeKey = "";
      return;
    }

    if (key === activeKey) return;
    activeKey = key;

    const cached = cache.get(key);
    if (cached) {
      dataUrl = cached;
      generating = false;
      return;
    }

    const deps = getDeps();
    if (!deps.isAuthenticated && !deps.qrUrl) {
      dataUrl = null;
      generating = false;
      return;
    }

    const generator =
      deps.qrUrl && services.getUrlGenerator
        ? services.getUrlGenerator()
        : services.getGenerator();
    if (!generator) {
      generating = false;
      return;
    }

    // Never leave a previous sequence or prop pair's scan target on screen.
    dataUrl = null;
    generating = true;
    const options = {
      size: 200,
      margin: 1,
      style: "modern" as const,
      darkMode: deps.darkMode,
      leftPropType: deps.leftPropType ? String(deps.leftPropType) : undefined,
      rightPropType: deps.rightPropType
        ? String(deps.rightPropType)
        : undefined,
      viewMode: encodedViewMode,
    };
    void (
      deps.qrUrl
        ? generator.generateForUrl(deps.qrUrl, options)
        : generator.generateForSequence(deps.sequence, options)
    )
      .then((result) => {
        cache.set(key, result.dataUrl);
        if (activeKey === key) {
          dataUrl = result.dataUrl;
          generating = false;
        }
      })
      .catch(() => {
        // QR is optional. Settling the state prevents an indefinite spinner.
        if (activeKey === key) generating = false;
      });
  });

  const pending = $derived(getDeps().showQRCode && !dataUrl && generating);

  return {
    get dataUrl() {
      return dataUrl;
    },
    get pending() {
      return pending;
    },
    get settled() {
      return !cacheKey || (activeKey === cacheKey && !generating);
    },
  } as const;
}
