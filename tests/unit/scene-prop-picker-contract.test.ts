/**
 * Static contract test for the one-surface 3D prop picker.
 *
 * Choosing a 3D prop happens through the canonical BentoPropGrid, composed by
 * ScenePropPicker with the controls that only exist in a spatial scene. Before
 * that was true the performer inspector owned a second card grid, family
 * selector, and visual language that drifted from every other prop surface.
 *
 * This test locks the shape that fixed it: every host renders the shared
 * picker, no host reaches past it into its parts, and the picker's own choices
 * come from the catalog rather than a private list.
 *
 * The Prop Studio was the second host and is now none: it mounts
 * SceneControlWorkspace, the rail every other 3D stage carries, so its props
 * are chosen inside the performer inspector like everywhere else. It stays
 * below as a NON_HOST — it must never grow its own picker back.
 *
 * If this test fails, fix the host — do not loosen the assertions.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

const PICKER_PATH =
  "src/lib/shared/3d/components/controls/ScenePropPicker.svelte";
const CATALOG_PATH = "src/lib/shared/3d/domain/scene-prop-catalog.ts";
const VIEWER_SCENE_PATH = "src/lib/shared/3d/components/Viewer3DScene.svelte";
// BentoPropGrid is the app-wired entry; PropGrid is the picker's own markup.
// Assertions about what the canonical grid RENDERS read the body.
const BENTO_GRID_PATH =
  "src/lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
const BENTO_GRID_BODY_PATH =
  "src/lib/shared/settings/components/tabs/prop-type/PropGrid.svelte";
const SCENE_PACKAGE_PATCH = "patches/@austencloud__scene-3d@0.1.6.patch";

/** Every surface where a person picks a 3D prop. Add new ones here. */
const HOSTS: Record<string, string> = {
  "performer inspector": path.join(
    "src/lib/shared/3d/components/controls/PerformerHubDetail.svelte"
  ),
  "staff grip lab": path.join("src/routes/test/staff-grip/LabControls.svelte"),
};

/**
 * Surfaces that reach prop choice through the shared rail instead of hosting a
 * picker. They must stay that way: mounting a picker here would put a second
 * prop surface back on screen beside the inspector's.
 */
const NON_HOSTS: Record<string, string> = {
  "prop studio": "src/routes/test/prop-3d-studio/+page.svelte",
};

/**
 * The picker's own parts. A host importing one of these is building a second
 * prop picker, which is the exact drift this file exists to stop.
 */
const PICKER_INTERNALS = [
  "BentoPropGrid",
  "createGlobalChiralitySeam",
  "PropBuildPicker",
  "propFinishState",
  "finishPreviewOptions",
  "fanBuildPreviewOptions",
  "fanFramePreviewOptions",
  "fanCoverPreviewOptions",
];

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

describe("scene prop picker contract", () => {
  it("renders the shared picker on every host", () => {
    for (const [name, hostPath] of Object.entries(HOSTS)) {
      const source = read(hostPath);
      expect(source, `${name} must import ScenePropPicker`).toContain(
        "ScenePropPicker.svelte"
      );
      expect(source, `${name} must render <ScenePropPicker>`).toContain(
        "<ScenePropPicker"
      );
    }
  });

  it("keeps rail-driven surfaces from growing their own picker", () => {
    for (const [name, surfacePath] of Object.entries(NON_HOSTS)) {
      const source = read(surfacePath);
      expect(
        source.includes("<ScenePropPicker"),
        `${name} renders its own ScenePropPicker; it reaches prop choice through SceneControlWorkspace`
      ).toBe(false);
      expect(
        source,
        `${name} must mount SceneControlWorkspace to reach the shared picker`
      ).toContain("SceneControlWorkspace");
    }
  });

  it("keeps hosts out of the picker's internals", () => {
    for (const [name, hostPath] of Object.entries({
      ...HOSTS,
      ...NON_HOSTS,
    })) {
      const source = read(hostPath);
      for (const internal of PICKER_INTERNALS) {
        expect(
          source.includes(internal),
          `${name} imports ${internal}; that belongs inside ScenePropPicker`
        ).toBe(false);
      }
    }
  });

  it("has exactly one component that picks a 3D prop", () => {
    const picker = read(PICKER_PATH);
    expect(picker).toContain("BentoPropGrid");
    expect(picker).toContain("SCENE_PROP_TYPES");
    expect(picker).toContain("scene-prop-catalog");
  });

  it("reads which props exist from the catalog, not a private list", () => {
    const picker = read(PICKER_PATH);
    const catalog = read(CATALOG_PATH);

    // Supported scene props stay in the scene catalog while the canonical grid
    // owns their family labels, popovers, cards, and access behavior.
    expect(catalog).toContain("export const SCENE_PROP_REPRESENTATIVES");
    expect(picker).toContain("allowedProps={SCENE_PROP_TYPES}");
    expect(picker).not.toMatch(/PropType\.(MINIHOOP|BUUGENG|DOUBLESTAR)/);

    // Same for the build pictures.
    expect(catalog).toContain("/images/props/build-previews");
    expect(picker).not.toContain("/images/props/build-previews");
  });

  it("supports performer build overrides while preserving the scene-default fallback", () => {
    const picker = read(PICKER_PATH);
    expect(picker).toContain("onBuildChange?: (build: PropBuild) => void");
    expect(picker).toContain("buildOverride ?? propFinishState.build");
    for (const setter of [
      "propFinishState.set(",
      "propFinishState.setFanBuild(",
      "propFinishState.setFanFrameColor(",
      "propFinishState.setFanCover(",
    ]) {
      expect(picker, `picker must call ${setter}`).toContain(setter);
    }
  });

  it("adapts mixed selection, host scrolling, bare hands, and chirality without another grid", () => {
    const picker = read(PICKER_PATH);
    const canonicalGrid = read(BENTO_GRID_BODY_PATH);
    expect(picker).toContain("currentProp: PropType | null");
    expect(picker).toContain('scrollMode="host"');
    expect(picker).toContain("includeBareHands={showBareHands}");
    expect(picker).toContain("createGlobalChiralitySeam");
    expect(picker).not.toContain('class="prop-grid"');
    expect(picker).not.toContain('class="prop-tile"');
    expect(canonicalGrid).toContain(
      "prop === PropType.HAND && includeBareHands"
    );
  });

  it("drills into families inside the picker and gives Escape to the local layer", () => {
    const canonicalGrid = read(BENTO_GRID_BODY_PATH);
    // The entry is a pass-through, so the drill-down cannot have moved up into
    // it while these assertions pass against the body.
    expect(read(BENTO_GRID_PATH)).toContain("<PropGrid");

    // A family's styles replace the grid at full tile size behind a back bar;
    // nothing floats in a popover that could clip or shrink its tiles.
    expect(canonicalGrid).not.toContain("<Popover.");
    expect(canonicalGrid).toContain('aria-label="Back to all props"');
    expect(canonicalGrid).toContain("data-escape-shortcut-local");
  });

  it("carries Buugeng chirality into the existing 3D rig owner", () => {
    const scene = read(VIEWER_SCENE_PATH);
    const packagePatch = read(SCENE_PACKAGE_PATCH);

    expect(scene).toContain("isBuugengFamilyProp");
    expect(scene).toContain("bluePropFlipped=");
    expect(scene).toContain("redPropFlipped=");
    expect(packagePatch).toContain("bluePropFlipped?: boolean");
    expect(packagePatch).toContain("redPropFlipped?: boolean");
    expect(packagePatch).toContain("scale.x={bluePropFlipped ? -1 : 1}");
    expect(packagePatch).toContain("scale.x={redPropFlipped ? -1 : 1}");
  });
});
