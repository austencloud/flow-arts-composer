/**
 * Picking a prop from the selection panel while the Construct workspace quick
 * viewer is playing used to close it: stamping the prop onto every motion
 * rewrites the current sequence, the revision advances, and the workspace read
 * that advance as "the user edited the sequence" and stopped playback.
 *
 * These tests drive the real prop-type sync effect against the real panel
 * coordination state, then run the workspace's own revision check, because the
 * defect lived in the seam between the two rather than in either one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { effect_root } from "svelte/internal/client";
import {
  createPanelCoordinationState,
  type PanelCoordinationState,
} from "$lib/shared/create/state/panel-coordination-state.svelte";
import { createPropTypeSyncEffect } from "$lib/features/create/shared/state/managers/prop-type-sync-manager.svelte";
import type { StepOperator } from "$lib/features/create/shared/services/step-operator";
import type { CreateModuleState } from "$lib/features/create/shared/state/create-module-state.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  resetSettingsHarness,
  settingsHarness,
} from "./prop-swap-harness.svelte";

vi.mock("$lib/shared/application/state/app-state.svelte", async () => {
  const { settingsHarness } = await import("./prop-swap-harness.svelte");
  return { getSettings: () => settingsHarness };
});

const ACTIVE_TAB = "construct";

let disposeSync: (() => void) | undefined;
let disposeState: (() => void) | undefined;

afterEach(() => {
  disposeSync?.();
  disposeState?.();
  disposeSync = undefined;
  disposeState = undefined;
});

beforeEach(() => resetSettingsHarness());

function sequence(): SequenceData {
  return {
    id: "draft",
    name: "",
    word: "A",
    steps: [{ id: "one", stepNumber: 1 } as StepData],
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: {},
  };
}

/**
 * The real bulk update rewrites every motion and lands on
 * coreState.setCurrentSequence, which claims a fresh revision. Only that
 * revision bump matters here, so the fake records the calls and bumps.
 */
function createWorkspace() {
  let revision = 1;
  const bulkUpdates: string[] = [];

  let panelState!: PanelCoordinationState;
  disposeState = effect_root(() => {
    panelState = createPanelCoordinationState();
  });

  disposeSync = createPropTypeSyncEffect({
    getStepOperator: () =>
      ({
        bulkUpdatePropType: (color: string, propType: string) => {
          bulkUpdates.push(`${color}:${propType}`);
          revision += 1;
        },
      }) as unknown as StepOperator,
    getCreateModuleState: () => ({}) as CreateModuleState,
    isServicesInitialized: () => true,
    getSequenceRevision: () => revision,
    onPropTypeSequenceRewrite: (from, to) =>
      panelState.rebaseWorkspacePlayback(from, to),
  });
  flushSync();

  return {
    panelState,
    bulkUpdates,
    get revision() {
      return revision;
    },
    /** Stands in for the workspace's own "did the document change?" effect. */
    runWorkspaceSync: () =>
      panelState.syncWorkspacePlaybackSource(ACTIVE_TAB, revision),
    /** A real edit: same revision counter, nothing to do with prop choice. */
    editSequence: () => {
      revision += 1;
    },
  };
}

describe("changing a prop while the workspace quick viewer plays", () => {
  it("leaves the same playback session running", () => {
    const workspace = createWorkspace();
    workspace.panelState.startWorkspacePlayback(
      sequence(),
      workspace.revision,
      ACTIVE_TAB
    );
    const session = workspace.panelState.workspacePlayback;
    expect(session).not.toBeNull();

    settingsHarness.leftPropType = "fan";
    settingsHarness.rightPropType = "fan";
    flushSync();

    // The first two entries are the mount-time sync that aligns the draft with
    // the stored settings; these two are the prop the user just picked.
    expect(workspace.bulkUpdates.slice(-2)).toEqual(["blue:fan", "red:fan"]);
    workspace.runWorkspaceSync();

    // Same object, not just a non-null one: the workspace keys the mounted
    // player on this session, so a replacement would restart from beat 0.
    expect(workspace.panelState.workspacePlayback).toBe(session);
    expect(workspace.panelState.workspacePlaybackSourceRevision).toBe(
      workspace.revision
    );
  });

  it("still stops playback for a real edit after a prop swap", () => {
    const workspace = createWorkspace();
    workspace.panelState.startWorkspacePlayback(
      sequence(),
      workspace.revision,
      ACTIVE_TAB
    );

    settingsHarness.leftPropType = "club";
    flushSync();
    workspace.runWorkspaceSync();
    expect(workspace.panelState.workspacePlayback).not.toBeNull();

    workspace.editSequence();
    workspace.runWorkspaceSync();
    expect(workspace.panelState.workspacePlayback).toBeNull();
  });

  it("still stops playback when the creation tab changes", () => {
    const workspace = createWorkspace();
    workspace.panelState.startWorkspacePlayback(
      sequence(),
      workspace.revision,
      ACTIVE_TAB
    );

    settingsHarness.rightPropType = "buugeng";
    flushSync();

    workspace.panelState.syncWorkspacePlaybackSource(
      "generate",
      workspace.revision
    );
    expect(workspace.panelState.workspacePlayback).toBeNull();
  });

  it("does not re-base a session that was already out of date", () => {
    const workspace = createWorkspace();
    workspace.panelState.startWorkspacePlayback(
      sequence(),
      workspace.revision,
      ACTIVE_TAB
    );

    // An edit the workspace has not reconciled yet, then a prop swap on top.
    workspace.editSequence();
    settingsHarness.leftPropType = "hand";
    flushSync();

    workspace.runWorkspaceSync();
    expect(workspace.panelState.workspacePlayback).toBeNull();
  });

  it("reports no rewrite when the picked prop is already active", () => {
    const rewrites: Array<[number, number]> = [];
    let revision = 5;
    disposeSync = createPropTypeSyncEffect({
      getStepOperator: () =>
        ({
          bulkUpdatePropType: () => (revision += 1),
        }) as unknown as StepOperator,
      getCreateModuleState: () => ({}) as CreateModuleState,
      isServicesInitialized: () => true,
      getSequenceRevision: () => revision,
      onPropTypeSequenceRewrite: (from, to) => rewrites.push([from, to]),
    });

    // First flush is the mount-time sync that aligns the draft with settings.
    flushSync();
    expect(rewrites).toEqual([[5, 7]]);

    settingsHarness.leftPropType = "staff";
    flushSync();
    expect(rewrites).toEqual([[5, 7]]);
  });
});
