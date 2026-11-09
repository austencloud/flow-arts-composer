import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const canvas = readFileSync(
  resolve(process.cwd(), "src/lib/shared/3d/components/Viewer3DCanvas.svelte"),
  "utf-8"
);

// The strict finger solver and its hidden motion-baking scene cost the public
// sequence viewer about ten seconds of CPU on a first visit. The web viewer
// never renders through Unreal, so it uses legacy contact unless a host asks.
describe("3D viewer canvas contact mode", () => {
  it("defaults to legacy contact through its prop", () => {
    expect(canvas).toMatch(/performerContactMode\?: ContactMode;/);
    expect(canvas).toMatch(/performerContactMode = "legacy",/);
  });

  it("reaches strict contact only through the prop, never a hardcoded value", () => {
    expect(canvas).not.toMatch(/"prop-authoritative"/);
    expect(canvas).not.toMatch(/const performerContactMode/);
  });

  it("asks the shared plan whether to bake motion, passing the contact mode", () => {
    expect(canvas).toMatch(
      /shouldPrepareWebMotion\(\{\s*contactMode: performerContactMode,/
    );
  });
});

const scene = readFileSync(
  resolve(process.cwd(), "src/lib/shared/3d/components/Viewer3DScene.svelte"),
  "utf-8"
);

// Props and effects used to appear seconds before the character they belong
// to. They now wait for that rig's character, and a failed character still
// shows them so the choreography is never hidden.
describe("3D viewer scene holds props for their character", () => {
  it("gates props and effects on the rig's own character", () => {
    expect(scene).toMatch(/showProps=\{choreographyShown\}/);
    expect(scene).toMatch(/showEffects=\{choreographyShown\}/);
    expect(scene).toMatch(
      /choreographyShownByPerformer\[performer\.id\] === performer\.characterId/
    );
  });

  it("shows props once the character is in, or when it fails", () => {
    expect(scene).toMatch(
      /onAvatarSwapped=\{\(characterId\) => \{[\s\S]*?showPerformerChoreography\(performer\.id, characterId\)/
    );
    expect(scene).toMatch(
      /onAvatarMotionReady=\{\(characterId, error\) => \{\s*if \(error\) showPerformerChoreography\(performer\.id, characterId\)/
    );
  });

  it("loads locomotion only for a performer who travels", () => {
    expect(scene).toMatch(
      /enableLocomotion=\{enablePerformerLocomotion && performer\.travels\}/
    );
  });

  it("applies the same travel gate in the worker renderer path", () => {
    const workerScene = readFileSync(
      resolve(
        process.cwd(),
        "src/lib/shared/3d/components/WorkerViewer3DScene.svelte"
      ),
      "utf-8"
    );
    expect(workerScene).toMatch(
      /enableLocomotion: enablePerformerLocomotion && performer\.travels,/
    );
  });
});

// The sequence page never mounts the app shell that ends app.html's boot
// screen, so its 15 s safety net used to end it.
describe("Sequence page ends the boot screen itself", () => {
  const page = readFileSync(
    resolve(
      process.cwd(),
      "src/routes/sequence/[id]/SequenceViewerPage.svelte"
    ),
    "utf-8"
  );
  const surface = readFileSync(
    resolve(
      process.cwd(),
      "src/lib/shared/sequence-viewer/components/ViewerMotionSurface.svelte"
    ),
    "utf-8"
  );

  it("finishes on the 3D reveal, or as soon as a 2D view is up", () => {
    expect(surface).toContain("data-scene-revealed={scene3DRevealed}");
    expect(page).toContain('[data-scene-revealed="true"]');
    expect(page).toMatch(/urlRenderMode !== "3d"[\s\S]*?finishBootScreen\(\)/);
  });
});
