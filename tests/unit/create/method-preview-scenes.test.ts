/**
 * Every registered scene belongs to a real Create method. Task 15 extends
 * this to require all six.
 */
import { describe, expect, it } from "vitest";
import { CREATE_TABS } from "$lib/shared/navigation/config/tab-definitions";
import { METHOD_PREVIEW_SCENES } from "$lib/features/create/shared/components/method-previews/method-preview-scenes";

describe("method preview scene registry", () => {
  it("keys scenes by Create method id", () => {
    const methods = new Set(CREATE_TABS.map((tab) => tab.id));
    for (const id of Object.keys(METHOD_PREVIEW_SCENES)) {
      expect(methods.has(id)).toBe(true);
    }
  });
});
