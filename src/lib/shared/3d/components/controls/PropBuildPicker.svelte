<script lang="ts" generics="T extends string">
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { popIn } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import type { PropBuildPreviewOption } from "$lib/shared/pictograph/prop/domain/fan-appearance";

  interface Props {
    label?: string;
    value: T;
    options: readonly PropBuildPreviewOption<T>[];
    onchange: (value: T) => void;
    density?: "primary" | "secondary";
    /** Compact fan rails use measured artwork scaling; ordinary 8:3 pickers
     * keep the source framing so their previews never crop. */
    useImageScale?: boolean;
  }

  let {
    label,
    value,
    options,
    onchange,
    density = "primary",
    useImageScale = false,
  }: Props = $props();

  function moveSelection(event: KeyboardEvent, index: number): void {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % options.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + options.length) % options.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = options.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const option = options[nextIndex];
    if (!option) return;

    onchange(option.id);
    const group = (event.currentTarget as HTMLElement).closest(
      '[role="radiogroup"]'
    );
    const buttons =
      group?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[nextIndex]?.focus();
  }
</script>

<section
  class="picker"
  class:secondary={density === "secondary"}
  class:headingless={!label}
>
  {#if label}
    <div class="picker-heading">
      <span class="picker-label">{label}</span>
    </div>
  {/if}

  <div class="option-grid" role="radiogroup" aria-label={label ?? "Options"}>
    {#each options as option, index (option.id)}
      <button
        type="button"
        class="option"
        class:selected={value === option.id}
        role="radio"
        aria-checked={value === option.id}
        aria-label={option.designCredit
          ? `${option.label}, original design by ${option.designCredit.originator}`
          : option.label}
        title={option.designCredit
          ? `Original design by ${option.designCredit.originator}`
          : undefined}
        tabindex={value === option.id ? 0 : -1}
        onclick={() => onchange(option.id)}
        onkeydown={(event) => moveSelection(event, index)}
      >
        <span class="preview-frame">
          <Crossfade key={option.image} duration={DURATION.normal} fill>
            <img
              src={option.image}
              alt=""
              draggable="false"
              style:--preview-scale={useImageScale
                ? (option.imageScale ?? 1)
                : 1}
            />
          </Crossfade>
        </span>
        <span class="option-label">{option.label}</span>
        {#if value === option.id}
          <span
            class="selected-badge"
            aria-hidden="true"
            transition:popIn={{ duration: DURATION.fast, start: 0.72 }}>✓</span
          >
        {/if}
      </button>
    {/each}
  </div>
</section>

<style>
  /*
    Deliberately NOT a container itself. Container-relative units resolve
    against the nearest ancestor container, so declaring one here would size
    every build card against its own width -- a 600px card and a 300px card
    would both land on the same 14px label. Sizes below ramp against the
    picker as a whole, which is the thing that actually differs between an
    inspector panel and a 4K review deck.
  */
  .picker {
    min-width: 0;
  }

  .picker-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    margin-bottom: 7px;
  }

  .picker-label {
    display: block;
    flex: 0 0 auto;
    color: rgba(255, 255, 255, 0.58);
    /* Ramps with the container instead of stepping at a breakpoint, so a
       3840px review deck and a 300px inspector panel are the same design at
       two sizes rather than two designs. */
    font-size: clamp(12px, 0.5cqi, 18px);
    font-weight: 750;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .option-grid {
    display: grid;
    grid-template-columns: repeat(var(--build-option-count, 3), minmax(0, 1fr));
    gap: clamp(8px, 1.1cqi, 12px);
    min-width: 0;
  }

  .option {
    position: relative;
    isolation: isolate;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    min-width: 0;
    min-height: 44px;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--prop-picker-stroke);
    border-radius: var(--settings-border-radius-lg, 16px);
    background: #070911;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition:
      transform var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      box-shadow var(--duration-fast, 150ms) ease;
  }

  .preview-frame {
    position: relative;
    display: grid;
    place-items: center;
    /* Every render is 640x240, so the frame takes the image's own shape and
       the picture fills the card exactly at any width -- a guessed height
       stranded a small image inside a wide black bar. `width: 100%` is load
       bearing: without a definite width, a min-height would drive the ratio
       backwards and blow the frame out past the card, cropping the render. */
    aspect-ratio: 8 / 3;
    width: 100%;
    overflow: hidden;
    /* Flat, and exactly the colour the renders were captured on. */
    background: #070911;
  }

  /*
    A folded phone in landscape is 960x412: wide, with almost no vertical
    budget, and the host caps its panel around 240px. Full-height previews
    there push the prop grid below the fold of the panel's own scroller, so
    the picture is what yields -- the labels and the grid do not.
  */
  @media (max-height: 560px) {
    .preview-frame {
      aspect-ratio: auto;
      height: 54px;
      min-height: 0;
    }
  }

  .preview-frame img {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
    transform: scale(var(--preview-scale));
    transition: transform var(--duration-fast, 150ms) ease;
  }

  .preview-frame :global(.crossfade) {
    position: absolute;
    inset: 0;
  }

  .option-label {
    z-index: 1;
    display: flex;
    align-items: center;
    min-height: clamp(36px, 1.5cqi, 54px);
    padding: clamp(8px, 0.42cqi, 14px) clamp(12px, 0.62cqi, 22px);
    overflow: hidden;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(3, 4, 9, 0.96);
    font-size: clamp(14px, 0.62cqi, 24px);
    font-weight: 760;
    line-height: 1.2;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition:
      border-color var(--duration-fast, 150ms) ease,
      background var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
  }

  .option.selected {
    border-color: color-mix(in srgb, var(--prop-picker-accent) 82%, white);
    color: #fff;
    box-shadow:
      0 9px 24px color-mix(in srgb, var(--prop-picker-accent) 24%, transparent),
      inset 0 0 0 2px
        color-mix(in srgb, var(--prop-picker-accent) 46%, transparent);
  }

  .option.selected .option-label {
    border-top-color: color-mix(
      in srgb,
      var(--prop-picker-accent) 24%,
      transparent
    );
    background: color-mix(in srgb, var(--prop-picker-accent) 11%, #030409);
  }

  .selected-badge {
    position: absolute;
    top: 9px;
    right: 9px;
    z-index: 2;
    display: grid;
    place-items: center;
    width: clamp(22px, 0.95cqi, 34px);
    height: clamp(22px, 0.95cqi, 34px);
    border: 1px solid color-mix(in srgb, var(--prop-picker-accent) 70%, white);
    border-radius: 50%;
    background: color-mix(in srgb, var(--prop-picker-accent) 82%, #090b13);
    box-shadow: 0 0 14px
      color-mix(in srgb, var(--prop-picker-accent) 74%, transparent);
    color: #fff;
    font-size: clamp(13px, 0.56cqi, 20px);
    font-weight: 900;
    line-height: 1;
  }

  .option:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--prop-picker-accent) 72%, white);
    outline-offset: 2px;
  }

  .option:active {
    transform: translateY(0) scale(0.985);
  }

  @media (hover: hover) and (pointer: fine) {
    .option:hover {
      border-color: color-mix(in srgb, var(--prop-picker-accent) 54%, white);
      transform: translateY(-2px);
    }

    .option:hover img {
      transform: scale(calc(var(--preview-scale) * 1.04));
    }
  }

  .picker.secondary .option-grid {
    --build-option-count: 2;
  }

  /* Modifiers are deliberately quieter than the primary build choice. The
     check stays unambiguous, but the card no longer competes with Build for
     the strongest accent treatment. */
  .picker.secondary .option.selected {
    border-color: color-mix(in srgb, var(--prop-picker-accent) 44%, white);
    box-shadow:
      0 6px 18px color-mix(in srgb, var(--prop-picker-accent) 14%, transparent),
      inset 0 0 0 1px
        color-mix(in srgb, var(--prop-picker-accent) 28%, transparent);
  }

  .picker.secondary .option.selected .option-label {
    border-top-color: color-mix(
      in srgb,
      var(--prop-picker-accent) 16%,
      transparent
    );
    background: color-mix(in srgb, var(--prop-picker-accent) 6%, #030409);
  }

  .picker.secondary .selected-badge {
    width: clamp(19px, 0.78cqi, 28px);
    height: clamp(19px, 0.78cqi, 28px);
    border-color: color-mix(in srgb, var(--prop-picker-accent) 42%, white);
    background: color-mix(in srgb, var(--prop-picker-accent) 46%, #090b13);
    box-shadow: 0 0 9px
      color-mix(in srgb, var(--prop-picker-accent) 34%, transparent);
    font-size: clamp(11px, 0.46cqi, 16px);
  }

  @media (prefers-reduced-motion: reduce) {
    .option,
    .option-label,
    .preview-frame img {
      transition: none;
    }
  }
</style>
