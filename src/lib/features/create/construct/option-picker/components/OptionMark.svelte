<!-- OptionMark - points out a step that does what the tab around the list is
     asking for: a ring round the tile and a round badge in its corner, small
     enough to leave the arrows alone. It takes no taps. -->
<script lang="ts">
  import { opaqueFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { OptionMarkLook } from "../context/option-mark-context";

  let { mark }: { mark: OptionMarkLook | null } = $props();
</script>

{#if mark}
  <span
    class="option-mark"
    style:--mark-color={mark.color}
    style:--mark-on={mark.on}
    aria-hidden="true"
    transition:opaqueFade={{ duration: DURATION.normal }}
  >
    <span class="badge"><i class="fas {mark.icon}"></i></span>
  </span>
{/if}

<style>
  .option-mark {
    position: absolute;
    inset: 0;
    z-index: 2;
    box-sizing: border-box;
    border: 1.5px solid var(--mark-color);
    border-radius: inherit;
    container-type: inline-size;
    pointer-events: none;
  }

  .badge {
    position: absolute;
    top: clamp(0px, 2cqw, 3px);
    inset-inline-end: clamp(0px, 2cqw, 3px);
    display: grid;
    width: clamp(12px, 22cqw, 24px);
    aspect-ratio: 1;
    place-items: center;
    border-radius: 50%;
    background: var(--mark-color);
    color: var(--mark-on);
    font-size: min(12cqw, var(--font-size-compact, 12px));
  }
</style>
