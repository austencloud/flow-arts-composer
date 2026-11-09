/**
 * Level 2 topics shown one screen at a time (2026-10-24 fit pass).
 *
 * A Level 2 topic is one or more hand-built GuideSection components, each a
 * heading, blocks of prose and showcase figures. The page reads those blocks
 * from the rendered sections (`readSectionUnits`) and splits them into
 * screens here, the same way Level 1's flow pages split: on a page with a
 * figure no screen is words alone (2026-11-06). Every section starts a screen,
 * each figure gets a screen with the words that lead into it, notes after a
 * figure stay with it while the screen has room, and words that will not fit
 * with their figure run across several screens with the same figure on each.
 */
import { captionLabel, packPieces } from "../../_components/fit/pack-words";
import type { ScreenRoom } from "../../_components/fit/guide-screen-url";

export type SectionUnit = {
  /** Which section of the topic (render order). */
  section: number;
  /** Element path inside the section: "3" is its fourth child, "1.2" the
      third child of its second child (a paragraph in a prose block). "1.2@1-3"
      is that paragraph's second and third sentences. "2~bare" is figure 2
      without its caption, on the other screens its words run across. */
  path: string;
  kind: "heading" | "text" | "figure";
  /** Visible characters (text only). */
  chars: number;
  /** A figure's own caption, used to name its screen. */
  caption?: string;
  /** Its length, when the caption is read as part of the screen's words. */
  captionChars?: number;
  /** A paragraph's sentences' lengths, when it has more than one. */
  sentences?: number[];
};

export type SectionScreen = {
  section: number;
  paths: string[];
  label: string;
  /** A section with no figure of its own shows this one from the page's
      nearest section with a figure. */
  borrowed?: { section: number; path: string };
};

const HEADING_COST = 70;
const PARAGRAPH_COST = 20;

const costOf = (u: SectionUnit) =>
  u.kind === "heading" ? HEADING_COST : u.chars + PARAGRAPH_COST;

/** A paragraph longer than a screen breaks at its sentences. */
function pieces(words: readonly SectionUnit[], budget: number) {
  return words.flatMap((u) => {
    const lengths = u.sentences;
    if (u.kind !== "text" || !lengths || costOf(u) <= budget)
      return [{ piece: u, cost: costOf(u), leads: u.kind === "heading" }];
    return lengths.map((chars, n) => ({
      piece: { ...u, chars, path: `${u.path}@${n}-${n + 1}` },
      cost: chars + PARAGRAPH_COST,
      leads: false,
    }));
  });
}

type Stop = {
  figure: SectionUnit | null;
  words: SectionUnit[];
  /** How many of `words` read before the figure. */
  above: number;
};

const CAPTION_PATH = "~caption";
const BARE_PATH = "~bare";

export function splitSections(
  units: readonly SectionUnit[],
  titles: readonly string[],
  room: ScreenRoom
): SectionScreen[] {
  const figures = units.filter((u) => u.kind === "figure");
  const budget = figures.length > 0 ? room.band : room.alone;
  const sectionIds = [...new Set(units.map((u) => u.section))];
  const screens: SectionScreen[] = [];
  const wordsCost = (list: readonly SectionUnit[]) =>
    list.reduce((n, u) => n + costOf(u), 0);

  for (const section of sectionIds) {
    const stops: Stop[] = [];
    let pending: SectionUnit[] = [];
    for (const u of units) {
      if (u.section !== section) continue;
      if (u.kind === "figure") {
        stops.push({ figure: u, words: pending, above: pending.length });
        pending = [];
        continue;
      }
      const stop = stops[stops.length - 1];
      if (
        stop &&
        pending.length === 0 &&
        u.kind === "text" &&
        wordsCost(stop.words) + costOf(u) <= budget
      ) {
        stop.words.push(u);
      } else {
        pending.push(u);
      }
    }
    const last = stops[stops.length - 1];
    if (last) last.words.push(...pending);
    else stops.push({ figure: null, words: pending, above: pending.length });

    const title = titles[section] ?? "";
    let previous = title;
    let first = true;
    for (const stop of stops) {
      const figure = stop.figure;
      // The caption is words too: when the figure's words run across screens,
      // it reads once, in its place among them.
      const captionPiece: SectionUnit[] = figure?.captionChars
        ? [
            {
              section,
              path: figure.path + CAPTION_PATH,
              kind: "text",
              chars: figure.captionChars,
            },
          ]
        : [];
      const parts = packPieces(
        pieces(
          [
            ...stop.words.slice(0, stop.above),
            ...captionPiece,
            ...stop.words.slice(stop.above),
          ],
          budget
        ),
        budget
      );
      // A section with no figure, on a page that has one, shows the nearest.
      const lend =
        figure === null && figures.length > 0
          ? (figures.filter((f) => f.section < section).pop() ??
            figures.find((f) => f.section > section))
          : undefined;
      for (const [n, part] of (parts.length ? parts : [[]]).entries()) {
        const paths = part
          .map((u) => u.path)
          .filter((p) => !p.endsWith(CAPTION_PATH));
        if (figure) {
          const captioned =
            captionPiece.length === 0 ||
            part.some((u) => u.path === captionPiece[0]!.path);
          paths.push(figure.path + (captioned ? "" : BARE_PATH));
        }
        const label =
          (first ? title : null) ||
          (n === 0 ? captionLabel(figure?.caption) : null) ||
          previous;
        previous = label;
        first = false;
        screens.push({
          section,
          paths: sortPaths(paths),
          label,
          ...(lend
            ? { borrowed: { section: lend.section, path: lend.path } }
            : {}),
        });
      }
    }
  }
  return screens;
}

/** Reading order: a section's elements, then each one's sentences. */
function sortPaths(paths: readonly string[]): string[] {
  const key = (p: string) =>
    p
      .split(/[@~]/)[0]!
      .split(".")
      .map((n) => Number(n));
  return [...paths].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] ?? -1) - (y[i] ?? -1);
      if (d !== 0) return d;
    }
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

const FIGURE_SELECTOR = "svg, canvas, img, .canvas-box, .pictograph-wrapper";
const CAPTION_SELECTOR = "figcaption, .turn-strip-caption";
const LIST_ITEM_MIN_CHARS = 70;

/** Reads each rendered `.guide-section` into screen units. */
export function readSectionUnits(sections: readonly Element[]): SectionUnit[] {
  const units: SectionUnit[] = [];
  const kindOf = (el: Element): SectionUnit["kind"] =>
    /^H[1-6]$/.test(el.tagName)
      ? "heading"
      : el.matches(FIGURE_SELECTOR) || el.querySelector(FIGURE_SELECTOR)
        ? "figure"
        : "text";
  const textLength = (el: Element) =>
    (el.textContent ?? "").replace(/\s+/g, " ").trim().length;
  // A list item takes a whole line however few characters it has, so a list
  // counts for what it fills, not for what it says.
  const chars = (el: Element) =>
    /^[UO]L$/.test(el.tagName)
      ? Array.from(el.children).reduce(
          (n, item) => n + Math.max(textLength(item), LIST_ITEM_MIN_CHARS),
          0
        )
      : textLength(el);
  // One entry per `.sentence` a paragraph renders, when it has more than one.
  const sentenceLengths = (el: Element): number[] | undefined => {
    const list = Array.from(el.querySelectorAll(":scope > .sentence"));
    return list.length > 1 ? list.map(textLength) : undefined;
  };
  const caption = (el: Element) =>
    el
      .querySelector(CAPTION_SELECTOR)
      ?.textContent?.replace(/\s+/g, " ")
      .trim() || undefined;
  const unit = (s: number, path: string, el: Element): SectionUnit => {
    const kind = kindOf(el);
    return {
      section: s,
      path,
      kind,
      chars: kind === "text" ? chars(el) : 0,
      caption: kind === "figure" ? caption(el) : undefined,
      captionChars: kind === "figure" ? caption(el)?.length : undefined,
      sentences: kind === "text" ? sentenceLengths(el) : undefined,
    };
  };
  sections.forEach((section, s) => {
    Array.from(section.children).forEach((child, i) => {
      if (child.classList.contains("section-body")) {
        Array.from(child.children).forEach((g, j) => {
          units.push(unit(s, `${i}.${j}`, g));
        });
        return;
      }
      units.push(unit(s, String(i), child));
    });
  });
  return units;
}

/** Shows only the listed units of a rendered `.guide-section`. */
export function showOnlyUnits(section: Element, paths: readonly string[]): void {
  const keep = new Set(paths.map((p) => p.split(/[@~]/)[0]!));
  const bare = new Set(
    paths.filter((p) => p.endsWith(BARE_PATH)).map((p) => p.split("~")[0]!)
  );
  // A paragraph shown in part: which of its sentences.
  const shown = new Map<string, Set<number>>();
  for (const p of paths) {
    const [path, range] = p.split("@");
    if (!range) continue;
    const [from, to] = range.split("-").map(Number);
    const set = shown.get(path!) ?? new Set<number>();
    for (let n = from!; n < to!; n++) set.add(n);
    shown.set(path!, set);
  }
  const applySentences = (el: Element, path: string) => {
    // Its caption reads on one of the screens its words run across.
      for (const c of el.querySelectorAll(CAPTION_SELECTOR))
        (c as HTMLElement).hidden = bare.has(path);
    const set = shown.get(path);
    Array.from(el.querySelectorAll(":scope > .sentence")).forEach((s, n) => {
      (s as HTMLElement).hidden = set ? !set.has(n) : false;
    });
  };
  Array.from(section.children).forEach((child, i) => {
    if (child.classList.contains("section-body")) {
      let any = false;
      Array.from(child.children).forEach((g, j) => {
        const on = keep.has(`${i}.${j}`);
        (g as HTMLElement).hidden = !on;
        if (on) applySentences(g, `${i}.${j}`);
        any ||= on;
      });
      (child as HTMLElement).hidden = !any;
      return;
    }
    const on = keep.has(String(i));
    (child as HTMLElement).hidden = !on;
    if (on) applySentences(child, String(i));
  });
}
