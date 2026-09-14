import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Create front-door source contract", () => {
  it("keeps the stateful workspace mounted behind the canonical dual-source owner", () => {
    const source = readFileSync(
      resolve(
        root,
        "src/lib/features/create/shared/components/CreateModule.svelte"
      ),
      "utf8"
    );

    expect(source).toContain("<DualSourceCrossfade");
    expect(source).toContain("first={frontDoorSurface}");
    expect(source).toContain("second={workspaceSurface}");
    expect(source).not.toContain("CreateShortcutHeader");
    expect(source).not.toContain("create-method-bar");
  });

  it("exposes All methods through the shared navigation owner", () => {
    const mainInterfaceSource = readFileSync(
      resolve(root, "src/lib/shared/MainInterface.svelte"),
      "utf8"
    );
    const desktopNavigationSource = readFileSync(
      resolve(
        root,
        "src/lib/shared/navigation/components/DesktopNavigationSidebar.svelte"
      ),
      "utf8"
    );

    expect(mainInterfaceSource).toContain("isModuleHomeOpen");
    expect(mainInterfaceSource).toContain("onModuleHomeSelect");
    expect(desktopNavigationSource).toContain("MODULE_HOME_SECTION_PREFIX");
    expect(desktopNavigationSource).toContain("module.home.optionLabel");
  });

  it("hands the active Construct guide sole ownership of its heading", () => {
    const constructSource = readFileSync(
      resolve(
        root,
        "src/lib/features/create/shared/components/ConstructTabContent.svelte"
      ),
      "utf8"
    );
    const pickerSource = readFileSync(
      resolve(
        root,
        "src/lib/features/create/construct/start-position-picker/components/StartPositionPicker.svelte"
      ),
      "utf8"
    );

    expect(constructSource).toContain(
      "suppressHeading={constructTutorialState.isActive}"
    );
    expect(pickerSource).toMatch(
      /<Crossfade\s+key=\{suppressHeading\}[^>]*>[\s\S]*?\{#if !suppressHeading\}/
    );
    expect(pickerSource).toContain("{#if !suppressHeading}");
  });

  it("keeps Generate orientation tracking on the real options properties", () => {
    const generateSource = readFileSync(
      resolve(
        root,
        "src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte"
      ),
      "utf8"
    );

    expect(generateSource).toContain(
      "startEndState?.options.leftStartOrientation"
    );
    expect(generateSource).toContain(
      "startEndState?.options.rightStartOrientation"
    );
    expect(generateSource).not.toContain("optionsleftStartOrientationn");
    expect(generateSource).not.toContain("optionsrightStartOrientationn");
  });
});
