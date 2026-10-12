---
paths:
  - "src/**/*.svelte"
---

# Crossfade Routing Contract

Canonical owners:

```svelte
<Crossfade key={discriminator} duration={DURATION.normal} mode="crossfade">
  {content for the current key}
</Crossfade>
```

- Cheap mutually exclusive content uses `Crossfade` from
  `#lib/shared/transitions/motion.js` (the `@austencloud/motion` component).
- Materially different natural heights add `animateHeight`; a sized parent uses
  `fill`.
- Heavy or stateful sources that must stay mounted use
  `src/lib/shared/components/DualSourceCrossfade.svelte` and switch only when the
  hidden source is ready.
- Sequential decision screens use the primitive's supported swap/step mode.
- A single element entering or leaving is not a crossfade; use the shared
  presence transition instead.

Keep unchanged content outside the keyed region. Use `DURATION` tokens and the
primitive's reduced-motion behavior; do not reproduce stacking, timers, easing,
or reduced-motion logic in the consumer. `CellRenderer` retains its specialized
bitmap/URL owner.

Verify every key, interruption behavior, layout stability, and reduced motion.
If content or neighbors move unexpectedly, choose the correct sizing mode before
shipping.
