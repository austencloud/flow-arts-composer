import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import type { BrowseVisualType } from "#lib/shared/browse/navigation/browse-route-resolver.js";

/** The visual types with a shipped publication adapter today. Scenes join
 *  when Phase 5B gives them one. */
export type PublishedVisualType = Extract<
  BrowseVisualType,
  "tunnels" | "mandalas"
>;

export interface VisualTypeMeta {
  readonly route: PublishedVisualType;
  readonly artifactType: "tunnel" | "mandala";
  readonly labelKey: TranslationKey;
  readonly blurbKey: TranslationKey;
}

export const VISUAL_TYPES: readonly VisualTypeMeta[] = [
  {
    route: "tunnels",
    artifactType: "tunnel",
    labelKey: "browse_home_tunnels",
    blurbKey: "browse_visuals_tunnels_blurb",
  },
  {
    route: "mandalas",
    artifactType: "mandala",
    labelKey: "browse_home_mandalas",
    blurbKey: "browse_visuals_mandalas_blurb",
  },
];
