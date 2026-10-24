<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import RuntimeMotionCapture from "./RuntimeMotionCapture.svelte";
  import type { composerCaptureRequest } from "../unreal/domain/composer-capture-request";
  import { getComposerMotionCache } from "../unreal/domain/composer-motion-cache";
  import type { CapturedPoseClip } from "../native-capture/captured-pose-player";
  import {
    isCurrentMotionCaptureJob,
    planWebMotionPreparation,
  } from "./web-motion-preparation-plan";

  type Request = ReturnType<typeof composerCaptureRequest>;
  let {
    requests,
    cacheRevision,
    onCacheChange,
  }: {
    requests: Request[];
    cacheRevision: number;
    onCacheChange: () => void;
  } = $props();

  const cache = getComposerMotionCache();
  let failure = $state("");
  let progress = $state("");
  let attempt = $state(0);
  let disposed = false;
  let previousKeys = "";
  onDestroy(() => {
    disposed = true;
  });
  const plan = $derived.by(() => {
    void cacheRevision;
    return planWebMotionPreparation(
      requests,
      (signature) => !!cache.getPose(signature)
    );
  });
  const requestKeys = $derived(
    plan.unique.map((request) => request.signature).join("\u0000")
  );
  $effect(() => {
    if (requestKeys === previousKeys) return;
    previousKeys = requestKeys;
    failure = "";
    progress = "";
    attempt += 1;
  });
  const nextRequest = $derived(failure ? undefined : plan.next);

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
        progress = "";
        onCacheChange();
      },
      onError: (message: string) => {
        if (!current()) return;
        failure = message;
        progress = "";
      },
      onProgress: (
        phase: "warming" | "capturing",
        frame: number,
        total: number
      ) => {
        if (!current()) return;
        progress = `${phase === "warming" ? "Preparing" : "Capturing"} motion · ${Math.round((frame / total) * 100)}%`;
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
      onProgress={job.onProgress}
    />
  {/key}
{/if}

{#if plan.unique.length > plan.completedCount || failure}
  <div class="motion-preparation" role="status" aria-live="polite">
    {#if plan.overflow || failure}
      <span
        >Motion preparation failed: {failure ||
          "This cast has more than eight distinct motions. Reduce the cast or reuse choreography."}</span
      >
      {#if !plan.overflow}
        <button
          onclick={() => {
            failure = "";
            progress = "";
            attempt += 1;
          }}>Retry</button
        >
      {/if}
    {:else}
      <span
        >{progress || "Preparing performer motion…"} · {plan.completedCount}/{plan
          .unique.length}</span
      >
    {/if}
  </div>
{/if}

<style>
  .motion-preparation {
    position: absolute;
    z-index: 25;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 8px;
    background: var(--surface-raised, #242430);
    color: var(--text-primary, #fff);
    font-size: var(--font-size-min, 14px);
    box-shadow: 0 4px 16px #0006;
  }
  button {
    color: inherit;
    border: 1px solid currentColor;
    border-radius: 6px;
    background: transparent;
    padding: 4px 9px;
    cursor: pointer;
  }
</style>
