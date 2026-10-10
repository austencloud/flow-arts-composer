<script lang="ts">
  import { tick } from "svelte";
  import { useThrelte } from "@threlte/core";

  import { warmupRenderer } from "#lib/shared/3d/scene-boot/renderer-warmup.js";
  import { resolveThrelteHandles } from "#lib/shared/3d/scene-boot/threlte-handles.js";

  interface Props {
    armed: boolean;
    onReadyChange?: (ready: boolean) => void;
  }

  const props: Props = $props();
  const threlte = useThrelte();
  const afterPaint = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  $effect(() => {
    if (!props.armed) {
      props.onReadyChange?.(false);
      return;
    }

    let cancelled = false;
    const abort = new AbortController();

    void (async () => {
      // The activation harness must measure the same post-warmup state that a
      // production viewer reveals, including meshes mounted by the final rig.
      await tick();
      await afterPaint();
      await afterPaint();
      if (cancelled) return;

      const handles = resolveThrelteHandles(threlte);
      if (!handles) return;
      await warmupRenderer(handles, { signal: abort.signal });
      if (cancelled) return;
      await afterPaint();
      props.onReadyChange?.(true);
    })();

    return () => {
      cancelled = true;
      abort.abort();
    };
  });
</script>
