<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { isBuugengFamilyProp } from "#lib/shared/pictograph/prop/domain/enums/prop-classification.js";
  import { resolvePerformerProp } from "../../state/performer-prop-resolution";
  import { getEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import type { TipEffectMap } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { getViewer3DContext } from "../../context/viewer-3d-context";
  import { resolvePerformerStepSource } from "../../domain/performer-step-timing";
  import type { CapturedPoseClip } from "../../native-capture/captured-pose-player";
  import RuntimeMotionCapture from "../../components/RuntimeMotionCapture.svelte";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import { createNativeViewerConnection } from "../state/native-viewer-connection.svelte";
  import { nativePropId } from "../domain/native-prop-selection";
  import { getComposerMotionCache } from "../domain/composer-motion-cache";
  import { composerCaptureRequest } from "../domain/composer-capture-request";
  import {
    MotionTransferQueue,
    scoreStepToSeconds,
    transferNativeMotion,
  } from "../domain/motion-transfer";
  import type { NativePerformer } from "../domain/bridge-protocol";
  import UnrealViewerSurface from "./UnrealViewerSurface.svelte";

  let {
    sequenceData,
    currentStep,
    isPlaying,
    bpm = 60,
    performerSteps = null,
    performerStepOffsets = [],
    visiblePerformerCount,
    leftPropType = null,
    rightPropType = null,
  }: {
    sequenceData: SequenceData | null;
    currentStep: number;
    isPlaying: boolean;
    bpm?: number;
    performerSteps?: readonly (number | null | undefined)[] | null;
    performerStepOffsets?: readonly number[];
    visiblePerformerCount?: number;
    leftPropType?: string | null;
    rightPropType?: string | null;
  } = $props();
  const viewer = getViewer3DContext();
  const visibilityManager = getAnimationVisibilityManager();
  const viewerEffects = getEffectsConfigContext();
  let legacyTipEffectMap = $state<TipEffectMap>(
    visibilityManager.effectsConfigState?.tipEffectMap ?? {}
  );
  const globalTipEffectMap = $derived(
    viewerEffects?.tipEffectMap ?? legacyTipEffectMap
  );
  type SettingsService =
    (typeof import("#lib/shared/settings/state/settings-state.svelte.js"))["settingsService"];
  let viewerSettings = $state<SettingsService | null>(null);
  const fallbackLeftProp = $derived(
    (leftPropType ||
      sequenceData?.intendedProp?.leftPropType ||
      sequenceData?.creatorIntent?.propConfig?.leftPropType ||
      viewerSettings?.settings?.leftPropType ||
      PropType.STAFF) as PropType
  );
  const fallbackRightProp = $derived(
    (rightPropType ||
      sequenceData?.intendedProp?.rightPropType ||
      sequenceData?.creatorIntent?.propConfig?.rightPropType ||
      viewerSettings?.settings?.rightPropType ||
      PropType.STAFF) as PropType
  );
  const connection = createNativeViewerConnection();
  let progress = $state("");
  let failure = $state("");
  let installed = $state<Record<string, string>>({});
  let castReady = $state(false);
  let syncingCast = false;
  let castBoundToSession = false;
  let generation = 0;
  let captureGeneration = $state(0);
  let disposed = false;
  let progressOwner = "";
  let cacheRevision = $state(0);
  const transferQueue = new MotionTransferQueue();
  const cache = getComposerMotionCache();

  function setProgress(owner: string, message: string): void {
    progressOwner = owner;
    progress = message;
  }

  function clearProgress(owner: string): void {
    if (progressOwner !== owner) return;
    progressOwner = "";
    progress = "";
  }
  const performers = $derived(
    viewer.performerManager.performers.slice(0, visiblePerformerCount)
  );
  const presentation = $derived.by(() => {
    try {
      return {
        cast: performers.map((p) => {
          const leftProp = resolvePerformerProp(
            p,
            fallbackLeftProp,
            leftPropType as PropType | null
          );
          const rightProp = resolvePerformerProp(
            p,
            fallbackRightProp,
            rightPropType as PropType | null
          );
          if (leftProp !== rightProp)
            throw new Error(
              "Unreal needs the same prop in both hands. Use Web for mixed props."
            );
          const fallbackEffect =
            p.rawEffect ?? globalTipEffectMap["*"]?.effect ?? "none";
          const leftEffect = p.rawHandEffects?.left ?? fallbackEffect;
          const rightEffect = p.rawHandEffects?.right ?? fallbackEffect;
          if (leftEffect !== rightEffect)
            throw new Error(
              "Unreal needs the same effect in both hands. Use Web for mixed effects."
            );
          if (
            leftEffect !== "none" &&
            leftEffect !== "fire" &&
            leftEffect !== "led"
          )
            throw new Error(
              `The ${leftEffect} effect is available in Web view. Use Web to see it.`
            );
          const leftFlipped =
            isBuugengFamilyProp(leftProp) &&
            (viewerSettings?.settings?.leftBuugengFlipped ?? false);
          const rightFlipped =
            isBuugengFamilyProp(rightProp) &&
            (viewerSettings?.settings?.rightBuugengFlipped ?? false);
          return {
            performer: p,
            propType: leftProp,
            effectId: leftEffect,
            leftFlipped,
            rightFlipped,
            cast: {
              performerId: p.id,
              characterId: p.characterId,
              propId: nativePropId(leftProp, p.effectivePropBuild, {
                leftFlipped,
                rightFlipped,
              }),
              effect: leftEffect,
              position: { x: p.position.x, z: p.position.z },
              facingAngle: p.facingAngle,
            },
          };
        }),
        error: "",
      };
    } catch (error) {
      return {
        cast: [],
        error:
          error instanceof Error &&
          !error.message.startsWith("Native prop variant")
            ? error.message
            : "This prop build is unavailable in Unreal. Choose another build or use Web.",
      };
    }
  });
  const statusError = $derived(
    presentation.error || failure || connection.error
  );
  const loading = $derived(
    !statusError &&
      !connection.needsPlay &&
      (connection.status === "connecting" ||
        (connection.status === "ready" && (!castReady || !!progress)))
  );
  const statusTitle = $derived(
    statusError || connection.status === "disconnected"
      ? "Unreal needs attention"
      : connection.needsPlay
        ? "Unreal is ready"
        : connection.status === "connecting"
          ? "Connecting to Unreal"
          : loading
            ? "Preparing your performers"
            : "Unreal · Studio"
  );
  const requests = $derived(
    presentation.cast.map(
      ({ performer, propType, effectId, leftFlipped, rightFlipped }) =>
        composerCaptureRequest(
          performer,
          sequenceData,
          propType,
          effectId,
          leftFlipped,
          rightFlipped
        )
    )
  );
  const selected = $derived(
    performers[viewer.primaryPerformerIndex ?? -1]?.id ?? null
  );
  const nextCapture = $derived(
    castReady && !failure
      ? requests.find(
          (request) =>
            request.sequence && installed[request.id] !== request.signature
        )
      : undefined
  );
  const uncachedCapture = $derived.by(() => {
    void cacheRevision;
    const request = nextCapture;
    return request?.sequence && !cache.has(request.signature)
      ? request
      : undefined;
  });

  // Keep callbacks independent of the keyed block's reactive @const. The
  // capture can finish or fail after that block has been invalidated.
  function captureJob(
    request: NonNullable<typeof uncachedCapture>,
    epoch: number
  ) {
    const { id, signature, sequence, options } = request;
    const owner = `capture:${epoch}:${id}:${signature}`;
    const current = () =>
      !disposed &&
      generation === epoch &&
      nextCapture?.id === id &&
      nextCapture.signature === signature;
    return {
      sequence: sequence!,
      options,
      onComplete: (bundle: object, pose: CapturedPoseClip) => {
        if (disposed) return;
        cache.set(signature, bundle, pose);
        clearProgress(owner);
        cacheRevision += 1;
      },
      onError: (message: string) => {
        if (!current()) return;
        failure = message;
        clearProgress(owner);
      },
      onProgress: (
        phase: "warming" | "capturing",
        frame: number,
        total: number
      ) => {
        if (!current()) return;
        setProgress(
          owner,
          `${phase === "warming" ? "Preparing" : "Capturing"} performer motion · ${Math.round((frame / total) * 100)}%`
        );
      },
    };
  }

  function samePerformer(
    previous: NativePerformer | undefined,
    desired: NativePerformer
  ): boolean {
    if (!previous) return false;
    return (
      previous.performerId === desired.performerId &&
      previous.characterId === desired.characterId &&
      previous.propId === desired.propId &&
      (previous.effect ?? "none") === (desired.effect ?? "none") &&
      Math.abs(previous.position.x - desired.position.x) < 0.0001 &&
      Math.abs(previous.position.z - desired.position.z) < 0.0001 &&
      Math.abs(previous.facingAngle - desired.facingAngle) < 0.0001
    );
  }

  // Composer remains authoritative. Native reconnects restore the current cast,
  // never replace the viewer's settings, selection, or choreography.
  $effect(() => {
    const ready = connection.status === "ready";
    const desired = presentation.cast.map((entry) => entry.cast);
    const catalogError = presentation.error;
    const selection = selected;
    const epoch = ++generation;
    captureGeneration = epoch;
    transferQueue.resetClaims();
    progressOwner = "";
    progress = "";
    castReady = false;
    failure = catalogError;
    if (catalogError) return;
    if (!ready) {
      castBoundToSession = false;
      installed = {};
      return;
    }
    syncingCast = true;
    void (async () => {
      try {
        const existing = untrack(() => connection.state?.performers ?? []);
        for (const p of existing) {
          if (!desired.some((entry) => entry.performerId === p.performerId))
            await connection.command("removePerformer", {
              performerId: p.performerId,
            });
        }
        for (const p of desired) {
          if (epoch !== generation || disposed) return;
          const previous = existing.find(
            (entry) => entry.performerId === p.performerId
          );
          if (!castBoundToSession || !samePerformer(previous, p)) {
            await connection.command("setPerformer", {
              ...p,
              composerOwned: true,
            });
            if (
              !previous ||
              previous.characterId !== p.characterId ||
              previous.propId !== p.propId
            ) {
              installed = { ...installed, [p.performerId]: "" };
            }
          }
        }
        if (epoch !== generation || disposed) return;
        await connection.command("select", { performerId: selection });
        if (epoch === generation) {
          castBoundToSession = true;
          castReady = true;
        }
      } catch (error) {
        if (epoch === generation)
          failure =
            error instanceof Error
              ? error.message
              : "The Unreal scene could not update.";
      } finally {
        if (epoch === generation) syncingCast = false;
      }
    })();
  });

  function scheduleTransfer(
    request: NonNullable<typeof nextCapture>,
    bundle: object
  ): void {
    const epoch = generation;
    const owner = `transfer:${epoch}:${request.id}:${request.signature}`;
    const current = () =>
      !disposed &&
      generation === epoch &&
      connection.status === "ready" &&
      requests.some(
        (entry) =>
          entry.id === request.id && entry.signature === request.signature
      );
    transferQueue.enqueue(owner, current, async () => {
      setProgress(owner, "Sending motion to Unreal…");
      try {
        if (
          await transferNativeMotion(
            connection.command,
            request.id,
            bundle,
            current
          )
        ) {
          installed = { ...installed, [request.id]: request.signature };
        }
      } catch (error) {
        if (current())
          failure =
            error instanceof Error ? error.message : "Motion transfer failed.";
      } finally {
        clearProgress(owner);
      }
    });
  }

  $effect(() => {
    void cacheRevision;
    const request = nextCapture;
    if (!request) return;
    const cached = cache.get(request.signature);
    if (cached)
      untrack(() => {
        scheduleTransfer(request, cached);
      });
  });

  onMount(() => {
    let mounted = true;
    const updateMap = () => {
      legacyTipEffectMap =
        visibilityManager.effectsConfigState?.tipEffectMap ?? {};
    };
    visibilityManager.registerObserver(updateMap);
    updateMap();
    void import("#lib/shared/settings/state/settings-state.svelte.js").then(
      ({ settingsService }) => {
        if (mounted) viewerSettings = settingsService;
      }
    );
    let pending = false;
    let previous = "";
    let lastSync = 0;
    let lastStatus = connection.status;
    const timer = setInterval(() => {
      if (connection.status !== lastStatus) {
        previous = "";
        lastStatus = connection.status;
      }
      if (pending || syncingCast || !castReady || connection.status !== "ready")
        return;
      const nativeRate = bpm / 60;
      const useNativeClock =
        nativeRate >= 0.5 &&
        nativeRate <= 1.75 &&
        performerSteps == null &&
        performers.every((p) => p.motionStepOffset === 0) &&
        requests.every((request) =>
          request.sequence?.steps.every((step) => step.duration === 1)
        );
      if (useNativeClock && isPlaying && performance.now() - lastSync < 100)
        return;
      const payload = {
        action: "sync",
        playing: isPlaying && useNativeClock,
        rate: useNativeClock ? nativeRate : 1,
        performers: performers
          .filter((p) =>
            requests.some(
              (request) =>
                request.id === p.id &&
                request.sequence &&
                installed[p.id] === request.signature
            )
          )
          .map((p) => {
            const index = performers.indexOf(p);
            const step = resolvePerformerStepSource(
              performerSteps?.[index],
              currentStep,
              performerStepOffsets[index] ?? 0,
              p.totalSteps
            );
            const sequence = requests[index]?.sequence;
            return {
              performerId: p.id,
              seconds: scoreStepToSeconds(
                sequence?.steps ?? [],
                step,
                p.motionStepOffset
              ),
            };
          }),
      };
      const signature = JSON.stringify(payload);
      if (!payload.performers.length || signature === previous) return;
      pending = true;
      void connection
        .command("playback", payload)
        .then(() => {
          previous = signature;
          lastSync = performance.now();
        })
        .catch((error: Error) => {
          connection.report(error.message);
        })
        .finally(() => {
          pending = false;
        });
    }, 1000 / 30);
    return () => {
      mounted = false;
      visibilityManager.unregisterObserver(updateMap);
      disposed = true;
      ++generation;
      clearInterval(timer);
    };
  });
</script>

{#if !presentation.error}
  <UnrealViewerSurface {connection} sceneOwner="composer" />
{/if}
{#if uncachedCapture}
  {#key `${captureGeneration}:${uncachedCapture.id}:${uncachedCapture.signature}`}
    {@const job = untrack(() =>
      captureJob(uncachedCapture!, captureGeneration)
    )}
    <RuntimeMotionCapture
      sequence={job.sequence}
      {...job.options}
      onComplete={job.onComplete}
      onError={job.onError}
      onProgress={job.onProgress}
    />
  {/key}
{/if}
<div class="native-status" role="status" aria-live="polite" aria-atomic="true">
  <div class="status-heading">
    {#if loading}
      <div class="loading-indicator" aria-hidden="true">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
      </div>
    {/if}
    <strong>{statusTitle}</strong>
  </div>
  {#if statusError}
    <p class="error">{statusError}</p>
  {:else if connection.needsPlay}
    <p>Select Show live scene to start the video.</p>
  {:else if connection.status === "connecting"}
    <p>{connection.message}</p>
  {:else if progress}
    <p>{progress}</p>
  {:else if loading}
    <p>Setting up your performers and their props…</p>
  {/if}
  {#if connection.status === "ready" && !loading && !statusError}
    <p class="environment-note">Environment is available in Web view.</p>
  {/if}
  {#if statusError || connection.status === "disconnected"}
    <button
      onclick={() => {
        failure = "";
        installed = {};
        connection.reconnect();
      }}>Retry</button
    >
  {/if}
  {#if connection.status !== "ready" || statusError}
    <button onclick={() => viewer.setSceneRenderer("web")}>Use Web</button>
  {/if}
  {#if connection.needsPlay}<button onclick={() => connection.play()}
      >Show live scene</button
    >{/if}
</div>

<style>
  .native-status {
    position: absolute;
    left: 1rem;
    /* The desktop performer spine can start below host chrome at 76px. */
    top: calc(max(1rem, env(safe-area-inset-top)) + 9rem);
    max-width: min(28rem, calc(100% - 7rem));
    max-height: calc(100% - 11rem);
    overflow-y: auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    border-radius: var(--radius-md, 0.5rem);
    border: 1px solid var(--theme-stroke, #323641);
    background: var(--theme-panel-bg, #171b22);
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    line-height: 1.5;
    pointer-events: auto;
  }
  .status-heading {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
  }
  .loading-indicator {
    display: flex;
    flex-shrink: 0;
  }
  p {
    width: 100%;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .environment-note {
    color: var(--theme-text-muted, #a0a6b5);
    font-size: var(--font-size-compact, 12px);
  }
  /* Compact scene controls use a bottom sheet instead of the performer spine. */
  @media (max-width: 767px),
    (max-height: 500px),
    (max-width: 1099px) and (max-height: 543px) {
    .native-status {
      top: calc(max(1rem, env(safe-area-inset-top)) + 4rem);
      max-height: calc(100% - 6rem);
    }
  }
  .error {
    color: var(--semantic-error, #ffb0a8);
  }
  button {
    min-height: 44px;
    padding: 0.5rem 0.8rem;
    border: 1px solid var(--theme-stroke-strong, #717c94);
    border-radius: var(--radius-md, 0.5rem);
    color: inherit;
    background: transparent;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
</style>
