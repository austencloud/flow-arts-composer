import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  resolve(process.cwd(), "src/routes/sequence/[id]/+page.svelte"),
  "utf8"
);
const frameSource = readFileSync(
  resolve(process.cwd(), "src/routes/sequence/[id]/SequenceFirstFrame.svelte"),
  "utf8"
);
const serverSource = readFileSync(
  resolve(process.cwd(), "src/routes/sequence/[id]/+page.server.ts"),
  "utf8"
);

// This unit config compiles components for the client and cannot mount them,
// so these read the source, like the sibling route tests. The server HTML
// itself is checked with curl against a dev server in the lever report.
describe("sequence landing first frame (?frame=1)", () => {
  it("reads the flag on the server so SSR and the client agree", () => {
    expect(serverSource).toContain(
      'firstFrame: url.searchParams.get("frame") === "1"'
    );
  });

  it("renders outside the browser guard, only with the flag and a resolved fact", () => {
    expect(routeSource).toContain("data.firstFrame === true");
    expect(routeSource).toContain(
      "Boolean(data.meta.word || data.meta.thumbnailUrl)"
    );
    const frameBlock = routeSource.indexOf("{#if firstFrame && !viewerReady}");
    const browserGuard = routeSource.indexOf("{#if browser}");
    expect(frameBlock).toBeGreaterThan(-1);
    expect(frameBlock).toBeLessThan(browserGuard);
    expect(routeSource).toContain(
      "<SequenceFirstFrame meta={data.meta} session={loadingSession} />"
    );
  });

  it("draws the word as the heading and the stored thumbnail as an eager, sized image", () => {
    expect(frameSource).toMatch(/<h1[^>]*>\{word\}<\/h1>/);
    expect(frameSource).toContain("src={meta.thumbnailUrl}");
    expect(frameSource).toMatch(/width="\d+"/);
    expect(frameSource).toMatch(/height="\d+"/);
    expect(frameSource).toContain('fetchpriority="high"');
    expect(frameSource).not.toContain('loading="lazy"');
    // Nothing in the frame claims to be interactive before the viewer mounts.
    expect(frameSource).not.toMatch(/<(button|a|input)\b/);
    expect(frameSource).not.toMatch(/on(click|pointerdown|keydown)=/);
  });

  it("keeps the bare capsule, and no image, in the pending branch when the flag is off", () => {
    const pending = routeSource.slice(
      routeSource.indexOf("{#await viewerModule!}"),
      routeSource.indexOf("{:then")
    );
    expect(pending).toContain("{#if !firstFrame}");
    expect(pending).toContain(
      "<SequencePageLoading session={loadingSession} />"
    );
    expect(pending).not.toContain("<img");
    expect(pending).not.toContain("SequenceFirstFrame");
  });
});
