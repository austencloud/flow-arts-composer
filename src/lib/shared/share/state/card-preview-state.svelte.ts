/**
 * The rendered choreo card a surface previews, posts, or composes with.
 *
 * Extracted from PostShareSheet when Post Studio moved into the sequence
 * viewer and needed the same picture. Both surfaces have to show the card the
 * user is actually looking at — same composition settings, same visibility
 * flags — so the blob, its cache key, and the observer plumbing that makes the
 * whole thing reactive live here rather than in each host.
 *
 * Must be constructed during component init: it registers observers with
 * `onDestroy` and owns an `$effect`.
 */

import { onDestroy } from "svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";
import { getSharer } from "$lib/shared/share/get-sharer";
import { buildCardRenderOptions } from "$lib/shared/share/services/card-render-options";
import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
import { getVisibilityStateManager } from "$lib/shared/pictograph/shared/state/visibility-state.svelte";
import type { CardPresentation } from "$lib/shared/share/domain/models/card-presentation";
import { buildCardPreviewRenderKey } from "$lib/shared/share/state/card-preview-render-key";
import { canonicalJSON } from "$lib/shared/foundation/utils/canonical-json";
import { hashString } from "$lib/shared/foundation/services/content-hasher";

interface CardPreviewInputs {
  /** The sequence to draw. Null suspends rendering. */
  getSequence: () => SequenceData | null | undefined;
  /** False suspends rendering, so a surface that never opens never pays it. */
  getEnabled: () => boolean;
  /** Keep the live request visible while its host resolves geometry/paints. */
  getRenderEnabled?: () => boolean;
  /**
   * The dark-mode flag the ON-SCREEN card preview is using. Not the
   * composition manager's own copy — the file has to match the card the user
   * was looking at when they pressed the button.
   */
  getDarkMode: () => boolean;
  getResolvedAutoLayout: () => ResolvedAutoLayout | null;
  /** Current card or one-share footer override. */
  getCardPresentation?: () => CardPresentation | undefined;
  onError?: (error: unknown) => void;
}

export interface CardPreviewRequest {
  sequence: SequenceData;
  options: Partial<SequenceExportOptions>;
  revision: string;
  sourceRevision: string;
}

interface CardRenderRequest extends CardPreviewRequest {
  darkMode: boolean;
  resolvedAutoLayout: ResolvedAutoLayout | null;
  cardPresentation: CardPresentation | undefined;
  identity: string;
}

export function createCardPreviewState(inputs: CardPreviewInputs) {
  /**
   * Neither the card-composition manager nor the visibility manager is
   * rune-backed — both publish through observer callbacks — so reading them
   * inside an effect subscribes to nothing at all. Without this counter a
   * settings change never redraws the card, which is the one thing these
   * surfaces have to get right. ExportImagePanel carries the same counter.
   */
  const composition = getImageCompositionManager();
  const visibility = getVisibilityStateManager();
  let settingsVersion = $state(0);
  function onCardSettingsChanged(): void {
    settingsVersion++;
  }
  composition.registerObserver(onCardSettingsChanged);
  visibility.registerObserver(onCardSettingsChanged, ["all"]);

  let blob = $state<Blob | null>(null);
  let url = $state<string | null>(null);
  let renderedOptions = $state<Partial<SequenceExportOptions> | null>(null);
  let renderedIdentity = $state<string | null>(null);
  let failedIdentity = $state<string | null>(null);
  let resetVersion = $state(0);

  const requestedRender = $derived.by((): CardRenderRequest | null => {
    // Reading this makes observer-backed composition and visibility changes
    // visible to the derived request as soon as their observers publish.
    void settingsVersion;
    void resetVersion;

    const liveTarget = inputs.getSequence();
    if (!inputs.getEnabled() || !liveTarget) return null;

    // Keep the object the asynchronous renderer receives tied to this exact
    // identity. Without a snapshot, an in-place edit can change the live
    // object after its identity was stamped but before Sharer reads it.
    const target = $state.snapshot(liveTarget) as SequenceData;

    const darkMode = inputs.getDarkMode();
    const resolvedAutoLayout = inputs.getResolvedAutoLayout();
    const cardPresentation = inputs.getCardPresentation?.();
    const options = $state.snapshot(
      buildCardRenderOptions(target, {
        darkMode,
        isHandPath:
          target.sequenceKind === "hand-path" ||
          !!target.metadata?.isHandPathVisualization,
        resolvedAutoLayout,
        cardPresentation,
      })
    );
    const settingsKey = buildCardPreviewRenderKey(
      options,
      visibility.getState()
    );

    const source = canonicalJSON(target);
    const identity = `${source}|${settingsKey}|${resetVersion}`;
    return {
      sequence: target,
      darkMode,
      resolvedAutoLayout,
      cardPresentation,
      options,
      // A sequence can be edited in place while retaining its id and object
      // reference. The file must follow its content, not either shortcut.
      identity,
      revision: hashString(identity),
      sourceRevision: hashString(source),
    };
  });

  function clearArtifact(): void {
    if (url) URL.revokeObjectURL(url);
    blob = null;
    url = null;
    renderedOptions = null;
    renderedIdentity = null;
  }

  $effect(() => {
    const request = requestedRender;
    if (!request || request.identity === renderedIdentity) return;
    if (inputs.getRenderEnabled?.() === false) return;

    // A retry after re-opening or reset should announce preparation again.
    failedIdentity = null;

    let stale = false;

    void (async () => {
      try {
        const rendered = await getSharer().getCardImageBlob(request.sequence, {
          darkMode: request.darkMode,
          resolvedAutoLayout: request.resolvedAutoLayout,
          cardPresentation: request.cardPresentation,
          resolvedRenderOptions: request.options,
        });
        // A render may finish between an input change and the effect cleanup.
        // Check the live request too, so that small window cannot put the
        // previous card back into a newly selected sequence.
        if (stale || requestedRender?.identity !== request.identity) return;
        clearArtifact();
        blob = rendered;
        url = URL.createObjectURL(rendered);
        renderedOptions = request.options;
        renderedIdentity = request.identity;
        failedIdentity = null;
      } catch (error) {
        console.error("[cardPreview] Card render failed:", error);
        if (!stale && requestedRender?.identity === request.identity) {
          failedIdentity = request.identity;
          inputs.onError?.(error);
        }
      }
    })();

    return () => {
      stale = true;
    };
  });

  onDestroy(() => {
    composition.unregisterObserver(onCardSettingsChanged);
    visibility.unregisterObserver(onCardSettingsChanged);
    clearArtifact();
  });

  return {
    /** The current live presentation exists before its downloadable PNG. */
    get request(): CardPreviewRequest | null {
      return requestedRender;
    },
    get hasError() {
      return (
        requestedRender !== null && requestedRender.identity === failedIdentity
      );
    },
    get blob() {
      return requestedRender?.identity === renderedIdentity ? blob : null;
    },
    get url() {
      return requestedRender?.identity === renderedIdentity ? url : null;
    },
    /** The options the card was drawn with, for surfaces that re-render it. */
    get renderOptions() {
      return requestedRender?.identity === renderedIdentity
        ? renderedOptions
        : null;
    },
    get isPreparing() {
      return (
        requestedRender !== null &&
        requestedRender.identity !== renderedIdentity &&
        requestedRender.identity !== failedIdentity
      );
    },
    /**
     * Identity of the settings the blob in hand was drawn from. Surfaces that
     * describe the artifact to something else (a post draft's crop revision)
     * key on this so a re-render is visible downstream.
     */
    get revision() {
      return requestedRender?.identity === renderedIdentity
        ? requestedRender.revision
        : null;
    },
    /** Bumps when a card setting changes. Exposed for hosts keying their own work. */
    get settingsVersion() {
      return settingsVersion;
    },
    /** Drops the cached blob so the next run re-renders. */
    reset(): void {
      resetVersion++;
      failedIdentity = null;
      clearArtifact();
    },
  };
}

export type CardPreviewState = ReturnType<typeof createCardPreviewState>;
