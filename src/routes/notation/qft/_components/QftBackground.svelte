<script lang="ts">
  type BackgroundHostComponent =
    (typeof import("#lib/shared/background/shared/components/BackgroundHost.svelte"))["default"];

  let liveBackground = $state<BackgroundHostComponent | null>(null);

  $effect(() => {
    let mounted = true;
    const frame = requestAnimationFrame(() => {
      void import("#lib/shared/background/shared/components/BackgroundHost.svelte").then(
        ({ default: BackgroundHost }) => {
          if (mounted) liveBackground = BackgroundHost;
        }
      );
      void Promise.all([
        import("#lib/shared/settings/utils/background-theme-calculator.js"),
        import("@austencloud/backgrounds"),
      ]).then(([{ applyThemeForBackground }, { BackgroundType }]) => {
        if (mounted) applyThemeForBackground(BackgroundType.COSMIC);
      });
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(frame);
    };
  });
</script>

<div class="cosmos" aria-hidden="true">
  {#if liveBackground}
    {@const Background = liveBackground}
    <Background />
  {/if}
</div>

<style>
  .cosmos {
    position: fixed;
    inset: 0;
    z-index: 0;
    background:
      radial-gradient(
        ellipse at 50% 0%,
        rgb(46 26 84 / 0.55) 0%,
        transparent 60%
      ),
      linear-gradient(180deg, #0b0a1a 0%, #10142e 45%, #0a1024 100%);
  }
</style>
