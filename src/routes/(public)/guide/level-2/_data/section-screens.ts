/**
 * Level 2 topics shown one screen at a time (2026-10-24 fit pass).
 *
 * A Level 2 topic is one or more hand-built GuideSection components, each a
 * heading, blocks of prose and showcase figures. The page reads those blocks
 * from the rendered sections (`readSectionUnits`) and splits them into
 * screens here, the same way Level 1's flow pages split: every section
 * starts a screen, each figure gets a screen with the words that lead into
 * it, notes after a figure stay with it while they are short, and a run of
 * words alone ends before it outgrows the window.
 */
import type { ScreenTier } from "../../_components/fit/guide-screen-url";

export type SectionUnit = {
  /** Which section of the topic (render order). */
  section: number;
  /** Element path inside the section: "3" is its fourth child, "1.2" the
      third child of its second child (a paragraph in a prose block). */
  path: string;
  kind: "heading" | "text" | "figure";
  /** Visible characters (text only). */
  chars: number;
  /** A figure's own caption, used to name its screen. */
  caption?: string;
};

export type SectionScreen = {
  section: number;
  paths: string[];
  label: string;
};

export type SplitRules = {
  /** A screen of words alone ends before it passes this many characters. */
  maxText: number;
  /** Words before a figure stay with it up to this many characters. */
  leadIn: number;
  /** Notes after a figure stay with it up to this many characters. */
  notes: number;
};

export const SPLIT_RULES: Readonly<Record<ScreenTier, SplitRules>> = {
  small: { maxText: 340, leadIn: 60, notes: 60 },
  medium: { maxText: 560, leadIn: 160, notes: 160 },
  large: { maxText: 900, leadIn: 500, notes: 500 },
};

export function splitSections(
  units: readonly SectionUnit[],
  titles: readonly string[],
  rules: SplitRules
): SectionScreen[] {
  const screens: SectionScreen[] = [];
  let cur: SectionUnit[] = [];
  let section = -1;
  let part = 0;

  const textOf = (list: SectionUnit[]) =>
    list.reduce((n, u) => n + (u.kind === "text" ? u.chars : 0), 0);
  const figureIn = (list: SectionUnit[]) => list.some((u) => u.kind === "figure");
  const flush = (keepFrom = cur.length) => {
    const done = cur.slice(0, keepFrom);
    cur = cur.slice(keepFrom);
    if (!done.some((u) => u.kind !== "heading")) {
      cur = [...done, ...cur];
      return;
    }
    const title = titles[section] ?? "";
    const caption = done.find((u) => u.kind === "figure" && u.caption)?.caption;
    screens.push({
      section,
      paths: done.map((u) => u.path),
      label: part === 0 ? title : (caption ?? `${title} ${part + 1}`),
    });
    part++;
  };

  for (const u of units) {
    if (u.section !== section) {
      if (cur.length) flush();
      cur = [];
      section = u.section;
      part = 0;
    }
    if (u.kind === "heading") {
      if (figureIn(cur)) flush();
      cur.push(u);
      continue;
    }
    if (u.kind === "text") {
      if (figureIn(cur)) {
        const fig = cur.findIndex((x) => x.kind === "figure");
        if (textOf(cur.slice(fig)) + u.chars > rules.notes) flush();
      } else if (textOf(cur) > 0 && textOf(cur) + u.chars > rules.maxText) {
        flush();
      }
      cur.push(u);
      continue;
    }
    // A figure: one per screen, with the words that lead into it. The
    // paragraph just before it leads in, even after an earlier figure.
    const last = cur[cur.length - 1];
    const leadIn =
      last && last.kind === "text" && last.chars <= rules.leadIn
        ? cur.length - 1
        : cur.length;
    if (figureIn(cur)) flush(leadIn);
    else if (textOf(cur) > rules.leadIn) {
      // Keep the last paragraph as the figure's lead-in when it is short.
      flush(leadIn);
    }
    cur.push(u);
  }
  if (cur.length) flush();
  return screens;
}

const FIGURE_SELECTOR = "svg, canvas, img, .canvas-box, .pictograph-wrapper";
const CAPTION_SELECTOR = "figcaption, .turn-strip-caption";

/** Reads each rendered `.guide-section` into screen units. */
export function readSectionUnits(sections: readonly Element[]): SectionUnit[] {
  const units: SectionUnit[] = [];
  const kindOf = (el: Element): SectionUnit["kind"] =>
    /^H[1-6]$/.test(el.tagName)
      ? "heading"
      : el.matches(FIGURE_SELECTOR) || el.querySelector(FIGURE_SELECTOR)
        ? "figure"
        : "text";
  const chars = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim().length;
  const caption = (el: Element) => {
    const text = el
      .querySelector(CAPTION_SELECTOR)
      ?.textContent?.replace(/\s+/g, " ")
      .trim();
    if (!text) return undefined;
    if (text.length <= 40) return text;
    // "S-High-One - both hands prospin; ..." names its screen "S-High-One".
    const name = text.split(/ [-–:] |: /)[0]?.trim();
    return name && name.length <= 32 ? name : undefined;
  };
  sections.forEach((section, s) => {
    Array.from(section.children).forEach((child, i) => {
      if (child.classList.contains("section-body")) {
        Array.from(child.children).forEach((g, j) => {
          const kind = kindOf(g);
          units.push({
            section: s,
            path: `${i}.${j}`,
            kind,
            chars: kind === "text" ? chars(g) : 0,
            caption: kind === "figure" ? caption(g) : undefined,
          });
        });
        return;
      }
      const kind = kindOf(child);
      units.push({
        section: s,
        path: String(i),
        kind,
        chars: kind === "text" ? chars(child) : 0,
        caption: kind === "figure" ? caption(child) : undefined,
      });
    });
  });
  return units;
}

/** Shows only the listed units of a rendered `.guide-section`. */
export function showOnlyUnits(section: Element, paths: readonly string[]): void {
  const keep = new Set(paths);
  Array.from(section.children).forEach((child, i) => {
    if (child.classList.contains("section-body")) {
      let any = false;
      Array.from(child.children).forEach((g, j) => {
        const on = keep.has(`${i}.${j}`);
        (g as HTMLElement).hidden = !on;
        any ||= on;
      });
      (child as HTMLElement).hidden = !any;
      return;
    }
    (child as HTMLElement).hidden = !keep.has(String(i));
  });
}
