<script lang="ts">
  /**
   * CreateMethodPreview
   *
   * The live preview in a Create front door method card. Spec:
   * docs/superpowers/specs/2026-10-06-create-method-previews-design.md
   *
   * The box is reserved from first paint and shows the method's tint. Once
   * the board is open and idle and any route morph has finished, the
   * method's scene loads and draws its finished picture in the hidden layer. When the scene
   * reports ready, the box crossfades from the tint to the scene, so nothing
   * around it moves. Turns arrive from the front door's coordinator as
   * `playing` and `turn`.
   *
   * The box is decorative: inert and hidden from assistive technology, so
   * the card stays one native button with its own name. The host gives it a
   * positioned, sized slot; it fills that slot and is the size container its
   * scene measures against.
   */
  import { onDestroy } from "svelte";
  import DualSourceCrossfade from "$lib/shared/components/DualSourceCrossfade.svelte";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import { runAfterNamedRouteMorphIdle } from "$lib/shared/transitions/named-route-morph-state.svelte";
  import { classifyPreviewShape } from "./method-preview-layout";
  import {
    METHOD_PREVIEW_SCENES,
    type MethodPreviewSceneModule,
  } from "./method-preview-scenes";

  let {
    methodId,
    color,
    open = true,
    playing = false,
    turn = 0,
    onready,
    loader,
  }: {
    /**
     * A CREATE_TABS id. Fixed for the box's life: hosts key the box by
     * method id.
     */
    methodId: string;
    /** The method's color: the tint, and the scene's accent. */
    color: string;
    /**
     * Whether the board is open. The front door stays mounted behind a
     * workspace, so a box mounted on a board that closes before its idle
     * wait waits to load until the board opens again.
     */
    open?: boolean;
    /** True while it is this card's turn. */
    playing?: boolean;
    /** The coordinator's turn number. */
    turn?: number;
    /** Fires once, when the scene has drawn its finished picture. */
    onready?: (methodId: string) => void;
    /** Test seam. Defaults to the method's registered scene. */
    loader?: () => Promise<MethodPreviewSceneModule>;
  } = $props();

  const sceneLoader = $derived(loader ?? METHOD_PREVIEW_SCENES[methodId]);

  let box = $state<HTMLElement | null>(null);
  let width = $state(0);
  let height = $state(0);
  let load = $state(false);
  let ready = $state(false);
  // A renderer can report from a promise after the box has gone.
  let destroyed = false;

  const shape = $derived(classifyPreviewShape(width, height));

  // A scene draws for its box. A zero-size report (the board hidden for a
  // moment) keeps the last real size, so a loaded scene is never torn down.
  $effect(() => {
    const node = box;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1]?.contentRect;
      if (!rect) return;
      const nextWidth = Math.floor(rect.width);
      const nextHeight = Math.floor(rect.height);
      if (nextWidth <= 0 || nextHeight <= 0) return;
      width = nextWidth;
      height = nextHeight;
    });
    observer.observe(node);
    return () => observer.disconnect();
  });

  // Scene code stays out of first paint. It loads once the board is idle
  // and any route morph has finished (spec: Performance), and only while
  // the board is open: a method picked during the wait would otherwise load
  // every scene behind its workspace. A loaded scene stays.
  $effect(() => {
    if (!open || load) return;
    return runAfterNamedRouteMorphIdle(() => {
      load = true;
    });
  });

  onDestroy(() => {
    destroyed = true;
  });

  function handleReady(): void {
    if (destroyed || ready) return;
    ready = true;
    onready?.(methodId);
  }
</script>

<span
  class="method-preview"
  bind:this={box}
  inert
  aria-hidden="true"
  style:--method-color={color}
>
  <DualSourceCrossfade active={ready ? "second" : "first"}>
    {#snippet first()}
      <span class="tint"></span>
    {/snippet}
    {#snippet second()}
      {#if sceneLoader && width > 0 && height > 0}
        <LazyMount
          loader={sceneLoader}
          active={load}
          debugName={`create method preview ${methodId}`}
          props={{
            playing: playing && ready,
            turn,
            shape,
            width,
            height,
            accent: color,
            onready: handleReady,
          }}
        />
      {/if}
    {/snippet}
  </DualSourceCrossfade>
</span>

<style>
  .method-preview {
    position: absolute;
    inset: 0;
    display: block;
    overflow: hidden;
    border-radius: inherit;
    container-type: size;
  }

  .tint {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--method-color) 14%, transparent);
  }
</style>
