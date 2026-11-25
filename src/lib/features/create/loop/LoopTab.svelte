<script lang="ts">
  /**
   * LOOP tab root. The tab is Construct with a LOOP goal on top: Construct's
   * own sequence, pickers, step editor, undo and Play, with a bar that names
   * the kind of LOOP, says whether the steps can become it, and makes it.
   */
  import { browser } from "$app/env";
  import { getCreateModuleContext } from "#lib/features/create/shared/context/create-module-context.js";
  import { UndoOperationType } from "#lib/features/create/shared/services/undo-manager.js";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { Period } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
  import type { LoopGoalDisplay } from "#lib/shared/create/domain/loop-goal-display.js";
  import { onDestroy, type Snippet } from "svelte";
  import LoopWorkbench from "./components/LoopWorkbench.svelte";
  import { setLoopBuilderContext } from "./context/loop-builder-context";
  import { loopFamily, loopFamilyIcon } from "./domain/loop-families";
  import { getLoopStepWorkshop } from "./get-loop-step-workshop";
  import { createLoopTabMemory } from "./services/loop-tab-memory";
  import {
    createLoopGoalState,
    type LoopGoalState,
  } from "./state/loop-goal-state.svelte";

  let {
    tools,
  }: {
    tools: Snippet<
      [((option: PictographData) => boolean) | undefined, boolean]
    >;
  } = $props();

  const { CreateModuleState: createModuleState, panelState } =
    getCreateModuleContext();

  /** What the step grid shows of the LOOP being built. */
  function goalOnGrid(loop: LoopGoalState): LoopGoalDisplay {
    const pending = $derived.by(() => {
      if (loop.stepCount === 0 || loop.made) return null;
      const info = loopFamily(loop.family);
      const ready = loop.stage === "ready";
      const quarter = ready && loop.variant?.period === Period.QUARTERED;
      return {
        count: loop.stepCount,
        steps: loop.nextPart,
        ready,
        color: info.ink,
        ink: info.ink,
        icon: loopFamilyIcon(loop.family, ready ? loop.variant : null),
        label: t("create_loop_repeat_row"),
        times: quarter ? 3 : 1,
      };
    });
    return {
      get pending() {
        return pending;
      },
      get partLength() {
        return loop.made?.partLength ?? null;
      },
    };
  }

  function init(): "ready" | "waiting" | "failed" {
    if (!browser) return "waiting";
    try {
      const workshop = getLoopStepWorkshop();
      // Looked up on every use: Construct's state can arrive after this tab.
      const shared = () => createModuleState.getSequenceStateForTab("loop");
      const state = createLoopGoalState({
        workshop,
        memory: createLoopTabMemory(),
        source: {
          get sequence() {
            return shared().currentSequence;
          },
          apply(next) {
            const sequenceState = shared();
            createModuleState.pushUndoSnapshotForSequenceState(
              UndoOperationType.EXTEND_SEQUENCE,
              sequenceState
            );
            sequenceState.setCurrentSequence(next);
          },
          replace(next) {
            shared().setCurrentSequence(next);
          },
        },
        onFailure(_what, error) {
          showToast(t("create_loop_cannot_make"), error ? "error" : "info");
          if (error) console.error("[LOOP tab]", error);
        },
      });
      setLoopBuilderContext({ state, workshop });
      panelState.setLoopGoal(goalOnGrid(state));
      return "ready";
    } catch (err) {
      const failure = err instanceof Error ? err : new Error(String(err));
      getErrorHandler().showUserError({
        message: t("create_loop_start_failed"),
        technicalDetails: failure.message,
        error: failure,
        severity: "error",
        context: { module: "create", tab: "loop", action: "initialize" },
      });
      return "failed";
    }
  }

  const status = init();
  onDestroy(() => panelState.setLoopGoal(null));
</script>

{#if status === "ready"}
  <LoopWorkbench {tools} />
{:else if status === "failed"}
  <p class="failed" role="alert">{t("create_loop_start_failed")}</p>
{/if}

<style>
  .failed {
    display: grid;
    height: 100%;
    margin: 0;
    padding: 1.5rem;
    place-items: center;
    color: var(--theme-text-dim);
    text-align: center;
  }
</style>
