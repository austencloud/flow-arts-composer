import type { Options } from "modern-screenshot";

/**
 * Font Awesome 7 paints an icon with `content: var(--fa) / ""`: the glyph,
 * then an empty accessible name. modern-screenshot copies a pseudo-element's
 * content by stripping its quotes, so the rule it writes into the capture reads
 * `content: '<glyph> / ';` and the export draws a literal slash beside every
 * icon. The live page never shows it. A glyph is private-use text, which keeps
 * a real " / " in ordinary copy out of this rewrite.
 */
const ICON_WITH_ACCESSIBLE_NAME = /content:\s*'([\uE000-\uF8FF]+) \/ [^']*';/g;

function dropIconAccessibleNames(svg: SVGSVGElement): void {
  for (const style of svg.querySelectorAll("style")) {
    for (const part of style.childNodes) {
      if (part.nodeType !== Node.TEXT_NODE) continue;
      const css = (part as Text).data;
      const fixed = css.replace(ICON_WITH_ACCESSIBLE_NAME, "content: '$1';");
      if (fixed !== css) (part as Text).data = fixed;
    }
  }
}

/** Options every Post Studio DOM capture passes to modern-screenshot. */
export const POST_STUDIO_DOM_CAPTURE_OPTIONS = {
  onCreateForeignObjectSvg: dropIconAccessibleNames,
} satisfies Options;
