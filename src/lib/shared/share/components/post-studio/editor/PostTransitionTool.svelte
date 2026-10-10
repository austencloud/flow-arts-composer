<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { PostItem } from "#lib/shared/media-composition/domain/post-project.js";
  import { itemEnd } from "#lib/shared/media-composition/domain/post-project.js";
  import { updateItem } from "#lib/shared/media-composition/domain/post-project-edits.js";
  import type { PostEditorState } from "#lib/shared/media-composition/state/post-editor-state.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";

  let {
    editor,
    outgoing,
    incoming,
  }: {
    editor: PostEditorState;
    outgoing: PostItem;
    incoming: PostItem;
  } = $props();

  type TransitionChoice = "cut" | "crossfade" | "fade-black";
  const choice = $derived<TransitionChoice>(
    outgoing.transitionOut?.type ?? "cut"
  );
  const seconds = $derived(outgoing.transitionOut?.duration ?? 1);
  const maxSeconds = $derived(
    Math.max(0.1, Math.min(outgoing.duration, incoming.duration) - 0.001)
  );
  const options = $derived([
    {
      value: "cut" as const,
      label: t("post_transition_cut"),
      icon: "fa-solid fa-scissors",
    },
    {
      value: "crossfade" as const,
      label: t("post_transition_dissolve"),
      icon: "fa-solid fa-right-left",
    },
    {
      value: "fade-black" as const,
      label: t("post_transition_fade_black"),
      icon: "fa-solid fa-circle-half-stroke",
    },
  ]);
  const description = $derived(
    choice === "cut"
      ? t("post_transition_cut_description")
      : choice === "crossfade"
        ? t("post_transition_dissolve_description")
        : t("post_transition_fade_black_description")
  );
  let changeError = $state(false);

  function change(
    next: TransitionChoice,
    duration = seconds,
    continuous = false
  ): void {
    editor.pause();
    const apply: Parameters<PostEditorState["edit"]>[0] = (project, context) =>
      updateItem(
        project,
        outgoing.id,
        {
          transitionOut: next === "cut" ? null : { type: next, duration },
        },
        context
      );
    const changed = continuous
      ? editor.editSetting(`${outgoing.id}:transition-duration`, apply)
      : editor.edit(apply);
    changeError = !changed && next !== choice;
    const current = editor.project.tracks.flatMap((track) => track.items);
    const after = current.find((item) => item.id === outgoing.id);
    const following = current.find((item) => item.id === incoming.id);
    if (after && following) editor.seek((following.start + itemEnd(after)) / 2);
  }

  function preview(): void {
    editor.pause();
    editor.seek(Math.max(outgoing.start, incoming.start - 0.5));
    editor.togglePlayback();
  }
</script>

<div class="transition-tool">
  <SegmentedControl
    {options}
    value={choice}
    onchange={(next) => change(next)}
    columns={1}
    semantics="radiogroup"
    ariaLabel={t("post_editor_transition")}
  />
  <p class="description">{description}</p>
  <ValueSlider
    label={t("post_transition_duration")}
    value={seconds}
    min={0.1}
    max={maxSeconds}
    step={0.05}
    disabled={choice === "cut"}
    format={(value) => `${value.toFixed(2)} s`}
    onchange={(duration) => change(choice, duration, true)}
  />
  <PanelButton variant="secondary" fullWidth onclick={preview}>
    <i class="fa-solid fa-play" aria-hidden="true"></i>
    {t("post_transition_preview")}
  </PanelButton>
  {#if changeError}
    <p class="error" role="status">{t("post_transition_unavailable")}</p>
  {/if}
</div>

<style>
  .transition-tool {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
  .description {
    margin: 0;
    min-height: 2.6em;
    color: var(--theme-text-muted);
    font-size: 0.875rem;
    line-height: 1.3;
  }
  .error {
    margin: 0;
    color: var(--theme-text);
    font-size: 0.875rem;
    line-height: 1.4;
  }
</style>
