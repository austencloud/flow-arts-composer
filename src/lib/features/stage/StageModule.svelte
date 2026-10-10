<script lang="ts">
  import { onDestroy, tick, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import EditHistoryShortcutBridge from "#lib/shared/keyboard/components/EditHistoryShortcutBridge.svelte";
  import { getKeyboardShortcutManager } from "#lib/shared/keyboard/get-keyboard-shortcut-manager.js";
  import { getEscapeLayerManager } from "#lib/shared/keyboard/get-escape-layer-manager.js";
  import {
    createInertStageHandlers,
    createStageShortcuts,
  } from "#lib/shared/keyboard/registration/register-stage-shortcuts.js";
  import PanelGroup from "#lib/shared/panels/PanelGroup.svelte";
  import type { PanelDefinition } from "#lib/shared/panels/PanelGroup.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SequencePickerModal from "#lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import SceneChromeButton from "#lib/shared/3d/components/controls/SceneChromeButton.svelte";
  import Viewer3DFullscreen from "#lib/shared/3d/components/Viewer3DFullscreen.svelte";
  import { setViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
  import { createFullscreenController } from "#lib/shared/fullscreen/state/fullscreen-controller.svelte.js";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import {
    SceneEnvironmentId,
    sceneEnvironmentIdForBackground,
  } from "#lib/shared/3d/environments/domain/scene-environment.js";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { FILM_DIRECTOR_ROUTE } from "#lib/features/film-director/domain/film-director-link.js";
  import { consumeSceneStudioHandoff } from "#lib/features/scene-3d-collection/services/open-3d-scene.js";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import {
    flyFade,
    growFade,
    motionDuration,
  } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { FormationPresetId } from "./domain/stage-types";
  import type { TikaDirectorConversationMessage } from "./domain/tika-director";
  import { describeCastForDirectorRevision } from "./domain/tika-director-revision";
  import {
    createTikaDirectorSession,
    type TikaDirectorSubmitResult,
  } from "./state/tika-director-session";

  import FormationOverlay from "./components/FormationOverlay.svelte";
  import SetProperties from "./components/SetProperties.svelte";
  import StageFloorPaths from "./components/StageFloorPaths.svelte";
  import StageTimeline from "./components/StageTimeline.svelte";
  import StageStarter from "./components/StageStarter.svelte";
  import TikaDirectorPanel from "./components/TikaDirectorPanel.svelte";
  import SceneExportModal from "./scene/components/SceneExportModal.svelte";
  import { createSceneVideoExport } from "./scene/services/create-scene-video-export.svelte";
  import { setStageChoreographyContext } from "./context/stage-choreography-context";
  import { resolveActiveFormationIndex } from "./domain/active-formation";
  import { resolveStageDeleteCommand } from "./domain/stage-delete-command";
  import { samplePerformerSequenceAtBeat } from "./domain/stage-sequence-timeline";
  import { createStageChoreographyState } from "./state/stage-choreography-state.svelte";
  import type { StudioStarter } from "./domain/studio-project";
  import {
    createStageEditMode,
    type StageSelection,
  } from "./state/stage-edit-mode.svelte";
  import {
    DEFAULT_STAGE_SEQUENCE_ID,
    loadStageSequence,
  } from "./services/stage-sequence-loader";
  import {
    applyStageCastToViewer,
    applyStagePerformerMotion,
  } from "./services/stage-viewer-adapter";
  import { resolveStageDirection } from "./services/tika-director-service";
  import { executeTikaDirectorPlan } from "./services/tika-director-executor";
  import {
    resolveDirectorSequenceAssignments,
    type DirectorSequenceAssignment,
  } from "./domain/tika-director-sequences";
  import { listLibrarySequences } from "#lib/shared/browse/services/library-sequence-list.js";
  import { hydrateSequence } from "#lib/shared/sequence-viewer/services/sequence-data-provider.js";

  type SequenceLoadState = "loading" | "ready" | "error";
  type TimelineDisclosure = "hidden" | "dock" | "editor";

  // Opening a saved 3D scene from the collection hands over a whole resolved
  // sequence rather than an id, so it seeds the resolver instead of going
  // through the catalog — a collection id has no catalog entry to fetch.
  const handoff = consumeSceneStudioHandoff();

  const settings = getSettings();
  const stageState = createStageChoreographyState({
    initialEnvironmentId: sceneEnvironmentIdForBackground(
      settings.backgroundType
    ),
  });
  setStageChoreographyContext(stageState);
  const editMode = createStageEditMode();

  function performerIdAt(index: number): string | null {
    return stageState.choreography.performers[index]?.id ?? null;
  }

  function performerIndexForId(id: string | null): number | null {
    if (!id) return null;
    const index = stageState.choreography.performers.findIndex(
      (performer) => performer.id === id
    );
    return index >= 0 ? index : null;
  }

  // The Stage is the same 3D surface as every other one in the app: the shared
  // viewer state is what makes the control rail's tools — performers, formation,
  // camera, scene, presets — reach real rigs instead of doing nothing.
  const viewer = createViewer3DState(undefined, {
    firstUseEnvironment: stageState.choreography.environmentId,
    appDefaultProp: settings.leftPropType ?? null,
    performerSelection: {
      getSelectedIndices: () => {
        if (editMode.selection.kind === "performers") {
          return editMode.selection.performerIds
            .map((id) => performerIndexForId(id))
            .filter((index): index is number => index !== null);
        }
        const focusedIndex = performerIndexForId(editMode.selectedPerformerId);
        return focusedIndex === null ? [] : [focusedIndex];
      },
      getPrimaryIndex: () => performerIndexForId(editMode.selectedPerformerId),
      replace: (index) => {
        const id = performerIdAt(index);
        if (id) editMode.selectPerformer(id);
      },
      toggle: (index) => {
        const id = performerIdAt(index);
        if (id) editMode.selectPerformer(id, true);
      },
      clear: () => editMode.clearSelection(),
      selectAll: (count) => {
        const ids = stageState.choreography.performers
          .slice(0, count)
          .map((performer) => performer.id);
        editMode.selectPerformers(ids);
      },
      setSelection: (indices, primaryIndex) => {
        const ids = indices
          .map((index) => performerIdAt(index))
          .filter((id): id is string => id !== null);
        editMode.selectPerformers(
          ids,
          primaryIndex === undefined
            ? undefined
            : (performerIdAt(primaryIndex) ?? undefined)
        );
      },
      removeSelection: (indices) => {
        const ids = indices
          .map((index) => performerIdAt(index))
          .filter((id): id is string => id !== null);
        if (ids.length === 0) return false;
        const firstIndex = Math.min(...indices);
        if (!stageState.removePerformers(ids)) return false;
        const remaining = stageState.choreography.performers;
        const next = remaining[Math.min(firstIndex, remaining.length - 1)];
        if (next) editMode.selectPerformer(next.id);
        else editMode.clearSelection();
        return true;
      },
    },
  });
  setViewer3DContext(viewer);
  viewer.setEnvironmentId(stageState.choreography.environmentId);
  viewer.enter3D();

  if (handoff) {
    stageState.setSharedSequence(handoff.sequence);
    if (handoff.bpm != null) stageState.setBpm(handoff.bpm);
  }

  const fullscreen = createFullscreenController({
    getHapticService: () => null,
    announce: (message) => console.debug("[Stage]", message),
  });

  const exporter = createSceneVideoExport(viewer);

  const compactTimelineWorkspace = new MediaQuery(
    "(max-width: 900px), (max-height: 560px)"
  );

  const choreography = $derived(stageState.choreography);
  const performanceFrames = $derived(stageState.performanceFrames);

  let chartRaised = $state(false);
  let tikaDirectorOpen = $state(false);
  let tikaPrompt = $state("");
  let tikaMessages = $state<TikaDirectorConversationMessage[]>([]);
  let starterVisible = $state(!handoff);
  let starterSceneBlank = $state(false);
  let starterCurtainVisible = $state(false);
  let starterEnvironmentPreview = $state(false);
  let starterTransitionId = 0;
  let timelineExpanded = $state(false);
  let timelineBeforeCompactSheet: boolean | null = null;
  let timelineLens = $state<"hands" | "floor" | "motion">("hands");
  let workspaceSizes = $state<number[]>([]);
  let pickerOpen = $state(false);
  const preloadedSequences = new Map<string, SequenceData>(
    handoff ? [[handoff.sequence.id, handoff.sequence]] : []
  );
  let resolvedSequences = $state<ReadonlyMap<string, SequenceData>>(
    new Map(preloadedSequences)
  );
  let sequenceLoadState = $state<SequenceLoadState>("loading");
  let sequenceLoadError = $state<string | null>(null);
  let retryRequest = $state(0);

  const sharedSequenceId = $derived(
    choreography.sharedSequenceId ?? DEFAULT_STAGE_SEQUENCE_ID
  );
  const sharedSequence = $derived(
    resolvedSequences.get(sharedSequenceId) ?? null
  );

  const timelineDisclosure = $derived<TimelineDisclosure>(
    starterVisible ? "hidden" : timelineExpanded ? "editor" : "dock"
  );

  const timelineContentSize = $derived.by(() => {
    const lanes = Array.from(
      { length: choreography.performers.length + 1 },
      () => "var(--stage-timeline-lane-size)"
    );
    return `calc(1px + var(--stage-timeline-toolbar-size) + var(--stage-timeline-ruler-size) + ${lanes.join(" + ")})`;
  });

  const sequenceIds = $derived.by(() => {
    const ids = new Set<string>([sharedSequenceId]);
    for (const performer of choreography.performers) {
      for (const clip of performer.sequenceClips) ids.add(clip.sequenceId);
    }
    return [...ids].sort();
  });

  const sequenceIdKey = $derived(sequenceIds.join("|"));

  const sequenceByPerformerId = $derived.by(() => {
    const active = new Map<string, SequenceData>();
    for (const performer of choreography.performers) {
      const sample = samplePerformerSequenceAtBeat(
        performer,
        stageState.currentBeat
      );
      const sequenceId = sample?.clip.sequenceId ?? sharedSequenceId;
      const sequence = resolvedSequences.get(sequenceId);
      if (sequence) active.set(performer.id, sequence);
    }
    return active;
  });

  /**
   * Each performer's own playhead. Stage lanes hold independent choreography,
   * so the shared clock cannot express them — this is what the viewer's
   * `performerSteps` seam exists for.
   */
  const performerSteps = $derived(
    choreography.performers.map((performer) => {
      const sample = samplePerformerSequenceAtBeat(
        performer,
        stageState.currentBeat
      );
      return sample ? sample.stepIndex + sample.progress : 0;
    })
  );

  const activeSetIndex = $derived(
    resolveActiveFormationIndex(
      choreography.formations,
      editMode.selectedFormationId,
      stageState.currentBeat
    )
  );
  const activeSet = $derived(
    activeSetIndex >= 0 ? choreography.formations[activeSetIndex] : undefined
  );

  const stageWord = $derived(
    sharedSequence
      ? simplifyRepeatedWord(
          sharedSequence.word ??
            sharedSequence.intendedWord ??
            sharedSequence.displayName ??
            ""
        ) || null
      : null
  );

  let tikaViewerHistoryRevision = 0;
  const unsubscribeTikaHistory = viewer.sceneUndo.subscribe(() => {
    tikaViewerHistoryRevision++;
  });
  const tikaSession = createTikaDirectorSession({
    isDisposed: () => viewer.disposed || !tikaDirectorOpen,
    getRevision: () =>
      JSON.stringify(
        {
          stageHistory: stageState.historyRevision,
          viewerHistory: tikaViewerHistoryRevision,
          choreography,
          cast: describeCastForDirectorRevision(
            viewer.performerManager.performers.map((performer) =>
              performer.captureEditingSnapshot()
            )
          ),
        },
        (_key, value) => (value instanceof Map ? [...value] : value)
      ),
  });

  async function readLibraryForDirector(): Promise<SequenceData[] | null> {
    try {
      return await listLibrarySequences();
    } catch {
      return null;
    }
  }

  async function directStageWithTika(
    prompt: string,
    conversation: readonly TikaDirectorConversationMessage[],
    signal: AbortSignal
  ): Promise<TikaDirectorSubmitResult> {
    const requestBeat = stageState.currentBeat;
    // Picked and hydrated while the plan resolves, so apply stays synchronous
    // under the session's revision check and never plays a metadata-only record.
    let sequencePicks: DirectorSequenceAssignment[] = [];
    try {
      return await tikaSession.execute(
        async () => {
          const library = await readLibraryForDirector();
          const response = await resolveStageDirection({
            prompt,
            conversation,
            choreography,
            currentBeat: requestBeat,
            viewer,
            ...(library ? { librarySequenceCount: library.length } : {}),
            signal,
          });
          if (
            response.kind === "apply" &&
            response.actions.some(
              (action) => action.type === "assign-distinct-sequences"
            )
          ) {
            if (!library) {
              throw new Error(
                "TIKA could not read your library, so no sequences were assigned."
              );
            }
            const picks = resolveDirectorSequenceAssignments({
              actions: response.actions,
              performerIds: choreography.performers.map((p) => p.id),
              seedKey: `${choreography.id}:${prompt}`,
              library,
            });
            sequencePicks = await Promise.all(
              picks.map(async (pick) => ({
                performerId: pick.performerId,
                sequence: await hydrateSequence(pick.sequence),
              }))
            );
            signal.throwIfAborted();
          }
          return response;
        },
        (response) =>
          executeTikaDirectorPlan(response, {
            stageState,
            viewer,
            requestBeat,
            selectedFormationId: editMode.selectedFormationId,
            seedKey: `${choreography.id}:${prompt}`,
            sequencePicks,
            preloadSequence: (pick) =>
              preloadedSequences.set(pick.sequence.id, pick.sequence),
          }),
        signal
      );
    } catch (cause) {
      if (signal.aborted || viewer.disposed || !tikaDirectorOpen) throw cause;
      const failure = cause instanceof Error ? cause : new Error(String(cause));
      getErrorHandler().showUserError({
        message: "TIKA could not direct this scene.",
        technicalDetails: failure.message,
        error: failure,
        context: {
          module: "stage",
          action: "direct-stage-with-tika",
        },
      });
      throw failure;
    }
  }

  // Resolve every sequence the document references. One request per id, redone
  // whenever the set of ids changes or the user retries a failure.
  //
  // Keyed on the joined ids rather than the array: `sequenceIds` rebuilds its
  // array whenever anything in the clip list is touched, and this effect writes
  // back into that list, so depending on the array itself makes the fetch
  // re-run forever.
  $effect(() => {
    sequenceIdKey;
    retryRequest;
    const requestedIds = untrack(() => sequenceIds);
    let cancelled = false;

    sequenceLoadState = "loading";
    sequenceLoadError = null;

    void Promise.all(
      requestedIds.map(async (sequenceId) => {
        const preloaded = preloadedSequences.get(sequenceId);
        return [
          sequenceId,
          preloaded ?? (await loadStageSequence(sequenceId)),
        ] as const;
      })
    )
      .then((entries) => {
        if (cancelled) return;
        resolvedSequences = new Map(entries);
        stageState.registerSequenceLabels(
          new Map(
            entries.map(([sequenceId, sequence]) => [
              sequenceId,
              simplifyRepeatedWord(
                sequence.word ??
                  sequence.intendedWord ??
                  sequence.displayName ??
                  sequenceId
              ),
            ])
          )
        );
        stageState.syncClipSourceLengths(
          new Map(
            entries.map(([sequenceId, sequence]) => [
              sequenceId,
              sequence.steps.length,
            ])
          )
        );
        sequenceLoadState = "ready";
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const failure =
          error instanceof Error ? error : new Error(String(error));
        sequenceLoadState = "error";
        sequenceLoadError = failure.message;
        getErrorHandler().showUserError({
          message: "The Stage sequence could not be loaded.",
          technicalDetails: failure.message,
          error: failure,
          context: {
            module: "stage",
            action: "load-stage-performance-sequence",
            additionalData: { sequenceIds: requestedIds },
          },
        });
      });

    return () => {
      cancelled = true;
    };
  });

  // Cast size and per-lane sequences are document facts; look edits — character,
  // prop, effort, effects, planes — stay with the performer manager and are
  // never rewritten from here, so the rail's Performer tool keeps working.
  //
  // The tracked reads are explicit because `choreography` is a mutated $state
  // object whose identity never changes: reading the object alone would make
  // this run once and never again.
  let castSizeFromDocument = choreography.performers.length;
  $effect(() => {
    const castSize = choreography.performers.length;
    const castLabels = choreography.performers.map((p) => p.label).join("|");
    const sequences = sequenceByPerformerId;
    void castSize;
    void castLabels;
    untrack(() => {
      castSizeFromDocument = choreography.performers.length;
      applyStageCastToViewer(viewer, choreography, sequences);
    });
  });

  // The other direction: adding or removing a performer from the rail is a
  // document edit. Without this the effect above would put the cast straight
  // back, and the rail's Performers tool would look broken.
  $effect(() => {
    const railCastSize = viewer.performerManager.performers.length;
    if (railCastSize === castSizeFromDocument) return;
    untrack(() => stageState.setPerformerCount(railCastSize));
  });

  $effect(() => {
    const frames = performanceFrames;
    const playing = stageState.isPlaying;
    untrack(() =>
      applyStagePerformerMotion(viewer, choreography, frames, playing)
    );
  });

  // The rail's Scene tool writes the viewer's environment; the document keeps
  // it so the choreography carries its own world. One direction only — the
  // document was seeded from the viewer at mount.
  let syncedEnvironmentId = stageState.choreography.environmentId;
  $effect(() => {
    const next = viewer.environmentId;
    if (starterEnvironmentPreview) return;
    if (next === syncedEnvironmentId) return;
    syncedEnvironmentId = next;
    stageState.setEnvironmentId(next);
  });

  /**
   * The rail's Formation tool arranges the cast now. On the Stage, "now" is a
   * count in a document, so a shape chosen there reseeds the set the playhead
   * is sitting on rather than starting a transition the Stage would overwrite
   * on its next frame.
   */
  let syncedFormation = viewer.activeFormation;
  $effect(() => {
    const preset = viewer.activeFormation;
    if (preset === syncedFormation) return;
    syncedFormation = preset;
    const set = untrack(() => activeSet);
    if (!preset || !set) return;
    untrack(() => {
      stageState.applyPresetToFormation(set.id, preset as FormationPresetId);
      viewer.performerManager.cancelFormationTransition();
    });
  });

  onDestroy(() => {
    unsubscribeTikaHistory();
    stageState.destroy();
    exporter.cancel();
    viewer.dispose();
  });

  // Opening a saved film goes straight to its render card: the person already
  // chose to render it back in the collection, so a second click to open the
  // export modal would be a step that asks nothing.
  let exportOpen = $state(!!handoff?.film);

  const workspacePanels = $derived.by<PanelDefinition[]>(() => {
    const stage: PanelDefinition = {
      content: stagePanel,
      defaultSize: 2.8,
      minSize: 240,
      id: "stage",
      resizable:
        timelineDisclosure === "editor" && !compactTimelineWorkspace.current,
    };
    if (timelineDisclosure === "hidden") return [stage];

    return [
      stage,
      {
        content: timelinePanel,
        defaultSize: 1.2,
        minSize: 200,
        maxSize: 360,
        fixedSize:
          timelineDisclosure === "dock"
            ? "var(--stage-timeline-dock-size)"
            : compactTimelineWorkspace.current
              ? "min(var(--stage-timeline-content-size), var(--stage-timeline-sheet-size))"
              : undefined,
        preferredSize:
          timelineDisclosure === "editor" && !compactTimelineWorkspace.current
            ? "min(var(--stage-timeline-content-size), var(--stage-timeline-editor-max-size))"
            : undefined,
        id: "timeline",
      },
    ];
  });

  function openChoreography(openChart = false): void {
    starterVisible = false;
    timelineExpanded = true;
    if (openChart) chartRaised = true;
  }

  function collapseChoreography(): void {
    timelineExpanded = false;
  }

  function handleCompactSceneSheetChange(
    sheet: "performer" | "scene" | null
  ): void {
    if (sheet) {
      if (timelineBeforeCompactSheet === null) {
        timelineBeforeCompactSheet = timelineExpanded;
      }
      timelineExpanded = false;
      return;
    }

    const shouldRestore = timelineBeforeCompactSheet;
    timelineBeforeCompactSheet = null;
    // If the user expanded the timeline while the sheet was open, that newer
    // intent wins. Otherwise restore the layout they had before editing.
    if (!timelineExpanded && shouldRestore) timelineExpanded = true;
  }

  function chooseSequence(next: SequenceData): void {
    stageState.setSharedSequence(next);
  }

  function transitionDelay(duration: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, duration));
  }

  async function transitionStarterScene(
    change: () => Promise<void> | void
  ): Promise<void> {
    const transitionId = ++starterTransitionId;
    starterCurtainVisible = true;
    await tick();

    const duration = motionDuration(DURATION.normal);
    if (duration > 0) await transitionDelay(duration);
    if (transitionId !== starterTransitionId) return;

    await change();
    await tick();
    if (transitionId === starterTransitionId) starterCurtainVisible = false;
  }

  function startEmptyStage(): void {
    chartRaised = false;
    if (stageState.isPlaying) stageState.togglePlay();
    void transitionStarterScene(() => {
      // The blank setup is a view over the seeded example, not a second Stage
      // document. The real document stays untouched until the final action.
      starterEnvironmentPreview = true;
      viewer.setEnvironmentId(SceneEnvironmentId.VOID);
      starterSceneBlank = true;
    });
  }

  function returnToStarterExample(): void {
    void transitionStarterScene(() => {
      viewer.setEnvironmentId(choreography.environmentId);
      starterSceneBlank = false;
      starterEnvironmentPreview = false;
    });
  }

  async function applyStudioStarter(starter: StudioStarter): Promise<void> {
    await transitionStarterScene(async () => {
      stageState.applyStudioStarter(starter);
      // Stage owns cast, formation and world; the shared performer manager owns
      // the prop look. Waiting one render lets the canonical cast adapter create
      // exactly the rigs the fresh Stage document called for.
      viewer.setEnvironmentId(starter.environmentId);
      starterSceneBlank = false;
      await tick();
      for (const performer of viewer.performerManager.performers) {
        performer.setProp(starter.prop, { equipBuild: false });
      }
      starterEnvironmentPreview = false;
    });
  }

  /** One count, and the eight counts a drill is written in. */
  const COUNT = 1;
  const EIGHT = 8;

  function seekToCount(count: number): void {
    const total = Math.max(1, stageState.maxTotalBeats);
    stageState.seek(Math.min(Math.max(count, 0), total) / total);
  }

  function nudgeCount(delta: number): void {
    seekToCount(Math.round(stageState.currentBeat) + delta);
  }

  /**
   * Sets carry the show, so the brackets jump between the counts they arrive
   * on rather than scrubbing. A tolerance keeps a float playhead sitting on a
   * set from counting as "before" it and going nowhere.
   */
  function jumpToNeighbouringSet(direction: -1 | 1): void {
    const beats = choreography.formations.map((formation) => formation.atBeat);
    const here = stageState.currentBeat;
    const next =
      direction === 1
        ? beats.find((beat) => beat > here + 0.001)
        : [...beats].reverse().find((beat) => beat < here - 0.001);
    if (next !== undefined) seekToCount(next);
  }

  function addSetAtPlayhead(): void {
    const added = stageState.addFormation(Math.round(stageState.currentBeat));
    if (added) editMode.selectFormation(added.id);
  }

  function focusStageTarget(attribute: string, id: string): void {
    void tick().then(() => {
      const target = Array.from(
        document.querySelectorAll<HTMLElement>(`[${attribute}]`)
      ).find((element) => element.getAttribute(attribute) === id);
      target?.focus({ preventScroll: true });
    });
  }

  function deleteStageSelection(
    selection: StageSelection = editMode.selection
  ): void {
    const command = resolveStageDeleteCommand(selection);

    switch (command.kind) {
      case "remove-performers": {
        const selectedIds = new Set(command.performerIds);
        const firstIndex = choreography.performers.findIndex((performer) =>
          selectedIds.has(performer.id)
        );
        const removedLabels = choreography.performers
          .filter((performer) => selectedIds.has(performer.id))
          .map((performer) => performer.label);

        if (!stageState.removePerformers(command.performerIds)) {
          if (removedLabels.length > 0) {
            toast.warning("A scene needs at least one performer.");
          }
          return;
        }

        const nextIndex = Math.min(
          Math.max(0, firstIndex),
          choreography.performers.length - 1
        );
        const nextPerformer = choreography.performers[nextIndex];
        if (nextPerformer) {
          editMode.selectPerformer(nextPerformer.id);
          focusStageTarget("data-stage-performer-id", nextPerformer.id);
        } else editMode.clearSelection();

        toast.success(
          removedLabels.length === 1
            ? `Performer ${removedLabels[0]} removed. Ctrl+Z to undo.`
            : `${removedLabels.length} performers removed. Ctrl+Z to undo.`
        );
        return;
      }
      case "remove-formation": {
        const index = choreography.formations.findIndex(
          (formation) => formation.id === command.formationId
        );
        if (index <= 0) {
          if (index === 0) toast.info("The opening set stays in every scene.");
          return;
        }
        const name =
          choreography.formations[index]?.label ?? `Set ${index + 1}`;
        const nextFormation =
          choreography.formations[index + 1] ??
          choreography.formations[index - 1];
        stageState.removeFormation(command.formationId);
        if (nextFormation) {
          editMode.selectFormation(nextFormation.id);
          focusStageTarget("data-stage-formation-id", nextFormation.id);
        } else editMode.clearSelection();
        toast.success(`${name} removed. Ctrl+Z to undo.`);
        return;
      }
      case "remove-clip": {
        const performer = choreography.performers.find(
          (candidate) => candidate.id === command.performerId
        );
        const clip = performer?.sequenceClips.find(
          (candidate) => candidate.id === command.clipId
        );
        if (!performer || !clip) return;
        const name = stageState.clipLabel(clip);
        stageState.removeSequenceClip(command.clipId);
        editMode.selectPerformer(command.performerId);
        focusStageTarget("data-stage-performer-id", command.performerId);
        toast.success(
          `${name} removed from performer ${performer.label}. Ctrl+Z to undo.`
        );
        return;
      }
      case "reset-travel":
        if (
          stageState.resetPerformerTravelTiming(
            command.formationId,
            command.performerId
          )
        ) {
          toast.success("Custom travel timing reset to Auto. Ctrl+Z to undo.");
        }
        return;
      case "explain-required-spot":
        toast.info(
          "Every performer needs a spot in each set. Move it or reset the set layout instead."
        );
        return;
      case "none":
        return;
    }
  }

  /**
   * The Stage's keys go through the app's shortcut manager rather than a local
   * window listener, so they appear in `?` and Settings → Keyboard Shortcuts,
   * can be rebound, and are conflict-checked against every other binding. The
   * ids are registered inert at boot; this re-registration supplies the real
   * actions. Undo and redo are not here — Ctrl+Z is owned globally and reaches
   * this document through EditHistoryShortcutBridge below.
   */
  $effect(() => {
    const manager = getKeyboardShortcutManager();
    const previousContext = manager.getContext();
    manager.setContext("stage");

    for (const shortcut of createStageShortcuts({
      togglePlay: () => stageState.togglePlay(),
      stepBack: () => nudgeCount(-COUNT),
      stepForward: () => nudgeCount(COUNT),
      jumpBack: () => nudgeCount(-EIGHT),
      jumpForward: () => nudgeCount(EIGHT),
      firstCount: () => seekToCount(0),
      lastCount: () => seekToCount(stageState.maxTotalBeats),
      previousSet: () => jumpToNeighbouringSet(-1),
      nextSet: () => jumpToNeighbouringSet(1),
      toggleChart: () => (chartRaised = !chartRaised),
      addSet: addSetAtPlayhead,
      deleteSelection: () => deleteStageSelection(),
    })) {
      manager.register(shortcut);
    }

    return () => {
      // Leave the definitions registered so Settings keeps listing them, but
      // hand back the context and let the inert actions stand again.
      manager.setContext(previousContext);
      for (const shortcut of createStageShortcuts(createInertStageHandlers())) {
        manager.register(shortcut);
      }
    };
  });

  /**
   * The raised chart is a layer, so Escape closes it through the same manager
   * that closes drawers and modals — a competing Escape shortcut would have to
   * guess which of them the user meant.
   */
  $effect(() => {
    if (!chartRaised) return;
    return getEscapeLayerManager().register({
      id: "stage:drill-chart",
      canDismiss: () => true,
      dismiss: () => {
        chartRaised = false;
      },
    });
  });
</script>

{#snippet stageHudActions()}
  {#if authState.isAdmin || import.meta.env.DEV}
    <SceneChromeButton
      icon="fa-wand-magic-sparkles"
      label="Direct with TIKA"
      tooltipSide="bottom"
      active={tikaDirectorOpen}
      onclick={(event: MouseEvent) => {
        event.stopPropagation();
        tikaDirectorOpen = !tikaDirectorOpen;
      }}
    />
  {/if}
  <SceneChromeButton
    icon="fa-border-all"
    label={chartRaised ? "Hide drill chart" : "Drill chart"}
    tooltipSide="bottom"
    active={chartRaised}
    onclick={(event: MouseEvent) => {
      event.stopPropagation();
      chartRaised = !chartRaised;
    }}
  />
{/snippet}

{#snippet floorPaths()}
  <StageFloorPaths />
{/snippet}

{#snippet tikaPanel(close: () => void, compact: boolean)}
  <TikaDirectorPanel
    onClose={close}
    active={tikaDirectorOpen}
    {compact}
    bind:prompt={tikaPrompt}
    bind:messages={tikaMessages}
    sceneName={choreography.name}
    performerCount={choreography.performers.length}
    currentBeat={stageState.currentBeat}
    onSubmit={directStageWithTika}
  />
{/snippet}

{#snippet stageOverlay()}
  {#if chartRaised}
    <div
      class="drill-layer"
      aria-label="Drill chart"
      transition:flyFade={{ duration: DURATION.emphasis, y: 12 }}
    >
      <div class="drill-chart">
        <FormationOverlay {editMode} />
      </div>
      {#if activeSet}
        <div
          class="drill-inspector"
          transition:growFade={{
            duration: DURATION.emphasis,
            axis: "x",
          }}
        >
          <SetProperties
            {editMode}
            onRemoveSet={(formationId) =>
              deleteStageSelection({ kind: "formation", formationId })}
          />
        </div>
      {/if}
    </div>
  {/if}

  {#if starterCurtainVisible}
    <div
      class="starter-scene-curtain"
      aria-hidden="true"
      transition:flyFade={{ duration: DURATION.normal, x: 0, y: 0 }}
    ></div>
  {/if}

  {#if sequenceLoadState === "loading"}
    <div
      class="load-notice"
      role="status"
      aria-live="polite"
      transition:flyFade={{ duration: DURATION.normal }}
    >
      <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
      <strong>Preparing the performance</strong>
      <span>Loading the sequence and performer rigs</span>
    </div>
  {:else if sequenceLoadState === "error"}
    <div
      class="load-notice error"
      role="alert"
      transition:flyFade={{ duration: DURATION.normal }}
    >
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <strong>Sequence failed to load</strong>
      <span>{sequenceLoadError ?? "The catalog entry is unavailable."}</span>
      <PanelButton variant="primary" onclick={() => (retryRequest += 1)}>
        Try again
      </PanelButton>
    </div>
  {:else if !handoff}
    <StageStarter
      word={stageWord}
      showDirector={authState.isAdmin && import.meta.env.DEV}
      directorHref={FILM_DIRECTOR_ROUTE}
      onApply={applyStudioStarter}
      onChooseSequence={() => (pickerOpen = true)}
      onOpenChoreography={() => openChoreography(true)}
      onVisibilityChange={(visible) => (starterVisible = visible)}
      onStartEmptyStage={startEmptyStage}
      onReturnToExample={returnToStarterExample}
    />
  {/if}
{/snippet}

{#snippet stagePanel()}
  <div class="stage-canvas">
    {#if viewer.webgl2Available}
      <!-- word={null}: a Stage is a cast of lanes that each hold their own
           sequence, so one title over the frame is a claim the document cannot
           make. The timeline names each lane's clip, where it is true. Dropping
           it also hands the top-left corner to the performer bar, which is what
           a viewer of a multi-performer show reaches for first. -->
      <Viewer3DFullscreen
        sequenceData={sharedSequence}
        currentStep={stageState.currentBeat}
        isPlaying={stageState.isPlaying}
        bpm={choreography.bpm}
        word={null}
        stageExtent={{
          width: choreography.stageWidth,
          depth: choreography.stageDepth,
        }}
        leftPropType={settings.leftPropType ?? settings.propType ?? "staff"}
        rightPropType={settings.rightPropType ?? settings.propType ?? "staff"}
        onChangeSequence={() => (pickerOpen = true)}
        onExport={sharedSequence ? () => (exportOpen = true) : undefined}
        exportBusy={exporter.state.isExporting}
        onPlaybackToggle={() => stageState.togglePlay()}
        onBpmChange={(nextBpm) => stageState.setBpm(nextBpm)}
        onProgressBarSeek={seekToCount}
        immersive={fullscreen.immersive}
        onToggleImmersive={(host) => fullscreen.toggleImmersive(host)}
        {performerSteps}
        worldChildren={starterSceneBlank ? undefined : floorPaths}
        hudActions={stageHudActions}
        hostPanel={tikaPanel}
        hostPanelTitle="Direct with TIKA"
        bind:hostPanelOpen={tikaDirectorOpen}
        overlayChildren={stageOverlay}
        hideCanvasOverlays
        sceneControlsBottomOffset="0.75rem"
        allowSaveScene={false}
        renderEmptyScene
        visiblePerformerCount={starterSceneBlank ? 0 : undefined}
        showSceneChrome={!starterSceneBlank}
        onCompactSceneSheetChange={handleCompactSceneSheetChange}
        contained
      />
    {:else}
      <div class="unsupported-state" role="alert">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <h1>3D isn’t available in this browser</h1>
        <p>WebGL 2 is required to stage a performance.</p>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet timelinePanel()}
  <StageTimeline
    {editMode}
    sequences={resolvedSequences}
    bind:timelineLens
    mode={timelineDisclosure === "editor" ? "editor" : "dock"}
    onExpand={() => openChoreography()}
    onCollapse={collapseChoreography}
    onDeleteSelection={deleteStageSelection}
  />
{/snippet}

<div
  class="stage-module"
  role="main"
  aria-label="Stage"
  data-edit-history-shortcut-scope
  style:--stage-timeline-content-size={timelineContentSize}
>
  <EditHistoryShortcutBridge
    onUndo={stageState.undo}
    onRedo={stageState.redo}
    canUndo={stageState.canUndo}
    canRedo={stageState.canRedo}
  />
  <PanelGroup
    direction="vertical"
    panels={workspacePanels}
    bind:sizes={workspaceSizes}
  />
</div>

<SequencePickerModal
  bind:open={pickerOpen}
  onClose={() => (pickerOpen = false)}
  onSelect={chooseSequence}
  title="Choose the sequence your cast performs"
/>

{#if sharedSequence}
  <SceneExportModal
    bind:open={exportOpen}
    sequence={sharedSequence}
    bpm={choreography.bpm}
    {exporter}
    onClose={() => (exportOpen = false)}
    film={handoff?.film}
  />
{/if}

<style>
  .stage-module {
    --stage-timeline-dock-size: 4.25rem;
    --stage-timeline-sheet-size: min(66cqh, 26rem);
    --stage-timeline-editor-max-size: 22.5rem;
    --stage-timeline-toolbar-size: 4.25rem;
    --stage-timeline-ruler-size: 2.25rem;
    --stage-timeline-lane-size: 3.5rem;
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--color-bg-primary, #080910);
    container-type: size;
  }

  @media (max-width: 35rem) {
    .stage-module {
      --stage-timeline-dock-size: 6.75rem;
    }
  }

  .stage-canvas {
    position: relative;
    min-width: 0;
    min-height: 0;
    flex: 1;
    overflow: hidden;
    container-type: size;
  }

  /* The chart is a layer you raise over the stage, not a mode that replaces
     it. It stops short of the rail so the tools stay reachable while editing. */
  .drill-layer {
    position: absolute;
    /* Clears the top band the scene chrome owns: the performer bar on the left,
       the command buttons on the right. The bar is the taller of the two. */
    top: 5.75rem;
    right: 5.75rem;
    bottom: 0.75rem;
    left: 0.75rem;
    z-index: 2;
    display: flex;
    min-width: 0;
    min-height: 0;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 1rem;
    background: #0c0e16;
    box-shadow: var(--theme-panel-shadow, 0 1.25rem 4rem rgba(0, 0, 0, 0.62));
  }

  .drill-chart {
    position: relative;
    min-width: 0;
    min-height: 0;
    flex: 1;
  }

  .drill-inspector {
    width: min(22rem, 34%);
    min-width: 0;
    flex: none;
    overflow-y: auto;
  }

  .starter-scene-curtain {
    position: absolute;
    inset: 0;
    z-index: 20;
    background:
      radial-gradient(
        circle at 42% 46%,
        color-mix(in srgb, var(--theme-accent) 7%, transparent),
        transparent 34%
      ),
      color-mix(in srgb, var(--theme-panel-bg, #0c0e16) 96%, #000);
    pointer-events: none;
  }

  .load-notice {
    position: absolute;
    inset: 50% auto auto 50%;
    z-index: 3;
    display: flex;
    width: min(24rem, calc(100% - 2rem));
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.65rem;
    padding: 1.5rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 1rem;
    background: #0c0e16;
    color: var(--theme-text, #fff);
    text-align: center;
    translate: -50% -50%;
  }

  .load-notice i {
    color: var(--theme-accent, #f59e0b);
    font-size: 2rem;
  }

  .load-notice.error i {
    color: var(--semantic-error, #ef4444);
  }

  .load-notice span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .unsupported-state {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    align-content: center;
    padding: clamp(1.25rem, 4cqi, 4.5rem);
    color: var(--theme-text, #fff);
    text-align: center;
  }

  .unsupported-state i {
    color: var(--semantic-warning, #f59e0b);
    font-size: 2.5rem;
  }

  @container (max-width: 52rem) {
    .drill-layer {
      right: 0.75rem;
      flex-direction: column;
    }

    .drill-inspector {
      width: auto;
      max-height: 40%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .load-notice i {
      animation: none;
    }
  }
</style>
