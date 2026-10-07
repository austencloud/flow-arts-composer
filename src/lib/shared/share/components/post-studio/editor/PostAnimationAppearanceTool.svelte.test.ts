import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import { expect, it, vi } from "vitest";
import { getSettings } from "$lib/shared/application/state/app-state.svelte";
import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";
import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrailMode,
} from "$lib/shared/animation-engine/domain/types/trail-types";
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
    name: "Select Double Staff V1 prop type",
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
        name: "Select Double Staff V2 prop type",
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

it("saves Version 1 when a pick of a different prop names no version", async () => {
  await page.viewport(760, 800);
  const onAppearanceChange = vi.fn();
  const { rerender } = render(PostAnimationAppearanceTool, {
    editor: {
      project: createEmptyPostProject({ sequenceId: "prop-test", now: 1 }),
    } as PostEditorState,
    appearanceOverride: { propType: PropType.STAFF, propLook: "pictograph" },
    onAppearanceChange,
    locked: false,
  });
  await page.getByRole("tab", { name: "Props", exact: true }).click();
  await page.getByRole("button", { name: "Choose Double Staff style" }).click();

  await page
    .getByRole("button", { name: "Select LED Baton V2 prop type", exact: true })
    .click();
  const v2 = onAppearanceChange.mock.calls.at(-1)![0];
  expect(v2).toMatchObject({
    propType: PropType.CAPSULE_BATON,
    propLook: "model",
  });
  await rerender({ appearanceOverride: v2 });

  // Stick has one version, so its tile names none. The Version 2 chosen for
  // the baton must not follow the performer onto it.
  await page
    .getByRole("button", { name: "Select Stick prop type", exact: true })
    .click();
  expect(onAppearanceChange.mock.calls.at(-1)![0]).toMatchObject({
    propType: PropType.STICK,
    propLook: "pictograph",
  });
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
  (persistence.element() as HTMLElement).focus();
  await userEvent.keyboard("{ArrowRight}");
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

it("saves trail tuning and restores it when switching project appearances", async () => {
  await page.viewport(1200, 900);
  const onAppearanceChange = vi.fn();
  const effects = structuredClone(DEFAULT_EFFECTS_CONFIG);
  effects.activeEffect = "trails";
  effects.tipEffectMap = { "*": { effect: "trails" } };
  const trail = {
    enabled: true,
    trackingMode: DEFAULT_TRAIL_SETTINGS.trackingMode,
    thickness: effects.trails.thickness,
    brightness: effects.trails.brightness,
    tailLength: 80,
    leftColor: effects.trails.leftColor,
    rightColor: effects.trails.rightColor,
    settings: {
      ...DEFAULT_TRAIL_SETTINGS,
      mode: TrailMode.PERSISTENT,
      tailLength: 80,
      hideProps: true,
    },
  };
  const { rerender } = render(PostAnimationAppearanceTool, {
    editor: {
      project: createEmptyPostProject({ sequenceId: "trail-test", now: 1 }),
    } as PostEditorState,
    appearanceOverride: { effects, trail },
    onAppearanceChange,
    locked: false,
  });

  await page.getByRole("tab", { name: "Effects", exact: true }).click();
  await page.getByRole("button", { name: "Tune", exact: true }).click();
  await page.getByRole("tab", { name: /^Tail/ }).click();
  const tail = page.getByRole("slider");
  await expect.element(tail).toHaveValue("80");
  (tail.element() as HTMLElement).focus();
  await userEvent.keyboard("{ArrowRight}");
  await vi.waitFor(() => {
    expect(onAppearanceChange.mock.calls.at(-1)![0].trail.tailLength).toBe(85);
  });
  const saved = onAppearanceChange.mock.calls.at(-1)![0];
  expect(saved.trail.settings).toMatchObject({
    mode: TrailMode.PERSISTENT,
    tailLength: 85,
    hideProps: true,
  });

  await rerender({
    appearanceOverride: {
      effects: structuredClone(effects),
      trail: {
        ...trail,
        tailLength: 30,
        settings: { ...trail.settings, tailLength: 30 },
      },
    },
  });
  await expect.element(tail).toHaveValue("30");
  await rerender({ appearanceOverride: saved });
  await expect.element(tail).toHaveValue("85");
});
