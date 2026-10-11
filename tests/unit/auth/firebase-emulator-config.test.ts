import { describe, expect, it } from "vitest";
import { resolveFirebaseEmulatorConfig } from "#lib/shared/auth/firebase-emulator-config.js";

describe("resolveFirebaseEmulatorConfig", () => {
  it("cannot enable emulators outside development", () => {
    expect(
      resolveFirebaseEmulatorConfig({
        dev: false,
        enabledValue: "true",
        projectIdValue: "demo-from-env",
        browserUrl:
          "https://tkaflowarts.com/?firebaseEmulatorProject=demo-from-url",
      })
    ).toMatchObject({ enabled: false });
  });

  it("uses the configured demo project when environment opt-in is enabled", () => {
    expect(
      resolveFirebaseEmulatorConfig({
        dev: true,
        enabledValue: "true",
        projectIdValue: " demo-collection-test ",
      })
    ).toMatchObject({ enabled: true, projectId: "demo-collection-test" });
  });

  it("allows a development URL to opt in and override the environment project", () => {
    expect(
      resolveFirebaseEmulatorConfig({
        dev: true,
        projectIdValue: "demo-from-env",
        browserUrl:
          "https://localhost:5174/browse?firebaseEmulatorProject=demo-from-url",
      })
    ).toMatchObject({ enabled: true, projectId: "demo-from-url" });
  });

  it.each([
    {
      enabledValue: "true",
      projectIdValue: "the-kinetic-alphabet",
    },
    {
      browserUrl:
        "https://localhost:5174/?firebaseEmulatorProject=the-kinetic-alphabet",
    },
  ])("rejects non-demo projects whenever emulator mode is enabled", (input) => {
    expect(() =>
      resolveFirebaseEmulatorConfig({ dev: true, ...input })
    ).toThrow("requires a demo- project ID");
  });
});
