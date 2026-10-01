import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { expect, it, vi } from "vitest";
import { getSettings } from "$lib/shared/application/state/app-state.svelte";
import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";
import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import PostAnimationAppearanceTool from "./PostAnimationAppearanceTool.svelte";

it("saves a plain staff in one edit without changing the account's props or artwork", async () => {
  await page.viewport(760, 800);
  const settings = getSettings();
  const account = {
    left: settings.leftPropType,
    right: settings.rightPropType,
    look: settings.propArtwork,
  };
  const onAppearanceChange = vi.fn();
  const { rerender } = render(PostAnimationAppearanceTool, {
    editor: {
      project: createEmptyPostProject({ sequenceId: "prop-test", now: 1 }),
    } as PostEditorState,
    appearanceOverride: { propType: PropType.STAFF, propLook: "model" },
    onAppearanceChange,
    locked: false,
  });
  await page.getByRole("tab", { name: "Props", exact: true }).click();
  await page.getByRole("button", { name: "Choose Double Staff style" }).click();
  const plain = page.getByRole("button", {
    name: "Select Double Staff prop type",
    exact: true,
  });
  await plain.click();
  expect(onAppearanceChange).toHaveBeenCalledTimes(1);
  const saved = onAppearanceChange.mock.calls[0]![0];
  expect(saved).toMatchObject({
    propType: PropType.STAFF,
    propLook: "pictograph",
  });
  await rerender({ appearanceOverride: saved });
  await expect.element(plain).toHaveAttribute("aria-pressed", "true");
  await expect
    .element(
      page.getByRole("button", {
        name: "Select Double Staff 3D prop type",
        exact: true,
      })
    )
    .toHaveAttribute("aria-pressed", "false");

  // A size edit only supplies a type; it must keep the saved artwork.
  await page.getByRole("button", { name: "Big", exact: true }).click();
  expect(onAppearanceChange.mock.calls.at(-1)![0]).toMatchObject({
    propType: PropType.BIGSTAFF,
    propLook: "pictograph",
  });
  expect({
    left: getSettings().leftPropType,
    right: getSettings().rightPropType,
    look: getSettings().propArtwork,
  }).toEqual(account);
});

it("saves an LED look change from the selected effect inspector", async () => {
  await page.viewport(1200, 900);
  const onAppearanceChange = vi.fn();
  const effects = structuredClone(DEFAULT_EFFECTS_CONFIG);
  effects.activeEffect = "led";
  effects.tipEffectMap = { "*": { effect: "led" } };
  const { rerender } = render(PostAnimationAppearanceTool, {
    editor: {
      project: createEmptyPostProject({ sequenceId: "led-test", now: 1 }),
    } as PostEditorState,
    appearanceOverride: { effects },
    onAppearanceChange,
    locked: false,
  });

  await page.getByRole("tab", { name: "Effects", exact: true }).click();
  await page.getByRole("button", { name: "Tune", exact: true }).click();
  await page.getByRole("button", { name: "Look", exact: true }).click();
  await page.getByRole("radio", { name: "5", exact: true }).click();
  await vi.waitFor(() => {
    expect(onAppearanceChange).toHaveBeenCalledTimes(1);
    expect(
      onAppearanceChange.mock.calls.at(-1)![0].effects.led.look.brightness
    ).toBe(5);
  });
  await expect
    .element(page.getByRole("button", { name: "Look", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await rerender({
    appearanceOverride: onAppearanceChange.mock.calls[0]![0],
  });
  await expect
    .element(page.getByRole("radio", { name: "5", exact: true }))
    .toHaveAttribute("aria-checked", "true");
  const persistence = page.getByRole("slider", { name: "Persistence" });
  await expect.element(persistence).toBeVisible();
  await persistence.press("ArrowRight");
  await vi.waitFor(() => {
    expect(
      onAppearanceChange.mock.calls.at(-1)![0].effects.led.look.shutter
        .timeConstantSeconds
    ).toBeGreaterThan(0.12);
  });
  await expect
    .element(page.getByRole("button", { name: "Look", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
});
