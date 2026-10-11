<script lang="ts">
  /**
   * One motif station with its own isolated effects config.
   *
   * Every effect in EffectsLayer gates on the effects-config CONTEXT
   * (`config.tipEffectMap["*"].effect`), not on the tipEffectMap prop, so six
   * stations showing six different effects need six separate config states.
   *
   * persist:false keeps this harness out of the shared tka_effects_config key.
   */
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import TelekineticFormation3D from "#lib/features/museum/components/game/TelekineticFormation3D.svelte";

  interface Props {
    stationId: string;
    worldX: number;
    worldZ: number;
    sequenceId: string;
    effectId: string;
    showProps: boolean;
    playing: boolean;
  }
  const props: Props = $props();

  /**
   * The context supplies the per-effect INTENT parameters only. It must not
   * carry the selection: the effect id travels down the prop channel
   * (effectId → CovenStation → EffectOrchestrator3D → EffectsLayer.activeEffects).
   *
   * There used to be an $effect here calling setTipEffectMap. It read and wrote
   * the same state and looped until Svelte threw effect_update_depth_exceeded,
   * which tore down the component tree and left the stations blank. It was also
   * redundant once the 3D layer stopped gating on this context.
   */
  const effectsState = createEffectsConfigState(undefined, { persist: false });
  setEffectsConfigContext(effectsState);
</script>

<TelekineticFormation3D
  stationId={props.stationId}
  worldX={props.worldX}
  worldZ={props.worldZ}
  sequenceId={props.sequenceId}
  presentation="sculpture"
  effectId={props.effectId}
  showProps={props.showProps}
  autoPlay={props.playing}
/>
