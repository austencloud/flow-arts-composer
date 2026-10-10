<script lang="ts">
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { buildCanonicalCardVisibility } from "#lib/features/choreo-card/domain/canonical-card-visibility.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { generateSequenceRoutePath } from "#lib/shared/navigation/services/sequence-encoder.js";
  import { getUrlQRCodeGenerator } from "#lib/shared/qr/get-qr-code-generator.js";
  import { getSequenceRenderer } from "#lib/shared/render/get-sequence-renderer.js";

  let {
    sequence,
    onReady,
    onError,
  }: {
    sequence: SequenceData;
    onReady?: () => void;
    onError?: () => void;
  } = $props();

  let imageUrl = $state<string>();

  $effect(() => {
    const snapshot = sequence;
    const controller = new AbortController();
    let ownedUrl: string | undefined;
    imageUrl = undefined;

    void (async () => {
      const visibility = buildCanonicalCardVisibility({
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
      });
      // Self-contained playback link: the landing demo needs no account or
      // short-code allocation, and scans also work outside this preview host.
      const qrUrl = `https://tkaflowarts.com${generateSequenceRoutePath(snapshot)}`;
      const qrImage = await getUrlQRCodeGenerator().generateUrlAsImage(
        qrUrl,
        240
      );
      if (controller.signal.aborted) return;

      // Render at print resolution, then scale the entire artifact together.
      // Viewer header minimums must not change a miniature card's proportions.
      const blob = await getSequenceRenderer().renderSequenceToBlob(
        snapshot,
        {
          ...visibility,
          visibilityOverrides: {
            ...visibility.visibilityOverrides,
            showMandala: true,
          },
          includeStartPlacement: true,
          startPlacementLayout: "row",
          columnCount: 4,
          stepSize: 240,
          cardMode: true,
          showNotes: false,
          leftPropTypeOverride: PropType.STAFF,
          rightPropTypeOverride: PropType.STAFF,
          qrImageBitmap: qrImage,
          format: "WebP",
          quality: 0.95,
        },
        undefined,
        controller.signal
      );
      if (controller.signal.aborted) return;
      ownedUrl = URL.createObjectURL(blob);
      imageUrl = ownedUrl;
    })().catch((error: unknown) => {
      if (!controller.signal.aborted) {
        console.error("[ChoreoCardPreview] Card render failed", error);
        onError?.();
      }
    });

    return () => {
      controller.abort();
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  });
</script>

{#if imageUrl}
  <img
    src={imageUrl}
    alt=""
    width="960"
    height="1344"
    decoding="async"
    onload={() => onReady?.()}
  />
{/if}

<style>
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
</style>
