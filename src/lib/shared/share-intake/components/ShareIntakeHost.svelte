<script lang="ts">
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { scheduleIntakeRun } from "../services/share-intake-runner";
  import { shareIntakeSignal } from "../state/share-intake-signal.svelte";

  /**
   * The only caller of the share-intake runner.
   *
   * Renders nothing. It exists to be a COMPONENT, because two things this
   * feature needs are only available inside the component tree:
   *
   * 1. A guarantee that the app shell is mounted. This sits beside InboxDrawer
   *    and SequenceViewerDrawerHost in MainApplication, so by the time this
   *    effect runs both of the surfaces routing can open already exist. The
   *    previous revision ran the runner from native-initializer.ts, where
   *    neither did.
   * 2. Reactivity over authState. It is a plain object of getters over a
   *    $state rune (auth-state.svelte.ts) with no subscribe() and no event
   *    emitter, so a $effect is the only way to notice a sign-in - which is
   *    trace 3's resume point.
   *
   * scheduleIntakeRun() coalesces, so the three reasons this effect re-runs
   * (mount, a new share, a sign-in) collapse into one pass over the store.
   */
  $effect(() => {
    // Tracked reads. Each one is a reason to (re)run.
    const tick = shareIntakeSignal.tick;
    const fullAccount = authState.isFullAccount;
    const loading = authState.loading;
    void tick;
    void fullAccount;

    // Routing asks authState whether an image share may proceed. Running
    // before Firebase has reported in would park a signed-in user's share as
    // needs-auth and prompt them to sign in twice.
    if (loading) return;

    void scheduleIntakeRun();
  });
</script>
