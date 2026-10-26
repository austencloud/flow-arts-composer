<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import RuntimeMotionCapture from "./RuntimeMotionCapture.svelte";
  import type { composerCaptureRequest } from "../unreal/domain/composer-capture-request";
  import { getComposerMotionCache } from "../unreal/domain/composer-motion-cache";
  import { getComposerMotionStore } from "../unreal/domain/composer-motion-store";
  import type { CapturedPoseClip } from "../native-capture/captured-pose-player";
  import {
    isCurrentMotionCaptureJob,
    planWebMotionPreparation,
  } from "./web-motion-preparation-plan";

  // Bakes performer motion behind the scenes. Nothing here is shown: the live
  // performer plays the whole time, and the baked clip takes over silently
  // when it lands. If baking fails, the live performer simply keeps going.

  type Request = ReturnType<typeof composerCaptureRequest>;
  let {
    requests,
    cacheRevision,
    onCacheChange,
    onCapturingChange,
  }: {
    requests: Request[];
    cacheRevision: number;
    onCacheChange: () => void;
    /** True while a hidden capture scene is mounted and competing for this thread. */
    onCapturingChange?: (capturing: boolean) => void;
  } = $props();

  const cache = getComposerMotionCache();
  const store = getComposerMotionStore();
  let failure = $state("");
  let attempt = $state(0);
  let disposed = false;
  let previousKeys = "";
  // Signatures whose saved copy on this device has been checked. Until then a
  // motion is not baked, so a clip saved on an earlier visit is reused.
  const checkedOnDevice = new SvelteSet<string>();
  const readingFromDevice = new Set<string>();
  let reportedCapturing = false;
  onDestroy(() => {
    disposed = true;
    if (reportedCapturing) onCapturingChange?.(false);
  });
  const plan = $derived.by(() => {
    void cacheRevision;
    return planWebMotionPreparation(
      requests,
      (signature) => !!cache.getPose(signature),
      (signature) => !checkedOnDevice.has(signature)
    );
  });
  const requestKeys = $derived(
    plan.unique.map((request) => request.signature).join("\u0000")
  );
  $effect(() => {
    if (requestKeys === previousKeys) return;
    previousKeys = requestKeys;
    failure = "";
    // A clip may have left memory since it was last checked, so a new cast or
    // sequence checks the device again rather than baking from scratch.
    checkedOnDevice.clear();
    attempt += 1;
    if (plan.overflow) {
      console.warn(
        "[ComposerMotion] More than eight distinct motions in this cast; the live performer plays without a baked clip."
      );
    }
  });
  $effect(() => {
    for (const request of plan.lookups) {
      if (readingFromDevice.has(request.signature)) continue;
      readFromDevice(request.signature);
    }
  });
  const nextRequest = $derived(failure ? undefined : plan.next);
  $effect(() => {
    const capturing = !!nextRequest;
    if (capturing === reportedCapturing) return;
    reportedCapturing = capturing;
    untrack(() => onCapturingChange?.(capturing));
  });

  function readFromDevice(signature: string): void {
    readingFromDevice.add(signature);
    void store.load(signature).then((pose) => {
      readingFromDevice.delete(signature);
      if (disposed) return;
      if (pose && !cache.getPose(signature)) {
        cache.setPose(signature, pose);
        onCacheChange();
      }
      checkedOnDevice.add(signature);
    });
  }

  function captureJob(request: Request) {
    const signature = request.signature;
    const generation = attempt;
    const keys = requestKeys;
    const current = () =>
      !disposed &&
      isCurrentMotionCaptureJob(
        { signature, generation, requestKeys: keys },
        { signature: nextRequest?.signature, generation: attempt, requestKeys }
      );
    return {
      sequence: request.sequence!,
      options: request.options,
      onComplete: (bundle: object, pose: CapturedPoseClip) => {
        if (!current()) return;
        cache.set(signature, bundle, pose);
        onCacheChange();
        store.save(signature, pose).catch((error: unknown) => {
          console.warn(
            "[ComposerMotion] Could not keep the baked motion on this device:",
            error
          );
        });
      },
      onError: (message: string) => {
        if (!current()) return;
        console.warn(
          "[ComposerMotion] Baking motion failed; the live performer keeps playing:",
          message
        );
        failure = message;
      },
    };
  }
</script>

{#if nextRequest}
  {#key `${attempt}:${nextRequest.signature}`}
    {@const job = untrack(() => captureJob(nextRequest!))}
    <RuntimeMotionCapture
      sequence={job.sequence}
      {...job.options}
      onComplete={job.onComplete}
      onError={job.onError}
      onProgress={() => {}}
    />
  {/key}
{/if}
