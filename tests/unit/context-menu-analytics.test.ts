import { describe, expect, it, vi } from "vitest";
import type { ContextMenuItem } from "#lib/shared/components/context-menu/context-menu-types.js";
import {
  contextMenuCloseCounts,
  instrumentContextMenuEntries,
} from "#lib/shared/sequence-viewer/services/context-menu-analytics.js";

describe("context menu analytics", () => {
  it("reports nested card controls and preserves the original action", () => {
    const original = vi.fn();
    const onAction = vi.fn();
    const [submenu] = instrumentContextMenuEntries(
      [
        {
          id: "columns",
          label: "Columns",
          children: [
            {
              id: "cols-4",
              label: "4 columns",
              checked: false,
              action: original,
            },
          ],
        },
      ],
      "card",
      onAction
    ) as ContextMenuItem[];

    submenu.children?.[0]?.action?.();

    expect(onAction).toHaveBeenCalledWith("card_cols-4", {
      was_checked: false,
    });
    expect(original).toHaveBeenCalledOnce();
  });

  it("leaves Send and Sticker actions to their existing instrumentation", () => {
    const send = vi.fn();
    const sticker = vi.fn();
    const onAction = vi.fn();
    const entries = instrumentContextMenuEntries(
      [
        { id: "send-to", label: "Send", action: send },
        {
          id: "send-to-sticker-lab",
          label: "Sticker",
          action: sticker,
        },
      ],
      "card",
      onAction
    ) as ContextMenuItem[];

    entries[0]?.action?.();
    entries[1]?.action?.();

    expect(onAction).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
    expect(sticker).toHaveBeenCalledOnce();
  });

  it("does not count the automatic close after selecting an item", () => {
    expect(contextMenuCloseCounts("item")).toBe(false);
    expect(contextMenuCloseCounts("outside")).toBe(true);
    expect(contextMenuCloseCounts("dismiss")).toBe(true);
  });
});
