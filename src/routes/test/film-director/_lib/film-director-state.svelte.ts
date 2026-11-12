import { ZodError } from "zod";

import {
  sampleFilmDirector,
  type FilmDirectorChannelPreview,
} from "./sample-film-director";
import { resolveFilmDirectorSpec } from "./resolve-film-director-spec";
import {
  applyChannelEdit,
  applyPerformerEdit,
  applySceneEdit,
  type ChannelEdit,
  type PerformerEdit,
  type SceneEdit,
} from "./film-director-edit";
import type { FilmDirectorInput } from "./film-director-schema";
import { getFilmDirectorWarmupStepCount } from "./film-director-warmup-plan";
import type { FilmRecordingHost } from "./film-director-recorder.svelte";

function explainValidationError(error: unknown): string {
  if (!(error instanceof ZodError)) {
    return error instanceof Error ? error.message : String(error);
  }

  const issues = error.issues.slice(0, 3).map((issue) => {
    const field = issue.path.length
      ? issue.path
          .map((part) => (typeof part === "number" ? part + 1 : part))
          .join(" → ")
      : "film";
    const message = issue.message
      .replace("Invalid input: expected 1", "must be 1")
      .replace(
        /Invalid input: expected \w+, received undefined/,
        "is required"
      );
    return `${field} ${message}`;
  });
  const remaining = error.issues.length - issues.length;
  return `${issues.join(". ")}${remaining > 0 ? `. ${remaining} more issue${remaining === 1 ? "" : "s"}.` : "."}`;
}

export interface FilmDirectorStateOptions {
  /**
   * A scene the film should open soloed on, from the address that opened the
   * page. It has to arrive here rather than being set from the workbench's
   * `onMount`, because the scene component is a child and starts warming from
   * scene zero before any parent mount handler runs.
   */
  soloSceneId?: string | null;
}

export function createFilmDirectorState(
  initialInput: FilmDirectorInput,
  options: FilmDirectorStateOptions = {}
) {
  let sourceInput = $state<FilmDirectorInput>(structuredClone(initialInput));
  let film = $state(resolveFilmDirectorSpec(sourceInput));
  let draft = $state(JSON.stringify(sourceInput, null, 2));

  const requestedSoloIndex = options.soloSceneId
    ? film.scenes.findIndex((scene) => scene.id === options.soloSceneId)
    : -1;
  const openingSoloIndex = requestedSoloIndex >= 0 ? requestedSoloIndex : null;

  /**
   * The scene the curtain warms, fixed for the life of one preparation.
   *
   * Deliberately not `soloSceneIndex`: leaving solo halfway through the curtain
   * would otherwise lengthen the plan under the cursor already walking it.
   */
  let warmupSceneIndex = $state<number | null>(openingSoloIndex);

  let playheadSeconds = $state(0);
  let wantsToPlay = $state(film.playback.autoplay);
  let isPlaying = $state(false);
  let sceneReady = $state(false);
  let transitionHolding = $state(false);
  let preparationRevision = $state(0);
  let preparation = $state({
    complete: false,
    sceneIndex: openingSoloIndex ?? 0,
    totalScenes: film.scenes.length,
    sceneTitle:
      film.scenes[openingSoloIndex ?? 0]?.title ?? "Opening scene",
    preparedSteps: 0,
    totalSteps: getFilmDirectorWarmupStepCount(
      film.scenes.length,
      openingSoloIndex
    ),
  });
  let editorOpen = $state(false);
  let validationError = $state<string | null>(null);
  /**
   * Bumped by every in-place document edit. A control-surface edit replaces
   * the film with a re-resolved copy while the same scene stays on screen, so
   * the scene's own cut detection — which compares scene ids — cannot see it.
   */
  let editRevision = $state(0);
  let lastEditError = $state<string | null>(null);
  let frameRequest: number | null = null;
  let lastFrameTime: number | null = null;
  /**
   * True while something other than the rAF clock owns the playhead: the
   * recorder seeks to each output frame's exact time itself. The film stays
   * in its playing state, because effects and live poses only draw while it
   * plays, but `tick` stops moving the playhead.
   */
  let externalClock = $state(false);

  /**
   * A manual camera layer standing in for one scene's own while a key is being
   * dragged. Committing every pointer move would re-resolve the whole film;
   * this substitutes the layer at sample time instead, so the rig answers the
   * drag immediately and the document is written once, on release.
   */
  let channelPreview = $state<FilmDirectorChannelPreview | null>(null);

  const frame = $derived(
    sampleFilmDirector(film, playheadSeconds, channelPreview)
  );

  /**
   * The scene the playhead is confined to, or null for the whole film.
   *
   * A 24-scene film is a linear watch, which is the wrong shape for checking
   * one capability: someone who wants to see the dolly zoom should not have to
   * sit through the eleven scenes in front of it. Solo turns the film into that
   * one scene, looping, so a capability costs its own duration to inspect and
   * nothing more.
   */
  let soloSceneIndex = $state<number | null>(openingSoloIndex);

  /**
   * The window the playhead wraps inside. It starts a hair past the scene's own
   * start for the same reason `selectScene` does: landing exactly on a boundary
   * lands inside the outgoing scene's transition.
   */
  const soloWindow = $derived.by(() => {
    const index = soloSceneIndex;
    if (index === null) return null;
    const scene = film.scenes[index];
    if (!scene) return null;
    const lead =
      scene.transition.kind === "fade-through-black"
        ? scene.transition.durationSeconds / 2 + 0.001
        : 0.001;
    return {
      index,
      start: scene.startSeconds + lead,
      end: scene.startSeconds + scene.durationSeconds,
    };
  });

  // An address that opened on a scene starts at that scene's head, not at zero.
  // Without this the first tick seeks from 0, and `seek` wraps a before-window
  // playhead to an arbitrary point inside the window.
  if (openingSoloIndex !== null) {
    const opened = soloWindow;
    if (opened) playheadSeconds = opened.start;
  }

  function seek(seconds: number): void {
    const window = soloWindow;
    if (window) {
      const span = Math.max(0.001, window.end - window.start);
      const offset = seconds - window.start;
      playheadSeconds = window.start + (((offset % span) + span) % span);
      return;
    }
    if (film.playback.loop) {
      playheadSeconds =
        ((seconds % film.durationSeconds) + film.durationSeconds) %
        film.durationSeconds;
      return;
    }
    playheadSeconds = Math.max(0, Math.min(film.durationSeconds, seconds));
  }

  /**
   * Confines playback to one scene and parks the playhead at its head. Passing
   * null releases the film and leaves the playhead where the soloed scene left
   * it, so the surrounding film resumes from that point rather than from zero.
   */
  function setSoloScene(index: number | null): void {
    if (index === null) {
      soloSceneIndex = null;
      return;
    }
    if (!film.scenes[index]) return;
    soloSceneIndex = index;
    // The window's own start, not the scene's: the window opens a millisecond
    // later to clear the incoming transition, so seeking to the raw scene start
    // is a millisecond BEFORE the window and wraps to its tail — which parks a
    // freshly soloed scene on its last frame.
    const opened = soloWindow;
    if (opened) playheadSeconds = opened.start;
  }

  function play(): void {
    wantsToPlay = true;
    // A soloed scene always has somewhere to go — its own window wraps — so
    // only an un-soloed non-looping film can be parked at a dead end.
    if (
      !soloWindow &&
      !film.playback.loop &&
      playheadSeconds >= film.durationSeconds
    ) {
      seek(0);
    }
    if (sceneReady && !transitionHolding) isPlaying = true;
  }

  function pause(): void {
    wantsToPlay = false;
    isPlaying = false;
  }

  function togglePlayback(): void {
    if (wantsToPlay) pause();
    else play();
  }

  function setSceneReady(ready: boolean): void {
    sceneReady = ready;
    isPlaying = ready && wantsToPlay && !transitionHolding;
  }

  function setTransitionHolding(holding: boolean): void {
    transitionHolding = holding;
    isPlaying = sceneReady && wantsToPlay && !holding;
  }

  function setPreparationScene(index: number, preparedSteps = 0): void {
    const scene = film.scenes[index];
    if (!scene) return;
    const totalSteps = getFilmDirectorWarmupStepCount(
      film.scenes.length,
      warmupSceneIndex
    );
    preparation = {
      complete: false,
      sceneIndex: index,
      totalScenes: film.scenes.length,
      sceneTitle: scene.title,
      preparedSteps: Math.max(0, Math.min(totalSteps, preparedSteps)),
      totalSteps,
    };
  }

  function completePreparation(): void {
    preparation = { ...preparation, complete: true };
  }

  function resetPreparation(): void {
    sceneReady = false;
    transitionHolding = false;
    isPlaying = false;
    preparationRevision += 1;
    // A different film's scene indices name different scenes, so the opening
    // address stops applying and the next curtain warms the whole thing.
    warmupSceneIndex = null;
    preparation = {
      complete: false,
      sceneIndex: 0,
      totalScenes: film.scenes.length,
      sceneTitle: film.scenes[0]?.title ?? "Opening scene",
      preparedSteps: 0,
      totalSteps: getFilmDirectorWarmupStepCount(film.scenes.length, null),
    };
  }

  function selectScene(index: number): void {
    const scene = film.scenes[index];
    if (!scene) return;
    // While soloing, choosing a scene moves the solo rather than seeking into a
    // window the playhead would immediately be wrapped out of.
    if (soloSceneIndex !== null) {
      setSoloScene(index);
      return;
    }
    const clearPreviewOffset =
      scene.transition.kind === "fade-through-black"
        ? scene.transition.durationSeconds / 2 + 0.001
        : 0.001;
    seek(scene.startSeconds + clearPreviewOffset);
  }

  function previousScene(): void {
    selectScene(
      frame.sceneIndex > 0 ? frame.sceneIndex - 1 : film.scenes.length - 1
    );
  }

  function nextScene(): void {
    selectScene((frame.sceneIndex + 1) % film.scenes.length);
  }

  function setDraft(value: string): void {
    draft = value;
    validationError = null;
  }

  function applyDraft(): boolean {
    try {
      const parsed = JSON.parse(draft) as unknown;
      const nextFilm = resolveFilmDirectorSpec(parsed);
      sourceInput = parsed as FilmDirectorInput;
      film = nextFilm;
      // Scene indices no longer name the same scenes.
      soloSceneIndex = null;
      playheadSeconds = 0;
      wantsToPlay = nextFilm.playback.autoplay;
      isPlaying = sceneReady && wantsToPlay && !transitionHolding;
      validationError = null;
      resetPreparation();
      return true;
    } catch (error: unknown) {
      validationError = explainValidationError(error);
      return false;
    }
  }

  function resetDraft(): void {
    draft = JSON.stringify(sourceInput, null, 2);
    validationError = null;
  }

  /**
   * Patches one performer in the authored document and re-resolves.
   *
   * Unlike `applyDraft`, the playhead and the warmup are left alone: the same
   * scene is still on screen and only its cast's parameters moved. Returns
   * false and leaves the document untouched when the edit would not validate.
   */
  function editPerformer(edit: PerformerEdit): boolean {
    try {
      // $state.snapshot first: sourceInput is a reactive proxy, and
      // structuredClone throws on one.
      const patched = applyPerformerEdit(
        $state.snapshot(sourceInput) as FilmDirectorInput,
        film,
        edit
      );
      const nextFilm = resolveFilmDirectorSpec(patched);
      sourceInput = patched;
      film = nextFilm;
      draft = JSON.stringify(patched, null, 2);
      lastEditError = null;
      editRevision += 1;
      return true;
    } catch (error: unknown) {
      lastEditError = explainValidationError(error);
      return false;
    }
  }

  /**
   * Patches the scene itself — its camera moves, its formation, its
   * environment. Same contract as `editPerformer`: the playhead and the warmup
   * stay put, and a rejected edit leaves the document untouched.
   */
  function editScene(edit: SceneEdit): boolean {
    try {
      const patched = applySceneEdit(
        $state.snapshot(sourceInput) as FilmDirectorInput,
        edit
      );
      const nextFilm = resolveFilmDirectorSpec(patched);
      sourceInput = patched;
      film = nextFilm;
      draft = JSON.stringify(patched, null, 2);
      lastEditError = null;
      editRevision += 1;
      return true;
    } catch (error: unknown) {
      lastEditError = explainValidationError(error);
      return false;
    }
  }

  /**
   * Writes the manual camera layer and re-resolves. Same contract as the two
   * edits above: the playhead and the warmup stay put, and a rejected write
   * leaves the document untouched. Clears any live preview, because the
   * document now says what the preview was standing in for.
   */
  function editChannel(edit: ChannelEdit): boolean {
    try {
      const patched = applyChannelEdit(
        $state.snapshot(sourceInput) as FilmDirectorInput,
        edit
      );
      const nextFilm = resolveFilmDirectorSpec(patched);
      sourceInput = patched;
      film = nextFilm;
      draft = JSON.stringify(patched, null, 2);
      lastEditError = null;
      channelPreview = null;
      editRevision += 1;
      return true;
    } catch (error: unknown) {
      lastEditError = explainValidationError(error);
      channelPreview = null;
      return false;
    }
  }

  /** Substitute a scene's manual layer for the length of a drag, or null to
   *  go back to whatever the document says. */
  function previewChannels(preview: FilmDirectorChannelPreview | null): void {
    channelPreview = preview;
  }

  function loadFilm(input: FilmDirectorInput): boolean {
    try {
      const cloned = structuredClone(input);
      const nextFilm = resolveFilmDirectorSpec(cloned);
      sourceInput = cloned;
      film = nextFilm;
      draft = JSON.stringify(cloned, null, 2);
      soloSceneIndex = null;
      playheadSeconds = 0;
      wantsToPlay = nextFilm.playback.autoplay;
      isPlaying = sceneReady && wantsToPlay && !transitionHolding;
      validationError = null;
      resetPreparation();
      return true;
    } catch (error: unknown) {
      validationError = explainValidationError(error);
      return false;
    }
  }

  function toggleEditor(): void {
    editorOpen = !editorOpen;
  }

  function tick(timestamp: number): void {
    if (lastFrameTime === null) lastFrameTime = timestamp;
    const deltaSeconds = Math.min(
      0.1,
      Math.max(0, (timestamp - lastFrameTime) / 1000)
    );
    lastFrameTime = timestamp;

    if (isPlaying && !externalClock) {
      const next = playheadSeconds + deltaSeconds;
      // A soloed scene loops regardless of the film's own playback mode: the
      // point of solo is to watch one capability repeat, and stopping at the
      // scene's last frame would defeat it.
      if (!soloWindow && !film.playback.loop && next >= film.durationSeconds) {
        playheadSeconds = film.durationSeconds;
        isPlaying = false;
        wantsToPlay = false;
      } else {
        seek(next);
      }
    }
    frameRequest = requestAnimationFrame(tick);
  }

  function setExternalClock(value: boolean): void {
    externalClock = value;
    // Back on the rAF clock, the first delta must not count the whole time
    // the recorder held the playhead.
    lastFrameTime = null;
  }

  function start(): void {
    if (frameRequest !== null) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reducedMotion) wantsToPlay = false;
    lastFrameTime = null;
    frameRequest = requestAnimationFrame(tick);
  }

  function destroy(): void {
    if (frameRequest !== null) cancelAnimationFrame(frameRequest);
    frameRequest = null;
  }

  // The WebGL canvas belongs to the scene, which is a child of the workbench,
  // so context cannot carry it upward. The scene registers a getter here and
  // the workbench reads it when the user saves a poster.
  let posterSource: (() => HTMLCanvasElement | null) | null = null;

  function setPosterSource(getter: (() => HTMLCanvasElement | null) | null): void {
    posterSource = getter;
  }

  function readPosterSource(): HTMLCanvasElement | null {
    return posterSource?.() ?? null;
  }

  // Same arrangement for the recorder: the scene owns the viewer and the
  // render loop, so it registers what the recorder needs to drive them.
  let recordingHost = $state.raw<FilmRecordingHost | null>(null);

  function setRecordingHost(host: FilmRecordingHost | null): void {
    recordingHost = host;
  }

  /**
   * The output size while a recording runs, or null. Set means clean frames:
   * the workbench drops its controls, the scene sizes the stage to exactly
   * this, and the viewer stops drawing its rings and hints.
   */
  let recordingFrame = $state<{ width: number; height: number } | null>(null);

  function setRecordingFrame(
    frame: { width: number; height: number } | null
  ): void {
    recordingFrame = frame;
  }

  return {
    get film() {
      return film;
    },
    /** The authored document, which is what gets saved — not the resolved spec. */
    get sourceInput() {
      return sourceInput;
    },
    get draft() {
      return draft;
    },
    get playheadSeconds() {
      return playheadSeconds;
    },
    get wantsToPlay() {
      return wantsToPlay;
    },
    get isPlaying() {
      return isPlaying;
    },
    get sceneReady() {
      return sceneReady;
    },
    get transitionHolding() {
      return transitionHolding;
    },
    get preparation() {
      return preparation;
    },
    get preparationRevision() {
      return preparationRevision;
    },
    get editorOpen() {
      return editorOpen;
    },
    get validationError() {
      return validationError;
    },
    get editRevision() {
      return editRevision;
    },
    get lastEditError() {
      return lastEditError;
    },
    /** The manual layer standing in for a scene's own during a drag, if any. */
    get channelPreview() {
      return channelPreview;
    },
    get frame() {
      return frame;
    },
    /** The scene playback is confined to, or null when the whole film plays. */
    get soloSceneIndex() {
      return soloSceneIndex;
    },
    /**
     * The scene the curtain warms, or null for the whole film. Fixed for the
     * life of one preparation so the plan cannot change under the cursor.
     */
    get warmupSceneIndex() {
      return warmupSceneIndex;
    },
    setSoloScene,
    seek,
    play,
    pause,
    togglePlayback,
    setSceneReady,
    setTransitionHolding,
    setPreparationScene,
    completePreparation,
    selectScene,
    previousScene,
    nextScene,
    setDraft,
    applyDraft,
    resetDraft,
    editPerformer,
    editScene,
    editChannel,
    previewChannels,
    loadFilm,
    toggleEditor,
    setPosterSource,
    readPosterSource,
    /** What the scene registered for the recorder, or null before it mounts. */
    get recordingHost() {
      return recordingHost;
    },
    setRecordingHost,
    /** The output size while recording, or null when the page is live. */
    get recordingFrame() {
      return recordingFrame;
    },
    setRecordingFrame,
    /** True while the recorder, not the rAF clock, moves the playhead. */
    get externalClock() {
      return externalClock;
    },
    setExternalClock,
    start,
    destroy,
  };
}

export type FilmDirectorState = ReturnType<typeof createFilmDirectorState>;
