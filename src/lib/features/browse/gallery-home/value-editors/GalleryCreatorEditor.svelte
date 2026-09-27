<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import SequencePeek from "$lib/shared/browse/components/SequencePeek.svelte";
  import RobustAvatar from "$lib/shared/components/avatar/RobustAvatar.svelte";
  import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
  import { FAN_TILTS } from "../gallery-drill-catalog.svelte";
  import { valueDisabled } from "../gallery-value-editor";
  import type {
    GalleryValueHeadSnippet,
    GalleryWorkspaceProps,
  } from "../gallery-workspace-types";

  type Props = Pick<
    GalleryWorkspaceProps,
    | "catalog"
    | "drillWidth"
    | "splitPane"
    | "adaptiveValueLayout"
    | "stackHint"
    | "isValueApplied"
    | "onPickValue"
  > & { valueHead: GalleryValueHeadSnippet };

  let {
    catalog,
    drillWidth,
    splitPane = false,
    adaptiveValueLayout,
    stackHint,
    isValueApplied,
    onPickValue,
    valueHead,
  }: Props = $props();

  const paneWideArt = $derived(splitPane && drillWidth >= 620);
</script>

<div class="drill-screen screen-creator">
  {@render valueHead(t("browse_audit_pick_creator"), stackHint)}
  <div class="value-list creator-list">
    {#each catalog.creatorValues as v (v.value)}
      {@const creatorApplied =
        isValueApplied?.(BrowseFilterType.OWNER, v.value) ?? false}
      <button
        class="length-row tall creator-row"
        class:value-applied={creatorApplied}
        type="button"
        aria-label={`${v.value}, ${t(v.count === 1 ? "browse_audit_one_sequence" : "browse_audit_many_sequences", { count: v.count })}`}
        aria-pressed={isValueApplied ? creatorApplied : undefined}
        disabled={valueDisabled(v.count, creatorApplied)}
        onclick={() => onPickValue(BrowseFilterType.OWNER, v.value, v.value)}
      >
        <RobustAvatar
          class="creator-avatar"
          src={catalog.creatorAvatars.get(v.value)?.avatarUrl}
          googleId={catalog.creatorAvatars.get(v.value)?.ownerId}
          name={v.value}
          alt=""
          customSize={paneWideArt
            ? 72
            : adaptiveValueLayout && drillWidth < 640
              ? 36
              : 44}
        />
        <span class="value-main">
          <span class="value-label" title={v.value}>{v.value}</span>
          <span class="density-bar">
            <span
              class="density-fill"
              style:width="{(v.count / catalog.maxCreatorCount) * 100}%"
            ></span>
          </span>
        </span>
        <span class="value-count">{v.count}</span>
        <!-- The creator's own work, not stock art — same peek primitive as
                 the chooser fans, clipped by the row's overflow. -->
        <span class="peek-fan creator-fan" aria-hidden="true">
          {#each catalog.creatorSamples.get(v.value) ?? [] as seq, i (seq.id)}
            <SequencePeek
              sequence={seq}
              width={catalog.PEEK.creatorW}
              height={catalog.PEEK.creatorH}
              tilt={FAN_TILTS[i]}
            />
          {/each}
        </span>
      </button>
    {/each}
  </div>
</div>
