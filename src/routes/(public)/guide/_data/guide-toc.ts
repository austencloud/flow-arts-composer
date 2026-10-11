/**
 * The guide's table of contents as @austencloud/sidebar data. ONE source for
 * both presentations: the desktop rail (GuideRail, the package Sidebar) and
 * the phone/tablet drawer (GuideTocList). Every row carries a real `href`, so
 * both render crawlable anchors on the prerendered pages.
 *
 * Built from the manifests, never hand-authored:
 *  - Level 1: `bodyPagesByGroup()` - one `/guide/level-1/<slug>` route per
 *    topic, grouped 1.0 / 1.1 / 1.2. Row label = `seoForSlug(id, title).h1`,
 *    the same text the guide hub's contents use. Sub-topics get depth 1.
 *  - Level 2: `LEVEL2_SECTION_ANCHORS` - the real `<GuideSection id>` ids,
 *    each linking to the topic route that renders it
 *    (`LEVEL2_ANCHOR_ROUTE_SLUG`) with the section anchor.
 *  - Ratios, Motion paths, Codex: single links. Downloads: the three PDFs.
 *
 * Call it inside a `$derived` so locale changes re-run the labels.
 */
import type {
  ModuleDefinition,
  Section,
  SectionGroup,
} from "@austencloud/sidebar";
import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
import {
  bodyPagesByGroup,
  GROUP_TITLES,
} from "../level-1/_data/guide-manifest";
import { seoForSlug } from "../level-1/_data/guide-page-seo";
import { LEVEL2_SECTION_ANCHORS } from "../level-2/_data/guide-manifest";
import { LEVEL2_ANCHOR_ROUTE_SLUG } from "../level-2/_data/level2-topic-routes";

export const GUIDE_TOC_MODULE = {
  level1: "guide-level-1",
  level2: "guide-level-2",
  ratios: "guide-ratios",
  motionPaths: "guide-motion-paths",
  codex: "guide-codex",
  downloads: "guide-downloads",
} as const;

/** One accent for the whole guide; the rail's active glass is tinted by it. */
const GUIDE_ACCENT = "oklch(0.7 0.14 270)";

const icon = (name: string) =>
  `<i class="fa-solid fa-${name}" aria-hidden="true"></i>`;

const level2SectionKey = (id: string) =>
  `guide_runtime_section_${id.replaceAll("-", "_")}`;

export function buildGuideToc(): ModuleDefinition[] {
  const level1Groups: SectionGroup[] = [];
  const level1Sections: Section[] = [];
  for (const { group, entries } of bodyPagesByGroup()) {
    level1Groups.push({ id: group, label: `${group} ${GROUP_TITLES[group]}` });
    for (const { entry } of entries) {
      level1Sections.push({
        id: entry.id,
        label: seoForSlug(entry.id, entry.title).h1,
        href: `/guide/level-1/${entry.id}`,
        groupId: group,
        depth: entry.level,
      });
    }
  }

  const level2Groups: SectionGroup[] = [];
  const level2Sections: Section[] = [];
  for (const route of LEVEL2_SECTION_ANCHORS) {
    level2Groups.push({
      id: route.group,
      label: `${route.group} ${tDynamic(
        route.group === "2.0"
          ? "guide_l2_turns_title"
          : "guide_l2_double_turns_title"
      )}`,
    });
    for (const section of route.sections) {
      const slug = LEVEL2_ANCHOR_ROUTE_SLUG[section.id] ?? route.slug;
      level2Sections.push({
        id: section.id,
        label: tDynamic(level2SectionKey(section.id)),
        href: `/guide/level-2/${slug}#${section.id}`,
        groupId: route.group,
      });
    }
  }

  return [
    {
      id: GUIDE_TOC_MODULE.level1,
      label: tDynamic("guide_hub_level1_title"),
      icon: icon("book-open"),
      color: GUIDE_ACCENT,
      // "/guide/level-1" itself redirects into the app shell, so the chapter
      // opens its first public topic, the same door the guide hub uses.
      href: level1Sections[0]?.href ?? "/guide",
      groups: level1Groups,
      sections: level1Sections,
    },
    {
      id: GUIDE_TOC_MODULE.level2,
      label: tDynamic("guide_hub_level2_title"),
      icon: icon("rotate"),
      color: GUIDE_ACCENT,
      href: "/guide/level-2",
      groups: level2Groups,
      sections: level2Sections,
    },
    {
      id: GUIDE_TOC_MODULE.ratios,
      label: tDynamic("guide_hub_ratios_title"),
      icon: icon("scale-balanced"),
      color: GUIDE_ACCENT,
      href: "/guide/ratios",
      sections: [],
    },
    {
      id: GUIDE_TOC_MODULE.motionPaths,
      label: tDynamic("guide_hub_motion_paths_title"),
      icon: icon("bezier-curve"),
      color: GUIDE_ACCENT,
      href: "/guide/motion-paths",
      sections: [],
    },
    {
      id: GUIDE_TOC_MODULE.codex,
      label: tDynamic("guide_nav_codex"),
      icon: icon("table-cells"),
      color: GUIDE_ACCENT,
      href: "/guide/codex",
      sections: [],
    },
    {
      id: GUIDE_TOC_MODULE.downloads,
      label: tDynamic("guide_nav_downloads"),
      icon: icon("file-arrow-down"),
      color: GUIDE_ACCENT,
      // Literal keys, so the i18n unused-key scan still finds them.
      sections: [
        { id: "level1-pdf", label: tDynamic("guide_nav_level1_pdf") },
        { id: "level2-pdf", label: tDynamic("guide_nav_level2_pdf") },
        { id: "level3-pdf", label: tDynamic("guide_nav_level3_pdf") },
      ].map((row, i) => ({
        ...row,
        href: `/guides/level-${i + 1}.pdf`,
        download: true,
      })),
    },
  ];
}

/** The module the reader is inside, by pathname ("" on the hub). */
export function guideTocModuleFor(pathname: string): string {
  if (pathname.startsWith("/guide/level-1")) return GUIDE_TOC_MODULE.level1;
  if (pathname.startsWith("/guide/level-2")) return GUIDE_TOC_MODULE.level2;
  if (pathname === "/guide/ratios") return GUIDE_TOC_MODULE.ratios;
  if (pathname === "/guide/motion-paths") return GUIDE_TOC_MODULE.motionPaths;
  if (pathname.startsWith("/guide/codex")) return GUIDE_TOC_MODULE.codex;
  return "";
}

/**
 * The highlighted row. Level 1 topics are routes, so the slug; Level 2 rows
 * are in-page sections, so the live scroll-spy id from GuideSection.
 */
export function guideTocSectionFor(
  pathname: string,
  activeSectionId: string
): string {
  const level1 = /^\/guide\/level-1\/([^/]+)\/?$/.exec(pathname);
  if (level1) return level1[1] ?? "";
  if (pathname.startsWith("/guide/level-2")) return activeSectionId;
  return "";
}
