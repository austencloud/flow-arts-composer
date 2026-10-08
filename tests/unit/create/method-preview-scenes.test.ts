/**
 * Every Create method has a preview scene, keyed by its method id, and every
 * scene belongs to a real Create method.
 */
import { describe, expect, it } from "vitest";
import { CREATE_TABS } from "$lib/shared/navigation/config/tab-definitions";
import { METHOD_PREVIEW_SCENES } from "$lib/features/create/shared/components/method-previews/method-preview-scenes";

describe("method preview scene registry", () => {
  it("has a scene for every Create method, and only those", () => {
    expect(Object.keys(METHOD_PREVIEW_SCENES).sort()).toEqual(
      CREATE_TABS.map((tab) => tab.id).sort()
    );
  });
});
