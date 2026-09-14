import { allocatePaneHeight } from "./pane-height-allocation";

/** `minmax(128px, 288px)` after computed styles resolve rem values. */
const TRACK_RANGE = /minmax\(\s*(min-content|[\d.]+px)\s*,\s*([\d.]+)px\s*\)/;
const TRACK_MINIMUM = /minmax\(\s*([\d.]+)px\s*,/;

interface GridTrackRange {
  minimum: number;
  maximum: number;
}

interface EditorMeasurement {
  fixed: number;
  rowCount: number;
  rowGap: number;
  rowMinimum: number;
  rowMaximum: number;
  rowBlock: HTMLElement | null;
}

const trackRangeCache = new WeakMap<HTMLElement, GridTrackRange>();

function boxChrome(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return (
    (Number.parseFloat(style.paddingTop) || 0) +
    (Number.parseFloat(style.paddingBottom) || 0) +
    (Number.parseFloat(style.borderTopWidth) || 0) +
    (Number.parseFloat(style.borderBottomWidth) || 0)
  );
}

function rowContentHeights(block: HTMLElement): number[] {
  const rows = new Map<number, number>();
  for (const child of block.children) {
    const item = child as HTMLElement;
    const box = item.getBoundingClientRect();
    if (box.height <= 0) continue;
    const key = Math.round(box.top);
    rows.set(key, Math.max(rows.get(key) ?? 0, item.scrollHeight));
  }
  return [...rows.values()];
}

function gridTrackRange(block: HTMLElement): GridTrackRange | null {
  const cached = trackRangeCache.get(block);
  if (cached) return cached;

  const style = getComputedStyle(block);
  if (style.display !== "grid" && style.display !== "inline-grid") return null;
  const match = TRACK_RANGE.exec(style.gridAutoRows);
  if (!match) return null;

  const rowContents = rowContentHeights(block);
  const contentMinimum = Math.max(0, ...rowContents);
  const minimum =
    match[1] === "min-content" ? contentMinimum : Number.parseFloat(match[1]!);
  const range = {
    minimum,
    maximum: Math.max(Number.parseFloat(match[2]!), minimum),
  };
  trackRangeCache.set(block, range);
  return range;
}

/**
 * Exported for the budget test. A child counts as present when it has any
 * content, not only when the last allocation left it room: the value list is
 * `flex: 0 1 auto; min-height: 0`, so a short editor squeezes it to 0px while
 * its rows still exist below the fold. Filtering on the laid-out box dropped
 * the list, measured the editor as header-only, handed the surplus to the
 * catalog, and every re-measure then saw the same 0px list — the sequence
 * picker locked at a 98px editor under a 720px catalog on 1440p and 4K.
 */
export function measureEditor(
  screen: HTMLElement,
  stage: HTMLElement
): EditorMeasurement {
  const screenStyle = getComputedStyle(screen);
  const visibleChildren = [...screen.children].filter(
    (child) =>
      child.getBoundingClientRect().height > 0 || child.scrollHeight > 0
  ) as HTMLElement[];
  let fixed = boxChrome(screen) + boxChrome(stage);
  if (visibleChildren.length > 1) {
    fixed +=
      (visibleChildren.length - 1) *
      (Number.parseFloat(screenStyle.rowGap) || 0);
  }

  let rowBlock: HTMLElement | null = null;
  let rowCount = 0;
  let rowGap = 0;
  let rowMinimum = 0;
  let rowMaximum = 0;

  for (const child of visibleChildren) {
    const range = rowBlock ? null : gridTrackRange(child);
    if (range) {
      const rows = rowContentHeights(child);
      rowBlock = child;
      rowCount = rows.length;
      rowGap = Number.parseFloat(getComputedStyle(child).rowGap) || 0;
      rowMinimum = range.minimum;
      rowMaximum = Math.max(range.maximum, ...rows);
      fixed += boxChrome(child);
      continue;
    }
    fixed += Math.max(child.getBoundingClientRect().height, child.scrollHeight);
  }

  return {
    fixed,
    rowCount,
    rowGap,
    rowMinimum,
    rowMaximum,
    rowBlock,
  };
}

function measureCatalogMinimum(catalog: HTMLElement): number {
  const grid = catalog.querySelector<HTMLElement>(".desktop-filter-grid");
  if (!grid) return Math.max(catalog.scrollHeight, catalog.offsetHeight);

  const rows = rowContentHeights(grid);
  const style = getComputedStyle(grid);
  const match = TRACK_MINIMUM.exec(style.gridAutoRows);
  if (!match || rows.length === 0) {
    return Math.max(catalog.scrollHeight, catalog.offsetHeight);
  }

  const rowMinimum = Number.parseFloat(match[1]!);
  const rowGap = Number.parseFloat(style.rowGap) || 0;
  return (
    boxChrome(catalog) +
    boxChrome(grid) +
    rows.length * rowMinimum +
    Math.max(0, rows.length - 1) * rowGap
  );
}

/**
 * Keeps the category catalog and active editor inside one measured column.
 * Each active option grid receives a fitted row height; its authored maximum
 * is only a ceiling. This makes the result independent of the previous screen
 * and prevents bounded choices from falling below the visible pane.
 */
export function heightBudget(node: HTMLElement, _key?: unknown) {
  let frame = 0;
  let settle: ReturnType<typeof setTimeout> | undefined;
  const styledBlocks = new Set<HTMLElement>();

  function clearAllocation(): void {
    node.style.removeProperty("--editor-size");
    node.style.removeProperty("--catalog-size");
    for (const block of styledBlocks) {
      block.style.removeProperty("--pane-row-size");
    }
    styledBlocks.clear();
  }

  function measure() {
    frame = 0;
    const catalog = node.querySelector<HTMLElement>(
      ".desktop-filter-catalog.catalog-layout"
    );
    const screens = node.querySelectorAll<HTMLElement>(
      ".drill-editor-stage .drill-screen"
    );
    const screen = screens[screens.length - 1];
    const stage = screen?.closest<HTMLElement>(".drill-editor-stage");
    if (!catalog || !screen || !stage || node.clientHeight <= 0) {
      clearAllocation();
      return;
    }

    const paneGap = Number.parseFloat(getComputedStyle(node).rowGap) || 0;
    const catalogStyle = getComputedStyle(catalog);
    const parsedCatalogMaximum = Number.parseFloat(catalogStyle.maxHeight);
    const editor = measureEditor(screen, stage);
    const allocation = allocatePaneHeight({
      availableHeight: Math.max(0, node.clientHeight - paneGap),
      catalogMinimum: measureCatalogMinimum(catalog),
      catalogMaximum: Number.isFinite(parsedCatalogMaximum)
        ? parsedCatalogMaximum
        : node.clientHeight,
      editorFixed: editor.fixed,
      rowCount: editor.rowCount,
      rowGap: editor.rowGap,
      rowMinimum: editor.rowMinimum,
      rowMaximum: editor.rowMaximum,
    });

    node.style.setProperty(
      "--editor-size",
      `${Math.max(0, allocation.editorHeight)}px`
    );
    node.style.setProperty(
      "--catalog-size",
      `${Math.max(0, allocation.catalogHeight)}px`
    );
    if (editor.rowBlock) {
      editor.rowBlock.style.setProperty(
        "--pane-row-size",
        `${Math.max(0, allocation.rowHeight)}px`
      );
      styledBlocks.add(editor.rowBlock);
    }
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(measure);
  }

  function scheduleSettled() {
    schedule();
    clearTimeout(settle);
    settle = setTimeout(schedule, 420);
  }

  const resize = new ResizeObserver(schedule);
  resize.observe(node);
  const mutations = new MutationObserver(schedule);
  mutations.observe(node, { childList: true, subtree: true });
  measure();
  scheduleSettled();

  return {
    update() {
      scheduleSettled();
    },
    destroy() {
      resize.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      clearAllocation();
    },
  };
}
