<script lang="ts">
  /**
   * The one dot that says which prop wears an effect: 6px, round, in that
   * hand's colour (the colours the Both / Left / Right row uses) with a 1px
   * dark outline. It fades on the same fast transition as a lit tile, so it
   * arrives and leaves when the two props start or stop differing. The parent
   * places it; it is never a number, a ring or a filled disc.
   */
  const {
    hand,
    visible = true,
  }: {
    hand: "left" | "right";
    visible?: boolean;
  } = $props();
</script>

<span
  class="hand-dot"
  class:left={hand === "left"}
  class:right={hand === "right"}
  class:visible
  aria-hidden="true"
  data-hand-dot={hand}
></span>

<style>
  .hand-dot {
    display: block;
    flex: none;
    box-sizing: border-box;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    opacity: 0;
    pointer-events: none;
    /* The 1px dark outline sits outside the 6px dot, so it reads on a lit
       tile's tint and on the dark card alike. */
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
    transition: opacity var(--duration-fast) var(--ease-standard);
  }

  .hand-dot.visible {
    opacity: 1;
  }

  .hand-dot.left {
    background: var(--dm-motion-blue, #3575e2);
  }

  .hand-dot.right {
    background: var(--dm-motion-red, #ed1c24);
  }

  @media (prefers-reduced-motion: reduce) {
    .hand-dot {
      transition: none;
    }
  }
</style>
