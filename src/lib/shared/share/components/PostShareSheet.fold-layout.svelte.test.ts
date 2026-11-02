import { render } from "vitest-browser-svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { createRawSnippet } from "svelte";
import demo from "#lib/shared/landing/data/demo-sequence.json";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { EMPTY_META_PUBLISH_STATUS } from "#lib/shared/share/services/meta-publish.js";
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import PostShareSheet from "./PostShareSheet.svelte";

// An unfolded Galaxy Z Fold held sideways is 823x707: wider than it is tall,
// but under the 900px desktop split. It used to get the phone bottom sheet,
// a 608px column pinned to the bottom edge with the artwork as a strip and
// the last choice pushed past the screen. A landscape window from 720px wide
// is a tablet: stage beside the rail, the whole dialog on screen.
vi.mock("$app/env", () => ({
  browser: true,
  building: false,
  dev: false,
  version: "test",
}));

// The workspace hands the sheet its live animation; a phone shows the stage
// only when there is one to show.
const liveVideoPreview = createRawSnippet(() => ({
  render: () => '<div class="test-live-preview"></div>',
}));

function openSheet(withLivePreview = false) {
  return render(PostShareSheet, {
    ...(withLivePreview ? { liveVideoPreview } : {}),
    isOpen: true,
    sequence: structuredClone(demo) as unknown as SequenceData,
    shareUrl: "",
    videoBlobUrl: null,
    isExportingVideo: false,
    exportProgress: null,
    onClose: vi.fn(),
    onSendInTka: vi.fn(),
    availableArtifacts: ["card"],
    canCreateLink: true,
    metaStatusOverride: EMPTY_META_PUBLISH_STATUS,
  });
}

function box(selector: string): DOMRect {
  const element = document.querySelector<HTMLElement>(selector);
  expect(element, selector).not.toBeNull();
  return element!.getBoundingClientRect();
}

async function openAt(width: number, height: number, withLivePreview = false) {
  await page.viewport(width, height);
  openSheet(withLivePreview);
  await expect
    .element(page.getByRole("button", { name: t("share_close_sheet") }))
    .toBeVisible();
  // Let the pop-in settle so the boxes are the resting geometry.
  await new Promise((resolve) => setTimeout(resolve, 600));
}

function expectInsideViewport(rect: DOMRect, label: string) {
  expect(rect.top, `${label} top`).toBeGreaterThanOrEqual(-0.5);
  expect(rect.left, `${label} left`).toBeGreaterThanOrEqual(-0.5);
  expect(rect.bottom, `${label} bottom`).toBeLessThanOrEqual(
    window.innerHeight + 0.5
  );
  expect(rect.right, `${label} right`).toBeLessThanOrEqual(
    window.innerWidth + 0.5
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("PostShareSheet on an unfolded Fold", () => {
  it("puts the stage beside the rail and keeps every choice on screen in landscape", async () => {
    await openAt(823, 707);

    const dialog = box("dialog.share-sheet-modal");
    const stage = box(".share-split .stage");
    const rail = box(".share-split .rail");
    expectInsideViewport(dialog, "dialog");
    // A centred dialog, not a sheet pinned to the bottom edge.
    expect(dialog.bottom).toBeLessThan(window.innerHeight - 8);
    expect(stage.right, "stage sits left of the rail").toBeLessThanOrEqual(
      rail.left + 0.5
    );
    expect(stage.width, "the artwork is wider than the rail").toBeGreaterThan(
      rail.width
    );
    expect(rail.bottom).toBeLessThanOrEqual(dialog.bottom + 0.5);
    const choices = [...document.querySelectorAll<HTMLElement>(".intent")];
    expect(choices).toHaveLength(5);
    for (const choice of choices) {
      expectInsideViewport(choice.getBoundingClientRect(), "choice");
      expect(choice.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        rail.bottom + 0.5
      );
    }
    expectInsideViewport(box(".panel-header .header-icon"), "close");
  });

  // A sheet pinned to the bottom edge left a dark band above it on the
  // Fold's cover screen; the stacked dialog sits centred like the wide one.
  function expectCentred(dialog: DOMRect, label: string) {
    const above = dialog.top;
    const below = window.innerHeight - dialog.bottom;
    expect(above, `${label} gap above`).toBeGreaterThan(0);
    expect(Math.abs(above - below), `${label} centred`).toBeLessThanOrEqual(2);
  }

  it("stays a stacked sheet inside the screen in portrait", async () => {
    await openAt(707, 823);

    const dialog = box("dialog.share-sheet-modal");
    const rail = box(".share-split .rail");
    expectInsideViewport(dialog, "dialog");
    // Portrait stacks the stage over the rail: one column, centred.
    expectCentred(dialog, "dialog");
    expect(rail.left).toBeLessThanOrEqual(dialog.left + 0.5);
    expect(rail.bottom).toBeLessThanOrEqual(dialog.bottom + 0.5);
    expectInsideViewport(box(".panel-header .header-icon"), "close");
  });

  // The Fold's cover screen is 412x915. The sheet is shorter than the screen
  // there, so where it sits shows: centred, with the same backdrop above and
  // below, every choice inside it.
  it("centres the sheet on the 412x915 cover screen", async () => {
    await openAt(412, 915, true);

    const dialog = box("dialog.share-sheet-modal");
    expectInsideViewport(dialog, "dialog");
    expectCentred(dialog, "dialog");
    const choices = [...document.querySelectorAll<HTMLElement>(".intent")];
    expect(choices).toHaveLength(5);
    for (const choice of choices) {
      expect(choice.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        dialog.bottom + 0.5
      );
    }
    expectInsideViewport(box(".panel-header .header-icon"), "close");
  });

  // Austen's unfolded Fold in portrait is 707x772. Home used to give the
  // artwork an 11.5rem strip and push the last choices off the screen under
  // a line of subtext each. The choices are one row now and the stage takes
  // the height they free.
  it("gives the stage the freed height and keeps every choice on screen at 707x772", async () => {
    await openAt(707, 772, true);

    const dialog = document.querySelector<HTMLElement>(
      "dialog.share-sheet-modal"
    )!;
    expectInsideViewport(dialog.getBoundingClientRect(), "dialog");
    expect(dialog.scrollHeight, "the dialog never scrolls").toBeLessThanOrEqual(
      dialog.clientHeight
    );
    expect(document.querySelectorAll(".intent-hint")).toHaveLength(0);
    const choices = [...document.querySelectorAll<HTMLElement>(".intent")];
    expect(choices).toHaveLength(5);
    for (const choice of choices) {
      expectInsideViewport(choice.getBoundingClientRect(), "choice");
    }
    expect(box(".share-split .stage").height).toBeGreaterThanOrEqual(240);
  });
});
