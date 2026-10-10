<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { PostSourceGeometry } from "#lib/shared/media-composition/domain/post-project.js";
  import TypeableValue from "#lib/shared/ui/components/TypeableValue.svelte";

  interface Props {
    geometry: PostSourceGeometry;
    output: { width: number; height: number };
    locked: boolean;
    frozen: boolean;
    mode: "position" | "crop";
    onChange: (geometry: PostSourceGeometry, field: string) => void;
  }

  let { geometry, output, locked, frozen, mode, onChange }: Props = $props();

  type RectField = "x" | "y" | "width" | "height";
  type CropField = keyof PostSourceGeometry["crop"];
  const rectFields = $derived([
    { field: "x" as const, label: t("post_editor_box_x") },
    { field: "y" as const, label: t("post_editor_box_y") },
    { field: "width" as const, label: t("post_editor_box_width") },
    { field: "height" as const, label: t("post_editor_box_height") },
  ]);
  const cropFields: { field: CropField; label: string }[] = [
    { field: "left", label: "Left" },
    { field: "top", label: "Top" },
    { field: "right", label: "Right" },
    { field: "bottom", label: "Bottom" },
  ];

  function setRect(field: RectField, pixels: number): void {
    if (!Number.isFinite(pixels)) return;
    const dimension =
      field === "x" || field === "width" ? output.width : output.height;
    const value = pixels / dimension;
    onChange(
      {
        ...geometry,
        [field]:
          field === "width" || field === "height"
            ? Math.max(1 / dimension, value)
            : value,
      },
      field
    );
  }

  function setCrop(field: CropField, percent: number): void {
    if (!Number.isFinite(percent)) return;
    const crop = geometry.crop;
    const gap = 0.0001;
    const low =
      field === "right"
        ? crop.left + gap
        : field === "bottom"
          ? crop.top + gap
          : 0;
    const high =
      field === "left"
        ? crop.right - gap
        : field === "top"
          ? crop.bottom - gap
          : 1;
    onChange(
      {
        ...geometry,
        crop: {
          ...crop,
          [field]: Math.max(low, Math.min(high, percent / 100)),
        },
      },
      `crop-${field}`
    );
  }
</script>

<div class="source-geometry-tool">
  {#if mode === "position"}
    <div class="fields" role="group" aria-label="Media position and size">
      {#each rectFields as entry (entry.field)}
        <span class="name" aria-hidden="true">{entry.label}</span>
        <TypeableValue
          label={entry.label}
          text={`${Math.round(geometry[entry.field] * (entry.field === "x" || entry.field === "width" ? output.width : output.height))} px`}
          disabled={locked || frozen}
          oncommit={(pixels) => setRect(entry.field, pixels)}
        />
      {/each}
      <span class="name" aria-hidden="true">{t("post_editor_box_turn")}</span>
      <TypeableValue
        label={t("post_editor_box_turn")}
        text={`${Number(geometry.rotation.toFixed(1))}°`}
        signed
        disabled={locked || frozen}
        oncommit={(degrees) =>
          Number.isFinite(degrees) &&
          onChange({ ...geometry, rotation: degrees }, "rotation")}
      />
    </div>
  {:else}
    <p class="hint">
      Drag the frame on the video to adjust the visible source. Drag its edges
      to crop precisely.
    </p>
    <div class="fields" role="group" aria-label="Source crop">
      {#each cropFields as entry (entry.field)}
        <span class="name" aria-hidden="true">{entry.label}</span>
        <TypeableValue
          label={entry.label}
          text={`${Number((geometry.crop[entry.field] * 100).toFixed(2))}%`}
          disabled={locked || frozen}
          oncommit={(percent) => setCrop(entry.field, percent)}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .source-geometry-tool {
    display: grid;
    gap: 1rem;
  }
  .fields {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem 0.625rem;
  }
  .name {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
  }
  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
  }
</style>
