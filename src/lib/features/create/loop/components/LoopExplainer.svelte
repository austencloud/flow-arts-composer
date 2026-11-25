<!-- LoopExplainer - "What is a LOOP?" Opens by itself on a first visit and
     behind the question mark after that. -->
<script lang="ts">
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getLoopBuilderContext } from "../context/loop-builder-context";
  import LoopLesson from "./LoopLesson.svelte";

  const { state: loop } = getLoopBuilderContext();
</script>

<BaseModal
  open={loop.explaining}
  onclose={loop.closeExplainer}
  size="fit"
  labelledBy="loop-explain-dialog-title"
>
  {#snippet header()}
    <ModalHeader
      id="loop-explain-dialog-title"
      title={t("create_loop_explain_title")}
      iconColor="var(--loop-tab)"
      onClose={loop.closeExplainer}
    />
  {/snippet}
  <div class="dialog-body">
    <div class="dialog-room"><LoopLesson /></div>
    <p class="stands">{t("create_loop_explain_stands")}</p>
    <button type="button" class="go" onclick={loop.closeExplainer}>
      <i class="fas fa-repeat" aria-hidden="true"></i>
      <span>{t("create_loop_explain_go")}</span>
    </button>
  </div>
</BaseModal>

<style>
  .go {
    display: inline-flex;
    align-self: center;
    align-items: center;
    gap: 0.5rem;
    height: 2.75rem;
    padding: 0 1.5rem;
    border: 1px solid color-mix(in srgb, var(--loop-tab) 60%, transparent);
    border-radius: 1.375rem;
    background: color-mix(in srgb, var(--loop-tab) 25%, transparent);
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-base, 16px);
    font-weight: 600;
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-out);
  }

  .go i {
    color: var(--loop-tab);
  }

  .go:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (hover: hover) {
    .go:hover {
      background: color-mix(in srgb, var(--loop-tab) 35%, transparent);
    }
  }

  .dialog-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.25rem 1.25rem 1.5rem;
  }

  .dialog-room {
    height: min(28rem, 56dvh);
  }

  .stands {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    text-align: center;
    text-wrap: balance;
  }
</style>
