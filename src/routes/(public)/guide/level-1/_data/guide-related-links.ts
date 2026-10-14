import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";

/** A standalone Guide page that builds on a Level 1 topic. */
export interface GuideRelatedLink {
  href: string;
  labelKey: TranslationKey;
  /** FontAwesome solid icon name, without the fa- prefix. */
  icon: string;
}

/**
 * Standalone Guide pages worth a chip in a Level 1 topic's title band, keyed
 * by topic slug. The topic teaches the concept; the linked page applies it.
 */
export const GUIDE_RELATED_LINKS: Readonly<
  Record<string, readonly GuideRelatedLink[]>
> = {
  "hm-type34": [
    {
      href: "/guide/zans-diamond",
      labelKey: "guide_related_zans_diamond",
      icon: "gem",
    },
  ],
};

export function guideRelatedLinks(slug: string): readonly GuideRelatedLink[] {
  return GUIDE_RELATED_LINKS[slug] ?? [];
}
