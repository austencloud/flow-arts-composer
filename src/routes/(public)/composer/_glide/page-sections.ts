/**
 * Finds the sections ComposerExperience renders, so the stage moves the real
 * page instead of a copy of it.
 */

export interface ComposerSections {
  readonly page: HTMLElement;
  readonly sections: readonly HTMLElement[];
}

export function pageSections(root: HTMLElement): ComposerSections | null {
  const page = root.querySelector<HTMLElement>(".composer-page");
  if (!page) return null;
  const sections = [...page.children].filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.tagName === "SECTION"
  );
  return { page, sections };
}

/** A section's own heading, trimmed to a short label for the stop rail. */
export function sectionTitle(section: HTMLElement): string {
  const id = section.getAttribute("aria-labelledby");
  const heading = id
    ? document.getElementById(id)
    : section.querySelector("h1, h2");
  return (heading?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.:]$/, "");
}

/** Height of the fixed marketing header the stage and scroll targets clear. */
export function headerHeight(page: HTMLElement): number {
  const value = parseFloat(
    getComputedStyle(page).getPropertyValue("--marketing-header-h")
  );
  return Number.isFinite(value) ? value : 64;
}
