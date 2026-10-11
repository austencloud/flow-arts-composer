import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function installMotionPreference(reduced: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: reduced })),
  });
}

afterEach(() => {
  document.documentElement.className = "";
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("deck releaser motion", () => {
  it("runs the mutation without starting motion when reduced motion is requested", async () => {
    installMotionPreference(true);
    const start = vi.fn();
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: start,
    });
    const mutate = vi.fn();
    const { runDeckReleaserTransition } =
      await import("#lib/features/choreo-card/components/deck-releaser/deck-releaser-motion.js");

    expect(runDeckReleaserTransition("stage", "forward", mutate)).toBeNull();
    expect(mutate).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    expect(document.documentElement.className).toBe("");
  });

  it("holds the motion classes until the named transition finishes", async () => {
    installMotionPreference(false);
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: vi.fn((update: () => void) => {
        update();
        return {
          ready: Promise.resolve(),
          updateCallbackDone: Promise.resolve(),
          finished,
          skipTransition: vi.fn(),
        };
      }),
    });
    const mutate = vi.fn();
    const { runDeckReleaserTransition } =
      await import("#lib/features/choreo-card/components/deck-releaser/deck-releaser-motion.js");

    expect(
      runDeckReleaserTransition("sidebar", "backward", mutate)
    ).not.toBeNull();
    expect(mutate).toHaveBeenCalledOnce();
    expect(
      document.documentElement.classList.contains("deck-motion-sidebar")
    ).toBe(true);
    expect(
      document.documentElement.classList.contains("deck-motion-backward")
    ).toBe(true);

    finish();
    await finished;
    await Promise.resolve();

    expect(document.documentElement.className).toBe("");
  });

  it("keeps mounted Gallery motion off layout properties", () => {
    const galleryMotion = [
      source("src/lib/features/browse/gallery-home/GallerySplitPane.svelte"),
      source("src/lib/features/browse/gallery-home/GalleryPaneLeft.svelte"),
      source("src/lib/shared/browse/components/ExpandableSearchBar.svelte"),
    ].join("\n");

    expect(galleryMotion).not.toMatch(
      /transition\s*:\s*(?:all|width|grid-template-columns|flex-basis)/
    );
    expect(galleryMotion).not.toMatch(
      /transition\s*:[^;]*(?:grid-template-columns|flex-basis|flex-grow)/
    );
    expect(galleryMotion).toContain("prefers-reduced-motion: reduce");
  });

  it("routes every LOOP picker through the native modal owner", () => {
    const loopBoard = source(
      "src/lib/features/choreo-card/components/deck-releaser/LoopBentoBoard.svelte"
    );
    const modalTokens = source(
      "src/lib/shared/foundation/ui/modal/modal-tokens.css"
    );
    const loopModalStart = loopBoard.indexOf("<BaseModal");
    const loopModalEnd = loopBoard.indexOf("<BaseModal", loopModalStart + 1);
    const loopModal = loopBoard.slice(loopModalStart, loopModalEnd);

    expect(loopBoard.match(/<BaseModal/g)).toHaveLength(4);
    expect(loopBoard).not.toContain("modal-backdrop");
    expect(loopBoard).not.toContain('role="presentation"');
    expect(loopModal).toContain('animation="none"');
    expect(loopModal).toContain("<LOOPExpandedOverlay");
    expect(modalTokens).toContain(':not([data-animation="none"])');
  });
});
