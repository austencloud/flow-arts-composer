/**
 * Static contract test for how the Post editor wires its music preview.
 *
 * The canvas, the workspace and the timeline are mounted by no jsdom test, so
 * a dropped attribute here breaks nothing that runs. Two things depend on that
 * wiring. Music whose file can't be loaded is left out of the preview clock
 * by the preview itself, but only the missing-file flag tells the Music row
 * and the Music panel why: without it the preview runs on in silence and
 * nothing says so. And a hidden tab stops animation frames but not the music
 * element, so without the visibility handler the music plays on past its out
 * point and the post's end.
 *
 * This test locks the wiring: the canvas hands the preview's report on, the
 * workspace holds the flag and passes it to the timeline row and the panel,
 * and the workspace pauses both players when the tab turns hidden.
 *
 * If this test fails, fix the component; do not loosen the assertions.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const read = (relative: string) =>
  readFileSync(path.join(repoRoot, relative), "utf8");

const EDITOR = "src/lib/shared/share/components/post-studio/editor";
const CANVAS = `${EDITOR}/PostEditorCanvas.svelte`;
const WORKSPACE = `${EDITOR}/PostEditorWorkspace.svelte`;
const TIMELINE = `${EDITOR}/timeline/PostTimeline.svelte`;

/**
 * Asserts a source holds a fragment. A failure names the fragment, not the
 * source, which would print thousands of lines.
 */
function expectIn(source: string, fragment: string | RegExp): void {
  const found =
    typeof fragment === "string"
      ? source.includes(fragment)
      : fragment.test(source);
  expect(found, `expected to find ${fragment}`).toBe(true);
}

/** A component's tag in a source, from its name to its closing `/>`. */
function tagOf(source: string, name: string): string {
  const start = source.search(new RegExp(`<${name}[\\s/>]`));
  expect(start, `<${name} is in the source`).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf("/>", start) + 2);
}

describe("how the Post editor wires its music preview", () => {
  it("the workspace pauses both players when the tab is hidden", () => {
    const source = read(WORKSPACE);
    const handler = /<svelte:document\s[^>]*onvisibilitychange=\{(\w+)\}/.exec(
      source
    )?.[1];
    expect(handler, "<svelte:document onvisibilitychange={...}>").toBeDefined();
    const start = source.indexOf(`function ${handler}(`);
    expect(start, `function ${handler}`).toBeGreaterThanOrEqual(0);
    const body = source.slice(start, source.indexOf("\n  }\n", start));
    expect(body).toContain('document.visibilityState === "hidden"');
    expect(body).toContain("editor.pause()");
    expect(body).toContain("session.pause()");
  });

  it("the canvas hands the preview's missing-file report to its owner", () => {
    const source = read(CANVAS);
    expect(tagOf(source, "PostMusicPreview")).toContain(
      "onMissing={onMusicMissing}"
    );
    // The prop is read from the canvas's own props, not from thin air.
    expectIn(source, /\n {4}onMusicMissing,\n/);
  });

  it("the workspace keeps the flag and passes it to the canvas, the timeline and the panel", () => {
    const source = read(WORKSPACE);
    expectIn(source, "let musicMissing = $state(false);");
    expect(tagOf(source, "PostEditorCanvas")).toContain("onMusicMissing=");
    expect(tagOf(source, "PostTimeline")).toContain("{musicMissing}");
    expect(tagOf(source, "PostMusicTool")).toContain("missing={musicMissing}");
  });

  it("the timeline passes the flag to the music row", () => {
    const source = read(TIMELINE);
    expect(tagOf(source, "PostTimelineMusicLane")).toContain(
      "missing={musicMissing}"
    );
    expectIn(source, /\n {4}musicMissing = false,\n/);
  });
});
