/**
 * Where the tool panel's measured box is published for the drawers that line
 * up with it (`--create-panel-top`, `-bottom`, `-left`, `-width`).
 *
 * The values used to sit on <html>. A custom property there is inherited by
 * every element, so each write restyled the whole page (about 2,400
 * elements) and a workspace mount paid for it in the middle of the Create
 * entry. Only drawers read them, so they live in one rule aimed at drawers:
 * a write restyles the drawers on the page, usually none.
 */

/** Every element that reads a `--create-panel-*` value. */
export const CREATE_PANEL_METRIC_READERS = ".drawer-overlay, .drawer-content";

let sheet: CSSStyleSheet | null = null;

function metricsStyle(): CSSStyleDeclaration | null {
  if (typeof document === "undefined") return null;
  // No constructed sheets (jsdom, Safari before 16.4): the root still works,
  // at the old cost.
  if (
    typeof CSSStyleSheet !== "function" ||
    !("adoptedStyleSheets" in document)
  ) {
    return document.documentElement.style;
  }
  if (!sheet || !document.adoptedStyleSheets.includes(sheet)) {
    sheet = new CSSStyleSheet();
    sheet.insertRule(`:is(${CREATE_PANEL_METRIC_READERS}) {}`, 0);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  return (sheet.cssRules[0] as CSSStyleRule).style;
}

export function setCreatePanelMetric(name: string, value: string): void {
  metricsStyle()?.setProperty(name, value);
}

export function clearCreatePanelMetric(name: string): void {
  metricsStyle()?.removeProperty(name);
}

export function readCreatePanelMetric(name: string): string {
  return metricsStyle()?.getPropertyValue(name) ?? "";
}
