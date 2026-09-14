import type { SequenceData } from "../domain/models/sequence-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
import {
  captureActivePropConfig,
  resolveRecordedPropConfig,
  type ActivePropSettings,
  type ResolvedPropConfig,
} from "./recorded-prop-intent";

export type PropViewingMode = "my-props" | "as-saved";

export function viewingPropLabel(config: ResolvedPropConfig): string {
  const left = getPropTypeDisplayInfo(config.leftPropType).label;
  return config.leftPropType === config.rightPropType
    ? left
    : `${left} / ${getPropTypeDisplayInfo(config.rightPropType).label}`;
}

export function resolveViewingProps(
  settings: ActivePropSettings & { propViewingMode?: PropViewingMode },
  sequence?: SequenceData | null,
  collectionProp?: PropType | null
): {
  config: ResolvedPropConfig;
  source: "My props" | "Collection" | "Saved with sequence";
} {
  if (settings.propViewingMode === "as-saved") {
    if (collectionProp)
      return {
        config: {
          leftPropType: collectionProp,
          rightPropType: collectionProp,
          catDogMode: false,
        },
        source: "Collection",
      };
    const recorded = resolveRecordedPropConfig(sequence);
    if (recorded) return { config: recorded, source: "Saved with sequence" };
  }
  return { config: captureActivePropConfig(settings), source: "My props" };
}

export function withSavedProps(
  sequence: SequenceData,
  config: ResolvedPropConfig
): SequenceData {
  return {
    ...sequence,
    intendedProp: { ...config },
    creatorIntent: { ...sequence.creatorIntent, propConfig: { ...config } },
  };
}
