<!-- Owns the artifact, caption, and destination handoff for every sequence
     viewer. Rendering stays asynchronous, and fixed preview/status geometry
     prevents state changes from moving the sheet. -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onDestroy, tick, untrack, type Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import ShareSheetFrame from "./ShareSheetFrame.svelte";
  import {
    getExportOptionsState,
    type VideoFps,
    type VideoResolution,
    type VideoQuality,
  } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import InstagramIcon from "#lib/shared/auth/components/icons/InstagramIcon.svelte";
  import FacebookIcon from "#lib/shared/auth/components/icons/FacebookIcon.svelte";
  import InstagramPostReview from "#lib/shared/share/components/instagram/InstagramPostReview.svelte";
  import { createPostDeliveryState } from "#lib/shared/share/state/post-delivery-state.svelte.js";
  import { setPostDeliveryContext } from "#lib/shared/share/context/post-delivery-context.js";
  import { hasDecodableAudioTrack } from "@austencloud/video-editor/render";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { ResolvedAutoLayout } from "#lib/shared/render/services/container-aware-layout.js";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import { deriveWord } from "#lib/shared/foundation/services/word-deriver.js";
  import { getVideoUploader } from "#lib/shared/share/get-video-uploader.js";
  import { getQRCodeGenerator } from "#lib/shared/qr/get-qr-code-generator.js";
  import { getShortCodeManager } from "#lib/shared/qr/get-short-code-manager.js";
  import { getCaptionPresetManager } from "#lib/shared/share/state/caption-presets.svelte.js";
  import { createCardPreviewState } from "#lib/shared/share/state/card-preview-state.svelte.js";
  import LiveExportCard from "#lib/shared/share/components/LiveExportCard.svelte";
  import { isCardLayoutAutomatic } from "#lib/shared/share/services/card-render-options.js";
  import { createPostShareDraftState } from "#lib/shared/share/state/post-share-draft-state.svelte.js";
  import ExportImagePanel from "#lib/shared/sequence-viewer/components/ExportImagePanel.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import {
    cardPresentationFromFooterSettings,
    type CardPresentation,
  } from "#lib/shared/share/domain/models/card-presentation.js";
  import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
  import { VIEWER_STATE_PARAM_NAMES } from "#lib/shared/sequence-viewer/services/viewer-url-state-codec.js";
  import {
    buildArtifactFilename,
    buildPostLink,
    copyLink,
    copyPreparedLink,
    copyCaption,
    copyImageAndOpenFacebook,
    downloadArtifact,
    isPostLink,
    resolveDestinations,
    shareArtifactNatively,
    type HandoffDestinationId,
    type HandoffResult,
    type ShareArtifact,
  } from "#lib/shared/share/services/post-handoff.js";
  import { getUser } from "#lib/shared/auth/state/auth-state.svelte.js";
  import {
    planFileRequest,
    pendingVideoDownloadOutcome,
    videoDownloadSettingsKey,
  } from "#lib/shared/share/domain/video-download-intent.js";
  import { pendingCardDownloadOutcome } from "#lib/shared/share/domain/card-download-intent.js";
  import {
    VIDEO_OPENER_OPTIONS,
    openerAddsHold,
    openerCoverOffsetMs,
    type VideoOpener,
    type VideoRenderRequest,
  } from "#lib/shared/share/domain/video-opener.js";
  import {
    connectMetaAccount,
    disconnectMetaAccount,
    publishToMeta,
    selectFacebookPage,
    subscribeMetaPublishStatus,
    toInstagramJpeg,
    EMPTY_META_PUBLISH_STATUS,
    META_POSTING_ENABLED,
    MetaPublishClientError,
    type MetaPublishStatus,
    type MetaPublishTarget,
  } from "#lib/shared/share/services/meta-publish.js";

  interface Props {
    isOpen: boolean;
    sequence: SequenceData | null;
    /** Ignored for captions unless already in the canonical post-link form. */
    shareUrl: string;
    videoBlobUrl: string | null;
    isExportingVideo: boolean;
    exportProgress: number | null;
    /** `false` means no render started, so the sheet must stop waiting. The
     * request carries the chosen opener image so the render opens on it. */
    onRequestVideo?: (
      request?: VideoRenderRequest
    ) => void | boolean | Promise<boolean>;
    /** Stops the same export source that `onRequestVideo` started. */
    onCancelVideo?: () => void;
    /** Hosts retire an unrelated old video only when this share prepares video. */
    onPrepareFile?: (artifact: ShareArtifact) => boolean | void;
    onClose: () => void;
    /** Visual-test seam for connection states normally supplied by Firestore. */
    metaStatusOverride?: MetaPublishStatus;
    /** Omitted by hosts without an inbox. */
    onSendInTka?: () => void;
    /** The take-it-home gate: guests may set everything up, but a file leaves
     * only with a free account. The host decides; the sheet says so before the
     * click instead of starting a render that the viewer then refuses. */
    needsAccountForFiles?: boolean;
    /** Opens the host's sign-up path once the sheet has closed. */
    onRequestAccount?: () => void;
    /** Labels view-specific renders such as Mandala or Tunnel. */
    videoLabel?: string;
    /** A host-owned current-view capture. It is only presentation: exports still
     * use the existing video callback and never mount another animation engine. */
    captureAnimationPreview?: () => string;
    /** The image a shared clip opens with, per choice. Omitted by hosts whose
     * render cannot open on a chosen image; the "Opens with" row is then hidden. */
    captureVideoOpener?: (kind: VideoOpener) => Promise<string>;
    /** Cinema is meaningful only for the 3D exporter. */
    is3DExport?: boolean;
    videoSourceKey?: string;
    initialArtifact?: ShareArtifact;
    /** The host advertises only artifacts it can actually produce. */
    availableArtifacts?: readonly ShareArtifact[];
    /** Current Card-tab presentation; the sheet clones it into one share draft. */
    initialCardPresentation?: CardPresentation;
    /** Omitted when the sequence is not an owned saved Library record. */
    onSaveCardPresentation?: (
      value: CardPresentation
    ) => boolean | Promise<boolean>;
    /** Reuses the live card's resolved auto-layout so the exported image matches. */
    resolvedCardAutoLayout?: ResolvedAutoLayout | null;
    /** Omitted when the host cannot switch its viewer body to Post Studio. */
    onOpenPostStudio?: () => void;
    /** The host's own animation export: its Export page beside the live
     * stage. When present, an animation download leaves the sheet for it
     * instead of preparing a render behind a frozen capture here. */
    onOpenVideoExport?: () => void;
    /** False for local-only guest flows that cannot mint an account-owned link. */
    canCreateLink?: boolean;
    /** A host with its own share surface (the viewer's share panel) enters
     * file preparation or publishing directly, with no chooser to go back to. */
    initialEntry?: "chooser" | "download" | "publish";
    /** A host-owned animation stage shown before its encoded video is ready. */
    liveVideoPreview?: Snippet;
    /** Hide controls when the host owns a fixed video format. */
    videoSettingsAvailable?: boolean;
  }

  let {
    isOpen,
    sequence,
    shareUrl,
    videoBlobUrl,
    isExportingVideo,
    exportProgress,
    onRequestVideo = () => false,
    onCancelVideo,
    onPrepareFile,
    onClose,
    metaStatusOverride,
    onSendInTka,
    needsAccountForFiles = false,
    onRequestAccount,
    videoLabel,
    captureAnimationPreview = () => "",
    captureVideoOpener,
    is3DExport = false,
    videoSourceKey = "",
    initialArtifact = "card",
    availableArtifacts = ["card", "video"],
    initialCardPresentation,
    onSaveCardPresentation,
    resolvedCardAutoLayout = null,
    onOpenPostStudio,
    onOpenVideoExport,
    canCreateLink = true,
    initialEntry = "chooser",
    liveVideoPreview,
    videoSettingsAvailable = true,
  }: Props = $props();

  const postDeliveryState = createPostDeliveryState({
    draft: {
      schemaVersion: 1,
      id: "local-instagram-draft",
      ownerId: "local-preview",
      sourceSequenceId: null,
      recipeId: null,
      format: "image",
      items: [
        {
          id: "local-media",
          artifactRevisionId: "local-artifact",
          order: 0,
          altText: null,
          cropPreviewRevision: "local-crop",
        },
      ],
      caption: "",
      instagram: {
        shareToFeed: null,
        cover: null,
        originalAudioName: null,
        attachedAudio: null,
        trial: null,
        collaborators: [],
        userTags: [],
        locationId: null,
        productTags: [],
        aiGenerated: null,
        paidPartnership: false,
        sponsorIds: [],
      },
      delivery: { mode: "handoff" },
      selectedAccountId: null,
      capabilitySnapshotId: null,
      createdAt: 0,
      updatedAt: 0,
    },
    capabilitySnapshot: null,
  });
  setPostDeliveryContext({ state: postDeliveryState });

  const captions = getCaptionPresetManager();
  const exportOptions = getExportOptionsState();

  const glyphHeight = 22;

  const shareDraft = createPostShareDraftState();
  const artifact = $derived(shareDraft.artifact);
  const caption = $derived(shareDraft.caption);
  const captionTouched = $derived(shareDraft.captionTouched);
  const imageComposition = getImageCompositionManager();
  /** Hosts name view-specific renders such as Mandala; the rest are Video. */
  const resolvedVideoLabel = $derived(videoLabel ?? t("share_video"));
  const artifactOptions = $derived(
    shareDraft.availableArtifacts.map((value) => ({
      value,
      label: value === "card" ? t("share_card") : resolvedVideoLabel,
    }))
  );
  let presetsOpen = $state(false);
  /** Opening Share must not spend a render on a link or sequence handoff. */
  let filePreparationOpen = $state(false);
  type ShareRoute = "home" | "download" | "publish";
  let shareRoute = $state<ShareRoute>("home");
  let pendingDownload = $state(false);
  let pendingDownloadVersion = $state<number | null>(null);
  let pendingDownloadSettingsKey = $state<string | null>(null);
  let pendingDownloadSourceKey = $state<string | null>(null);
  let animationPreviewUrl = $state<string | null>(null);
  /** Captured once per session and choice; "this frame" is the preview itself. */
  let openerPreviews = $state<Partial<Record<VideoOpener, string>>>({});
  let openerCaptureSession = 0;
  const openerOptions = $derived(
    VIDEO_OPENER_OPTIONS.map((option) => ({
      value: option.value,
      label: videoOpenerLabel(option.value),
    }))
  );
  function videoOpenerLabel(value: VideoOpener): string {
    switch (value) {
      case "first-beat":
        return t("share_first_beat");
      case "this-frame":
        return t("share_current_frame");
      case "mandala":
        return "Mandala";
    }
  }
  // Wide screens recompose Share as a persistent stage beside a rail; below
  // this the sheet is a bottom sheet with the stage as a band above the task.
  // Card and video settings are always on screen at every size; a short or
  // narrow sheet scrolls its one rail body instead of folding them away.
  const splitLayout = new MediaQuery("(min-width: 900px)");
  // SegmentedControl values are strings; the numeric setting is converted at
  // the exportOptions boundary below.
  const videoResolutionOptions: { value: string; label: string }[] = [
    { value: "720", label: "720p" },
    { value: "1080", label: "1080p" },
    { value: "2160", label: "4K" },
    { value: "4320", label: "8K" },
  ];
  const videoFpsOptions: { value: string; label: string }[] = [
    { value: "30", label: "30 fps" },
    { value: "60", label: "60 fps" },
    { value: "120", label: "120 fps" },
  ];
  const videoQualityOptions: { value: VideoQuality; label: string }[] =
    $derived([
      { value: "standard", label: t("share_quality_standard") },
      { value: "cinema", label: t("share_quality_cinema") },
    ]);
  let captionOpen = $state(false);
  let publishOpen = $state(false);
  let failedPreviewUrl = $state<string | null>(null);
  let cardRenderFailed = $state(false);
  let liveCardAutoLayout = $state<ResolvedAutoLayout | null>(null);
  let liveCardAutoLayoutKey = $state("");
  let liveCardLayoutSourceRevision = $state<string | null>(null);
  let liveCardReadyRevision = $state<string | null>(null);
  let liveCardContentReadySourceRevision = $state<string | null>(null);
  let pendingCardDownloadRevision = $state<string | null>(null);

  let statusMessage = $state("");
  let busyDestination = $state<HandoffDestinationId | null>(null);
  type VideoStatus = "idle" | "rendering" | "ready" | "canceled" | "failed";
  let videoStatus = $state<VideoStatus>("idle");
  let videoRequestVersion = 0;
  let sawExternalVideoExport = false;
  let savingCardPresentation = $state(false);

  function changeShareCardPresentation(value: CardPresentation): void {
    shareDraft.cardPresentation = value;
  }

  let videoBlob = $state<Blob | null>(null);
  let instagramReviewOpen = $state(false);
  let activeHasAudio = $state<boolean | null>(false);
  let audioInspectionVersion = 0;

  /** Shared with Post Studio and gated on open so unused viewers pay no render. */
  const cardPreview = createCardPreviewState({
    getSequence: () => sequence,
    // A video download has its own live viewer capture; it must not quietly
    // spend a card render just because both artifacts are supported.
    getEnabled: () =>
      isOpen && filePreparationOpen && shareDraft.artifact === "card",
    getDarkMode: () => exportOptions.imageDarkMode,
    getResolvedAutoLayout: () => liveCardAutoLayout ?? resolvedCardAutoLayout,
    getCardPresentation: () => shareDraft.cardPresentation,
    getRenderEnabled: () => {
      // Post Studio and Publish prepare a PNG without mounting this sheet's
      // live card. Their existing background render path must stay available.
      if (shareRoute !== "download") return true;
      const request = cardPreview.request;
      if (!request || liveCardReadyRevision !== request.revision) return false;
      return (
        !isCardLayoutAutomatic(request.sequence.steps.length) ||
        (liveCardAutoLayout !== null &&
          liveCardLayoutSourceRevision === request.sourceRevision)
      );
    },
    onError: () => {
      cardRenderFailed = true;
      statusMessage = t("share_render_card_failed");
    },
  });
  // Crossfade keeps the old stage mounted during its outro. Hold that card's
  // request separately so an artifact switch cannot make its live SVG read the
  // new (or cleared) preview state while it fades away.
  let displayedCardRequest = $state<typeof cardPreview.request>(null);
  $effect.pre(() => {
    const request = cardPreview.request;
    if (artifact === "card" && request && !qrDataUrl) {
      displayedCardRequest = request;
    }
  });

  function resolveLiveCardAutoLayout(
    layout: ResolvedAutoLayout | null,
    _width: number,
    _height: number,
    sourceRevision?: string
  ): void {
    const request = cardPreview.request;
    if (
      !request ||
      !layout ||
      (sourceRevision && request.sourceRevision !== sourceRevision)
    )
      return;
    const key = JSON.stringify(layout);
    if (
      liveCardLayoutSourceRevision === request.sourceRevision &&
      liveCardAutoLayoutKey === key
    )
      return;
    // The first Auto measurement completes the current choice; it is not a
    // settings edit. Keep an immediate Download click attached through that
    // initial settlement. A source/settings edit has already changed the
    // request revision and therefore cannot carry an old intent forward.
    const carryInitialDownload =
      pendingCardDownloadRevision === request.revision &&
      liveCardContentReadySourceRevision !== request.sourceRevision;
    liveCardAutoLayout = layout;
    liveCardAutoLayoutKey = key;
    liveCardLayoutSourceRevision = request.sourceRevision;
    if (carryInitialDownload) {
      pendingCardDownloadRevision = cardPreview.request?.revision ?? null;
    }
    queueMicrotask(() => {
      const current = cardPreview.request;
      if (
        current &&
        liveCardContentReadySourceRevision === current.sourceRevision
      )
        liveCardReadyRevision = current.revision;
    });
  }

  function markLiveCardReady(sourceRevision?: string): void {
    const request = cardPreview.request;
    if (
      !request ||
      (sourceRevision && request.sourceRevision !== sourceRevision)
    )
      return;
    liveCardContentReadySourceRevision = request.sourceRevision;
    liveCardReadyRevision = request.revision;
  }

  let observedLiveCardSourceRevision: string | null = null;
  $effect(() => {
    const sourceRevision = cardPreview.request?.sourceRevision ?? null;
    if (sourceRevision === observedLiveCardSourceRevision) return;
    observedLiveCardSourceRevision = sourceRevision;
    // A newly mounted card can finish its cached-content readiness in the same
    // flush as this observer. Keep that valid signal instead of clearing the
    // PNG gate after the card is already visibly settled.
    if (liveCardContentReadySourceRevision === sourceRevision) return;
    liveCardAutoLayout = null;
    liveCardAutoLayoutKey = "";
    liveCardLayoutSourceRevision = null;
    liveCardReadyRevision = null;
    liveCardContentReadySourceRevision = null;
    pendingCardDownloadRevision = null;
  });

  let shortUrl = $state<string | null>(null);
  let linkRequest: Promise<string> | null = null;
  let linkSession = 0;
  let linkSequence: SequenceData | null = null;
  let copyLinkPending = $state(false);
  let copyLinkMessage = $state("");
  /** Shown when no clipboard path is open, so the link is still obtainable. */
  let revealedLinkUrl = $state<string | null>(null);
  /** The link the last copy put on the clipboard, shown on the Copy link tile. */
  let copiedLinkUrl = $state<string | null>(null);

  let qrDataUrl = $state<string | null>(null);
  let qrPending = $state(false);
  let qrError = $state("");

  let liveMetaStatus = $state<MetaPublishStatus>(EMPTY_META_PUBLISH_STATUS);
  let postingTarget = $state<MetaPublishTarget | null>(null);
  let connectingTarget = $state<MetaPublishTarget | null>(null);
  let pageMenuOpen = $state(false);
  let postStage = $state("");
  let postedPermalinks = $state<Partial<Record<MetaPublishTarget, string>>>({});

  /** Derive unsaved workspace words instead of trusting their empty stored field. */
  const alphabetWord = $derived(sequence ? deriveWord(sequence) : "");

  const word = $derived(
    simplifyRepeatedWord(
      sequence?.displayName || alphabetWord || sequence?.intendedWord || ""
    )
  );

  /** The glyph header uses the simplified alphabet word, never display prose. */
  const glyphWord = $derived(simplifyRepeatedWord(alphabetWord));

  /** Drop inline viewer URLs in favor of a minted post link. */
  const seededShortUrl = $derived(
    isPostLink(shareUrl ?? "") ? shareUrl.trim() : ""
  );

  const postUrl = $derived(shortUrl ?? seededShortUrl);

  /**
   * Copy link hands over the viewer state too, so the recipient opens the exact
   * view that was shared. Captions keep the bare post link: a caption is read by
   * people, and a state blob in it is noise.
   */
  function buildCopyLinkUrl(baseUrl: string, viewerUrl = shareUrl): string {
    if (!baseUrl) return "";
    if (!viewerUrl) return baseUrl;
    try {
      const state = new URL(viewerUrl).searchParams;
      const target = new URL(baseUrl);
      let carried = false;
      for (const name of VIEWER_STATE_PARAM_NAMES) {
        const value = state.get(name);
        if (value === null) continue;
        target.searchParams.set(name, value);
        carried = true;
      }
      return carried ? target.toString() : baseUrl;
    } catch {
      return baseUrl;
    }
  }

  const copyLinkUrl = $derived.by(() => buildCopyLinkUrl(postUrl || shareUrl));
  const copyLinkState = $derived(
    copyLinkPending ? "pending" : copiedLinkUrl ? "copied" : "idle"
  );

  function displayLink(url: string): string {
    return url.replace(/^https?:\/\//, "");
  }

  // The sequence animation is the first thing on every Share screen. A wide
  // screen gives it a stage beside the actions; a phone gets a compact strip
  // above them that grows into the Download preview.
  const homeLivePreview = $derived(!!liveVideoPreview);
  // Without a live animation or a still, a phone strip would only show a
  // glyph, so the split layout alone keeps the empty stage.
  const stageVisible = $derived(
    splitLayout.current ||
      shareRoute === "download" ||
      homeLivePreview ||
      !!animationPreviewUrl
  );
  const presets = $derived(
    captions.buildPresets({
      word: alphabetWord || sequence?.displayName || "",
      url: postUrl,
    })
  );

  const activeBlob = $derived(
    artifact === "video" ? videoBlob : cardPreview.blob
  );

  const filename = $derived(buildArtifactFilename(word, artifact));
  // A previous file must disappear while an explicit retry replaces it.
  const activeVideoUrl = $derived(
    videoStatus === "ready" ? videoBlobUrl : null
  );
  // This stays mounted while a render reports progress or settles. The encoded
  // file replaces it only once there is a usable URL.
  const showingLiveVideoPreview = $derived(
    artifact === "video" && !!liveVideoPreview && !activeVideoUrl && !qrDataUrl
  );
  /**
   * Parent context objects are rebuilt during playback. Track the primitive
   * source URL and sheet visibility, so equivalent parent updates cannot
   * restart the delivered-file fetch or flip the UI back to rendering.
   */
  const hydratedVideoUrl = $derived(isOpen ? videoBlobUrl : null);
  const reviewPreviewUrl = $derived(
    artifact === "video" ? activeVideoUrl : cardPreview.url
  );

  $effect(() => {
    const mediaUrl =
      instagramReviewOpen && artifact === "video" ? activeVideoUrl : null;
    const version = ++audioInspectionVersion;
    if (!mediaUrl) {
      activeHasAudio = false;
      return;
    }
    activeHasAudio = null;
    void hasDecodableAudioTrack(mediaUrl).then((hasAudio) => {
      if (version === audioInspectionVersion) activeHasAudio = hasAudio;
    });
  });

  const destinations = $derived(
    resolveDestinations({ artifact, blob: activeBlob, filename })
  );

  /** Device-gated so desktop Chrome's API support does not imply a phone flow. */
  const nativeShare = $derived(
    destinations.find((destination) => destination.id === "native-share") ??
      null
  );
  /** Download remains the dependable primary action; device sharing stays nearby. */
  const primaryDeliveryId = "download" as const;

  /** The visual harness can exercise connection states while posting is disabled. */
  const postingAvailable = $derived(
    META_POSTING_ENABLED || metaStatusOverride !== undefined
  );

  // A guest (or a build without posting) has nothing to publish with yet. That
  // state is a task for the Home shell's rail, so it keeps the preview and the
  // dialog size; only the real posting flow gets its own single column.
  const publishGate = $derived(
    shareRoute === "publish" && (!postingAvailable || needsAccountForFiles)
  );
  const publishFlow = $derived(shareRoute === "publish" && !publishGate);
  // Which half of the split shell the stage and rail show.
  const splitRoute = $derived(shareRoute === "download" ? "download" : "home");

  const metaStatus = $derived(metaStatusOverride ?? liveMetaStatus);

  type NetworkKind = "post" | "review" | "connect" | "choose-page" | "handoff";

  interface NetworkPlan {
    key: "instagram" | "facebook";
    brand: "instagram" | "facebook";
    name: string;
    label: string;
    hint: string;
    kind: NetworkKind;
    target?: MetaPublishTarget;
    destination?: HandoffDestinationId;
  }

  /**
   * Each network keeps one branded button while its action changes with account
   * state. Native mobile sharing can replace both desktop fallbacks.
   */
  const networks = $derived.by(() => {
    const plans: NetworkPlan[] = [];
    const instagram = postingAvailable ? metaStatus.instagram : null;
    const page = postingAvailable ? metaStatus.facebookPage : null;

    if (instagram) {
      plans.push({
        key: "instagram",
        brand: "instagram",
        name: "Instagram",
        label: t("share_review_instagram"),
        hint: `@${instagram.username}`,
        kind: "review",
        target: "instagram",
      });
    } else if (postingAvailable) {
      plans.push({
        key: "instagram",
        brand: "instagram",
        name: "Instagram",
        label: t("share_connect_professional_instagram"),
        hint: t("share_creator_or_business"),
        kind: "connect",
        target: "instagram",
      });
    } else if (destinations.some((d) => d.id === "send-to-phone")) {
      plans.push({
        key: "instagram",
        brand: "instagram",
        name: "Instagram",
        label: t("share_send_to_instagram"),
        hint: t("share_scan_post_phone"),
        kind: "handoff",
        destination: "send-to-phone",
      });
    }

    // A connection is not a post target until the user chooses its Page.
    if (page?.selectedPageId) {
      plans.push({
        key: "facebook",
        brand: "facebook",
        name: "Facebook",
        label: t("share_post_facebook"),
        hint: page.selectedPageName || t("share_your_page"),
        kind: "post",
        target: "facebook-page",
      });
    } else if (page) {
      plans.push({
        key: "facebook",
        brand: "facebook",
        name: "Facebook",
        label: t("share_choose_page"),
        hint: t("share_pick_page"),
        kind: "choose-page",
        target: "facebook-page",
      });
    } else if (postingAvailable) {
      plans.push({
        key: "facebook",
        brand: "facebook",
        name: "Facebook",
        label: t("share_connect_facebook"),
        hint: t("share_post_to_page"),
        kind: "connect",
        target: "facebook-page",
      });
    } else if (destinations.some((d) => d.id === "copy-image-facebook")) {
      plans.push({
        key: "facebook",
        brand: "facebook",
        name: "Facebook",
        label: t("share_open_facebook"),
        hint: t("share_paste_image_caption"),
        kind: "handoff",
        destination: "copy-image-facebook",
      });
    }

    return plans;
  });

  const autoPostTargets = $derived(
    networks
      .filter((plan) => plan.kind === "post" || plan.kind === "review")
      .map((plan) => ({
        id: plan.target as MetaPublishTarget,
        network: plan.name,
        account: plan.hint,
      }))
  );

  const tileDestinations = $derived(
    destinations.filter(
      (destination) =>
        destination.id !== primaryDeliveryId &&
        destination.id !== "copy-caption" &&
        destination.id !== "copy-image-facebook"
    )
  );

  const facebookPages = $derived(metaStatus.facebookPage?.pages ?? []);

  /** A connected account still needs an explicit Page before it can post. */
  const pageChoicePending = $derived(
    !!metaStatus.facebookPage && !metaStatus.facebookPage.selectedPageId
  );

  const metaBusy = $derived(
    postingTarget !== null || connectingTarget !== null
  );

  const cardDownloadPending = $derived(pendingCardDownloadRevision !== null);

  /** Busy means work is actually running, including bytes arriving for delivery. */
  const videoBusy = $derived(videoStatus === "rendering");

  /** The opener is offered only where the host can bake it into the render. */
  const openerEnabled = $derived(
    !!captureVideoOpener && !is3DExport && artifact === "video"
  );
  const opener = $derived<VideoOpener>(
    openerEnabled ? exportOptions.videoOpener : "first-beat"
  );
  const openerLabel = $derived(videoOpenerLabel(opener));
  /** The stage shows exactly the image the clip will open with. */
  const openerPreviewUrl = $derived(
    openerEnabled && opener !== "this-frame"
      ? (openerPreviews[opener] ?? animationPreviewUrl)
      : animationPreviewUrl
  );
  // One key per stage subject, so only a real change of subject crossfades.
  // Declared after every value it reads.
  const stageKey = $derived(
    splitRoute === "home"
      ? homeLivePreview
        ? "home-live"
        : animationPreviewUrl
          ? "home-img"
          : "home-empty"
      : qrDataUrl
        ? "phone"
        : artifact === "card"
          ? displayedCardRequest
            ? "card"
            : "card-pending"
          : `video:${activeVideoUrl ? "ready" : showingLiveVideoPreview ? "live" : openerPreviewUrl ? "opener" : videoStatus}`
  );

  async function ensureOpenerPreview(kind: VideoOpener): Promise<void> {
    if (!captureVideoOpener || kind === "this-frame") return;
    if (openerPreviews[kind]) return;
    const session = openerCaptureSession;
    try {
      const url = await captureVideoOpener(kind);
      if (session !== openerCaptureSession || !url) return;
      openerPreviews = { ...openerPreviews, [kind]: url };
    } catch (error) {
      console.error("[PostShareSheet] Could not capture the opener:", error);
    }
  }

  $effect(() => {
    if (!openerEnabled || shareRoute === "home" || publishGate) return;
    const kind = opener;
    // Reading the cache here re-runs the capture after a session reset clears it.
    if (kind === "this-frame" || openerPreviews[kind]) return;
    untrack(() => void ensureOpenerPreview(kind));
  });

  function openerRequest(): VideoRenderRequest | undefined {
    if (!openerEnabled) return undefined;
    return {
      opener: {
        kind: opener,
        imageUrl: openerAddsHold(opener) ? (openerPreviewUrl ?? "") : "",
      },
    };
  }

  /** Detect setting changes without automatically replacing an expensive render. */
  const videoSettingsKey = $derived(
    videoSettingsAvailable
      ? videoDownloadSettingsKey({
          resolution: exportOptions.videoResolution,
          fps: exportOptions.videoFps,
          repeats: exportOptions.videoLoopCount,
          quality: exportOptions.videoQuality,
          is3DExport,
          opener: openerEnabled ? opener : undefined,
        })
      : "host-video-format"
  );
  let renderedVideoKey = $state<string | null>(null);
  let renderedVideoSourceKey = $state<string | null>(null);
  /**
   * Capture settings at request time so changes made during rendering correctly
   * mark the result stale.
   */
  let requestedVideoKey: string | null = null;
  let requestedVideoSourceKey: string | null = null;
  let stampedVideoUrl: string | null = null;

  /** The URL counts immediately, before its bytes finish loading into a blob. */
  const hasVideo = $derived(!!activeVideoUrl || !!videoBlob);

  const videoSettingsStale = $derived(
    artifact === "video" &&
      hasVideo &&
      !isExportingVideo &&
      renderedVideoKey !== null &&
      (renderedVideoKey !== videoSettingsKey ||
        renderedVideoSourceKey !== videoSourceKey)
  );
  const publishPreparationKey = $derived(
    !postingAvailable
      ? "unavailable"
      : needsAccountForFiles
        ? "account"
        : artifact === "video" && videoBusy
          ? "video-rendering"
          : artifact === "video" && videoSettingsStale
            ? "video-stale"
            : artifact === "video" && activeVideoUrl
              ? "video-ready"
              : artifact === "card" && cardPreview.url
                ? "card-ready"
                : "missing"
  );

  const progressLabel = $derived.by(() => {
    if (!videoBusy) return "";
    if (isExportingVideo && exportProgress !== null) {
      return `Rendering ${resolvedVideoLabel.toLowerCase()}… ${Math.round(exportProgress * 100)}%`;
    }
    return `Rendering ${resolvedVideoLabel.toLowerCase()}…`;
  });

  /**
   * Send in Flow Arts Composer opens the inbox drawer, which lives outside the native modal
   * top layer this sheet sits in. Opened while the sheet is still up, the
   * drawer is painted beneath the sheet and made inert by it, so the sheet
   * closes first and the handoff runs from onClosed, once the dialog has left
   * the top layer. A reopen before then drops the handoff with the session.
   */
  let pendingHandoff: (() => void) | null = null;

  function handOffAfterClose(action: () => void): void {
    pendingHandoff = action;
    onClose();
  }

  function runPendingHandoff(): void {
    const action = pendingHandoff;
    pendingHandoff = null;
    action?.();
  }

  // A closed sheet owns nothing. Every open starts a clean public-content draft.
  let wasOpen = false;
  $effect(() => {
    if (isOpen === wasOpen) return;
    wasOpen = isOpen;
    if (!isOpen) return;
    pendingHandoff = null;
    shareDraft.start({
      availableArtifacts,
      initialArtifact,
      cardPresentation:
        initialCardPresentation ??
        cardPresentationFromFooterSettings(
          imageComposition.showNotes,
          imageComposition.customNotesText
        ),
    });
    presetsOpen = false;
    filePreparationOpen = false;
    captionOpen = false;
    publishOpen = false;
    failedPreviewUrl = null;
    cardRenderFailed = false;
    statusMessage = "";
    busyDestination = null;
    videoStatus = videoBlobUrl ? "ready" : "idle";
    qrDataUrl = null;
    qrError = "";
    pageMenuOpen = false;
    postedPermalinks = {};
    copyLinkMessage = "";
    revealedLinkUrl = null;
    copiedLinkUrl = null;
    shortUrl = seededShortUrl || null;
    shareRoute = initialEntry === "chooser" ? "home" : initialEntry;
    filePreparationOpen = shareRoute === "download";
    animationPreviewUrl = captureAnimationPreview() || null;
    openerPreviews = {};
    openerCaptureSession += 1;
    if (initialEntry === "download") shareDraft.selectArtifact(initialArtifact);
    if (initialEntry === "publish") untrack(openPublish);
  });

  $effect(() => {
    const url = hydratedVideoUrl;
    // Never relabel and reuse a previous view's render.
    if (!url) {
      videoBlob = null;
      if (untrack(() => videoStatus) === "ready") videoStatus = "idle";
      return;
    }

    // `untrack` prevents the completed-render stamp from following later edits.
    // Preexisting renders are credited to the only settings currently available.
    if (url !== stampedVideoUrl) {
      renderedVideoKey = requestedVideoKey ?? untrack(() => videoSettingsKey);
      renderedVideoSourceKey =
        requestedVideoSourceKey ?? untrack(() => videoSourceKey);
      requestedVideoKey = null;
      requestedVideoSourceKey = null;
      stampedVideoUrl = url;
    }

    // Hydrating delivered bytes is part of the same user request. It must not
    // retire the pending download intent, while cancellation still does.
    const requestVersion = videoRequestVersion;
    videoStatus = "rendering";
    let stale = false;
    void (async () => {
      try {
        const blob = await (await fetch(url)).blob();
        if (!stale && requestVersion === videoRequestVersion) {
          videoBlob = blob;
          videoStatus = "ready";
        }
      } catch (error) {
        console.error("[PostShareSheet] Could not read exported video:", error);
        if (!stale && requestVersion === videoRequestVersion) {
          videoStatus = "failed";
        }
      }
    })();

    return () => {
      stale = true;
    };
  });

  $effect(() => {
    if (videoStatus === "canceled") return;
    if (isExportingVideo) {
      sawExternalVideoExport = true;
      // A delivered URL can finish loading before the source flips its active
      // flag. Keep the usable result ready instead of bouncing back to a
      // spinner until the source's final bookkeeping completes.
      if (!videoBlob) videoStatus = "rendering";
      return;
    }
    if (sawExternalVideoExport) {
      sawExternalVideoExport = false;
      if (videoBlob) {
        videoStatus = "ready";
      } else if (videoStatus === "rendering" && !videoBlobUrl) {
        videoStatus = "failed";
      }
    }
  });

  // A completed request must never update a later sequence or reopened sheet.
  $effect(() => {
    const target = sequence;
    if (!isOpen || !target) return;
    const session = ++linkSession;
    linkRequest = null;
    if (linkSequence !== target) {
      shortUrl = seededShortUrl || null;
    }
    linkSequence = target;
    copyLinkPending = false;
    return () => {
      if (linkSession !== session) return;
      linkSession += 1;
      linkRequest = null;
      copyLinkPending = false;
    };
  });

  // Keep seeding until the user edits; an arriving short link can then fill in.
  $effect(() => {
    if (!isOpen || captionTouched) return;
    const first = presets[0];
    if (first) shareDraft.caption = first.text;
  });

  // Account state is only useful after the explicit publishing route opens.
  $effect(() => {
    if (!isOpen || !publishOpen || metaStatusOverride || !META_POSTING_ENABLED)
      return;

    const uid = getUser()?.uid;
    if (!uid) {
      liveMetaStatus = EMPTY_META_PUBLISH_STATUS;
      return;
    }
    return subscribeMetaPublishStatus(uid, (next) => {
      liveMetaStatus = next;
    });
  });

  function handleArtifactChange(next: ShareArtifact): void {
    if (
      next !== artifact &&
      artifact === "video" &&
      (videoBusy || isExportingVideo)
    ) {
      cancelVideo();
    }
    if (!shareDraft.selectArtifact(next)) return;
    statusMessage = "";
    qrDataUrl = null;
    // Posted links belong to the selected artifact.
    postedPermalinks = {};
  }

  /** File choices are intentionally lazy, so Copy link and Send in Flow Arts Composer stay fast. */
  function beginFilePreparation(): void {
    filePreparationOpen = true;
    shareRoute = "download";
    // The card is mounted afresh for each Download visit. Do not let a paint
    // from a prior visit unlock the PNG before this visible card has settled.
    liveCardReadyRevision = null;
    animationPreviewUrl = captureAnimationPreview() || null;
    statusMessage = "";
  }

  /**
   * Picks the file to download. Where the host exports the animation itself
   * (the viewer's Export page, stage still playing) the video choice goes
   * there, the same way Post Studio takes over from the sheet, and the sheet
   * is done. Returns false when it handed off.
   */
  function chooseArtifact(next: ShareArtifact): boolean {
    if (next === "video" && onOpenVideoExport) {
      onOpenVideoExport();
      onClose();
      return false;
    }
    handleArtifactChange(next);
    return true;
  }

  function beginDownload(next: ShareArtifact): void {
    if (!chooseArtifact(next)) return;
    beginFilePreparation();
  }

  function linkSessionIsCurrent(
    session: number,
    target: SequenceData
  ): boolean {
    return linkSession === session && isOpen && sequence === target;
  }

  /** A short link is persisted only after a share action needs it. */
  function requestPostLink(): Promise<string> {
    if (postUrl) return Promise.resolve(postUrl);
    if (!canCreateLink || !sequence || !isOpen) {
      return Promise.reject(
        new Error("A saved sequence is required for a link")
      );
    }

    if (linkRequest) return linkRequest;

    const target = sequence;
    const session = linkSession;
    const request = getShortCodeManager()
      .createShortCode(target, { embedSequenceData: true })
      .then((result) => {
        if (!linkSessionIsCurrent(session, target)) {
          throw new Error("Share sheet session changed");
        }
        const url = buildPostLink(result.code);
        shortUrl = url;
        return url;
      })
      .catch((error: unknown) => {
        if (linkSessionIsCurrent(session, target)) {
          linkRequest = null;
          console.warn("[PostShareSheet] Couldn't create a link:", error);
        }
        throw error;
      });
    linkRequest = request;
    return request;
  }

  async function handleCopyLinkIntent(): Promise<void> {
    if (copyLinkPending) return;
    if (!copyLinkUrl && !canCreateLink) {
      copyLinkMessage = t("share_save_sequence_link");
      return;
    }

    const session = linkSession;
    const target = sequence;
    const viewerUrl = shareUrl;
    copyLinkPending = true;
    copyLinkMessage = "";
    copiedLinkUrl = null;
    try {
      const result = copyLinkUrl
        ? await copyLink(copyLinkUrl)
        : await copyPreparedLink(
            requestPostLink().then((url) => buildCopyLinkUrl(url, viewerUrl))
          );

      if (target && linkSessionIsCurrent(session, target) && result.message) {
        copyLinkMessage = result.message;
        if (result.status === "done") {
          copiedLinkUrl =
            copyLinkUrl || buildCopyLinkUrl(shortUrl || viewerUrl, viewerUrl);
        }
        if (result.status === "failed") {
          const fallbackUrl =
            copyLinkUrl || buildCopyLinkUrl(shortUrl || viewerUrl, viewerUrl);
          if (fallbackUrl) {
            revealedLinkUrl = fallbackUrl;
            copyLinkMessage = t("share_copy_link_manually");
          }
        }
      }
    } catch {
      if (!target || linkSessionIsCurrent(session, target)) {
        copyLinkMessage = t("share_copy_link_failed");
      }
    } finally {
      if (!target || linkSessionIsCurrent(session, target)) {
        copyLinkPending = false;
      }
    }
  }

  function preparePostLink(): void {
    void requestPostLink().catch(() => {});
  }

  function openCaption(): void {
    captionOpen = !captionOpen;
    if (captionOpen) preparePostLink();
  }

  function openPublish(): void {
    shareRoute = "publish";
    publishOpen = true;
    if (postingAvailable && !needsAccountForFiles) preparePostLink();
  }

  let sharingRail = $state<HTMLDivElement>();

  async function returnToChooser(): Promise<void> {
    const returnFocusIntent =
      shareRoute === "download"
        ? "download"
        : shareRoute === "publish"
          ? "publish"
          : null;
    if (videoBusy || isExportingVideo) cancelVideo();
    filePreparationOpen = false;
    shareRoute = "home";
    captionOpen = false;
    publishOpen = false;
    qrDataUrl = null;
    qrError = "";
    statusMessage = "";

    // Crossfade can resume a leaving Home layer without remounting it. Wait
    // for the route to activate, then find its interactive intent in the rail.
    await tick();
    if (!isOpen || shareRoute !== "home" || !returnFocusIntent) return;
    const intents = sharingRail?.querySelectorAll<HTMLButtonElement>(
      `button[data-share-intent="${returnFocusIntent}"]`
    );
    const activeIntent = [...(intents ?? [])].find(
      (button) => !button.closest("[inert]")
    );
    activeIntent?.focus({ preventScroll: true });
  }

  /** Close before switching viewer surfaces so Back never returns to the modal. */
  function openPostStudio(): void {
    statusMessage = "";
    qrDataUrl = null;
    onOpenPostStudio?.();
    onClose();
  }

  function openInstagramReview(): void {
    const account = metaStatus.instagram;
    if (!account || !reviewPreviewUrl || videoBusy || videoSettingsStale) {
      if (videoSettingsStale) {
        statusMessage = t("share_prepare_updated_video_publish");
      }
      return;
    }

    const now = Date.now();
    const isReel = artifact === "video";
    const accountId = account.accountId || `instagram:${account.username}`;
    postDeliveryState.reset({
      draft: {
        schemaVersion: 1,
        id: `local:${sequence?.id ?? "unsaved"}:${artifact}`,
        ownerId: getUser()?.uid ?? "local-preview",
        sourceSequenceId: sequence?.id ?? null,
        recipeId: null,
        format: isReel ? "reel" : "image",
        items: [
          {
            id: `item:${artifact}`,
            artifactRevisionId: `local:${sequence?.id ?? "unsaved"}:${artifact}`,
            order: 0,
            altText: null,
            cropPreviewRevision:
              artifact === "card"
                ? cardPreview.revision || "current-card"
                : renderedVideoKey || "current-video",
          },
        ],
        caption,
        instagram: {
          shareToFeed: isReel ? true : null,
          cover: null,
          originalAudioName: null,
          attachedAudio: null,
          trial: null,
          collaborators: [],
          userTags: [],
          locationId: null,
          productTags: [],
          aiGenerated: null,
          paidPartnership: false,
          sponsorIds: [],
        },
        delivery: { mode: "publish-now" },
        selectedAccountId: accountId,
        capabilitySnapshotId: account.capabilities?.id ?? null,
        createdAt: now,
        updatedAt: now,
      },
      capabilitySnapshot: account.capabilities,
    });
    statusMessage = "";
    qrDataUrl = null;
    instagramReviewOpen = true;
  }

  function syncInstagramReviewCaption(): void {
    shareDraft.caption = postDeliveryState.draft.caption;
    shareDraft.captionTouched = true;
  }

  function closeInstagramReview(): void {
    syncInstagramReviewCaption();
    instagramReviewOpen = false;
  }

  function closeShareFromInstagramReview(): void {
    syncInstagramReviewCaption();
    onClose();
  }

  function editInstagramComposition(): void {
    closeInstagramReview();
    openPostStudio();
  }

  function postReviewedInstagram(): void {
    syncInstagramReviewCaption();
    void postToTarget("instagram");
  }

  function finishInstagramReview(): void {
    closeInstagramReview();
    const destination =
      nativeShare ??
      destinations.find((candidate) => candidate.id === "send-to-phone");
    if (destination) {
      void runDestination(destination.id);
      return;
    }
    statusMessage = t("share_finish_instagram");
  }

  /**
   * The viewer refuses a render for reasons the sheet cannot see from its props
   * — the take-it-home account gate, an animation canvas that has not mounted,
   * an export already in flight. Until it reported that, the sheet sat on
   * "Rendering video…" forever with no error and no way back.
   */
  function requestVideo(): void {
    if (!shareDraft.availableArtifacts.includes("video")) return;
    if (videoBusy || isExportingVideo) return;
    statusMessage = "";
    const requestVersion = ++videoRequestVersion;
    sawExternalVideoExport = false;
    // Retire an old ordinary render only for this explicit user action.
    onPrepareFile?.("video");
    videoBlob = null;
    videoStatus = "rendering";
    requestedVideoKey = untrack(() => videoSettingsKey);
    requestedVideoSourceKey = untrack(() => videoSourceKey);
    let started: void | boolean | Promise<boolean>;
    try {
      started = onRequestVideo(openerRequest());
    } catch {
      if (requestVersion === videoRequestVersion) videoStatus = "failed";
      return;
    }
    if (started === false) {
      // The viewer refused to start (canvas not mounted, export in flight).
      // That is a failure to report, never the user's own cancel.
      if (requestVersion === videoRequestVersion) videoStatus = "failed";
      return;
    }
    if (!(started instanceof Promise)) {
      queueMicrotask(() => {
        if (
          requestVersion === videoRequestVersion &&
          !isExportingVideo &&
          !videoBlobUrl
        ) {
          videoStatus = "failed";
        }
      });
      return;
    }
    void started
      .then(async (ok) => {
        await Promise.resolve();
        if (requestVersion !== videoRequestVersion) return;
        if (ok === false) {
          videoStatus = "failed";
        } else if (!videoBlobUrl && !isExportingVideo) {
          // A source that settled without a delivered file is an unsuccessful
          // render; this also prevents a canceled source from spinning forever.
          videoStatus = "failed";
        }
      })
      .catch(() => {
        if (requestVersion === videoRequestVersion) videoStatus = "failed";
      });
  }

  function cancelVideo(): void {
    if (!videoBusy && !isExportingVideo) return;
    statusMessage = "";
    videoRequestVersion += 1;
    sawExternalVideoExport = false;
    requestedVideoKey = null;
    requestedVideoSourceKey = null;
    videoStatus = "canceled";
    pendingDownload = false;
    pendingDownloadVersion = null;
    pendingDownloadSettingsKey = null;
    pendingDownloadSourceKey = null;
    onCancelVideo?.();
  }

  /** Download is one explicit intent: reuse a prepared file, otherwise render
   * it and deliver only if this still-open request completes. */
  /** The autofocus attribute only works while nothing in the document has
   * focus; opened from a focused viewer button it did nothing and logged a
   * browser notice on every open. Focusing explicitly is not conditional. */
  function focusOnMount(node: HTMLElement) {
    node.focus({ preventScroll: true });
  }

  /** The revealed link is the recovery from a failed copy: land on it with
   * the text already selected so a keyboard copy is the only step left. */
  function selectOnMount(node: HTMLInputElement) {
    node.focus({ preventScroll: true });
    node.select();
  }

  function requestAccountForFile(): void {
    handOffAfterClose(() => onRequestAccount?.());
  }

  function downloadVideo(): void {
    if (videoBusy || isExportingVideo) return;
    const plan = planFileRequest({
      needsAccount: needsAccountForFiles,
      hasFreshFile: hasVideo && !videoSettingsStale && !!activeBlob,
    });
    if (plan === "request-account") {
      requestAccountForFile();
      return;
    }
    if (plan === "deliver") {
      void runDestination("download");
      return;
    }
    pendingDownload = true;
    pendingDownloadVersion = videoRequestVersion + 1;
    pendingDownloadSettingsKey = videoSettingsKey;
    pendingDownloadSourceKey = videoSourceKey;
    requestVideo();
  }

  /** A card download has one intent too: the visible card keeps its place while
   * the PNG catches up, then delivery happens only for this exact snapshot. */
  function downloadCard(): void {
    const request = cardPreview.request;
    if (!request) return;
    if (needsAccountForFiles) {
      requestAccountForFile();
      return;
    }
    if (cardPreview.blob) {
      void runDestination("download");
      return;
    }
    statusMessage = "";
    if (cardPreview.hasError) {
      cardPreview.reset();
      pendingCardDownloadRevision = cardPreview.request?.revision ?? null;
      return;
    }
    pendingCardDownloadRevision = request.revision;
  }

  $effect(() => {
    const request = cardPreview.request;
    const outcome = pendingCardDownloadOutcome({
      pendingRevision: pendingCardDownloadRevision,
      sheetOpen: isOpen && shareRoute === "download",
      artifact,
      currentRevision: request?.revision ?? null,
      hasBlob: !!cardPreview.blob,
      hasError: cardPreview.hasError,
    });
    if (outcome === "waiting") return;
    pendingCardDownloadRevision = null;
    if (outcome === "failed") {
      statusMessage = t("share_render_card_retry");
      return;
    }
    if (outcome === "deliver") void runDestination("download");
  });

  $effect(() => {
    // Read nothing else until a download waits: videoSourceKey embeds the
    // host's share URL, which re-encodes the whole viewer state on every
    // change and cost the viewer ~100 ms while it opened.
    if (!pendingDownload) return;
    const outcome = pendingVideoDownloadOutcome({
      pending: pendingDownload,
      sheetOpen: isOpen,
      requestVersion: videoRequestVersion,
      pendingRequestVersion: pendingDownloadVersion,
      currentSettingsKey: videoSettingsKey,
      requestedSettingsKey: pendingDownloadSettingsKey,
      currentSourceKey: videoSourceKey,
      requestedSourceKey: pendingDownloadSourceKey,
      status: videoStatus,
      hasBlob: !!videoBlob,
    });
    if (outcome === "waiting") return;
    pendingDownload = false;
    pendingDownloadVersion = null;
    pendingDownloadSettingsKey = null;
    pendingDownloadSourceKey = null;
    if (outcome === "deliver") {
      void runDestination("download");
    } else {
      statusMessage = t("share_settings_changed_download_again");
    }
  });

  // Closing the sheet retires its pending work, once, on the close itself.
  // The sheet stays mounted while closed, and the viewer's own Download render
  // flips isExportingVideo too. Tracking those flags here cancelled that
  // render the instant it started, so the Export page's button did nothing.
  let sheetWasActive = false;
  $effect(() => {
    if (isOpen) {
      sheetWasActive = true;
      return;
    }
    if (!sheetWasActive) return;
    sheetWasActive = false;
    untrack(() => {
      pendingDownload = false;
      pendingDownloadVersion = null;
      pendingDownloadSettingsKey = null;
      pendingDownloadSourceKey = null;
      pendingCardDownloadRevision = null;
      if (videoBusy || isExportingVideo) cancelVideo();
    });
  });

  function applyPreset(text: string): void {
    shareDraft.caption = text;
    shareDraft.captionTouched = true;
    postedPermalinks = {};
  }

  async function saveCardPresentation(): Promise<void> {
    if (!onSaveCardPresentation || savingCardPresentation) return;
    savingCardPresentation = true;
    try {
      const saved = await onSaveCardPresentation(shareDraft.cardPresentation);
      if (saved) {
        shareDraft.markCardPresentationSaved();
        statusMessage = t("share_card_footer_saved");
      }
    } finally {
      savingCardPresentation = false;
    }
  }

  function saveCurrentAsPreset(): void {
    // The sequence in view becomes the template's tokens, so this caption is
    // reusable rather than a literal that follows you onto every other post.
    captions.saveCustomPreset(caption, {
      word: alphabetWord || sequence?.displayName || "",
      url: postUrl,
    });
    statusMessage = t("share_preset_saved");
  }

  function removePreset(preset: (typeof presets)[number]): void {
    if (!preset.template) return;
    captions.removeCustomPreset(preset.template);
    statusMessage = t("share_preset_removed");
  }

  async function sendToPhone(): Promise<void> {
    const blob = activeBlob;
    if (!blob || !sequence?.id) {
      qrError = t("share_save_sequence_upload");
      return;
    }

    qrPending = true;
    qrError = "";

    try {
      const { url } = await getVideoUploader().uploadShareArtifact(
        sequence.id,
        blob,
        artifact
      );
      const image = await getQRCodeGenerator().generateUrlAsImage(url, 512);
      qrDataUrl = image.src;
    } catch (error) {
      console.error("[PostShareSheet] Phone handoff failed:", error);
      qrError = t("share_handoff_failed");
    } finally {
      qrPending = false;
    }
  }

  async function runDestination(id: HandoffDestinationId): Promise<void> {
    const blob = activeBlob;
    statusMessage = "";
    busyDestination = id;

    try {
      let result: HandoffResult;

      switch (id) {
        case "native-share":
          if (!blob) return;
          result = await shareArtifactNatively(blob, filename, caption);
          break;
        case "download":
          if (!blob) return;
          result = await downloadArtifact(blob, filename);
          break;
        case "copy-image-facebook":
          if (!blob) return;
          result = await copyImageAndOpenFacebook(blob);
          break;
        case "copy-caption":
          result = await copyCaption(caption);
          break;
        case "send-to-phone":
          await sendToPhone();
          return;
      }

      if (result.status !== "canceled" && result.message) {
        statusMessage = result.message;
      }
    } catch (error) {
      console.error("[PostShareSheet] Delivery failed:", error);
      statusMessage = t("share_finish_failed");
    } finally {
      busyDestination = null;
    }
  }

  function closeQrView(): void {
    qrDataUrl = null;
    qrError = "";
  }

  /** Uploads first because Meta ingests the artifact from a public URL. */
  async function postToTarget(target: MetaPublishTarget): Promise<void> {
    const blob = activeBlob;
    if (!blob || videoBusy || videoSettingsStale) {
      statusMessage = videoSettingsStale
        ? t("share_prepare_updated_video_publish")
        : t("share_prepare_media_account");
      return;
    }
    if (!sequence?.id) {
      statusMessage = t("share_save_sequence_upload");
      return;
    }

    postingTarget = target;
    statusMessage = "";
    postStage = t("share_uploading");

    try {
      // Reject unsupported containers before paying for upload and processing.
      if (artifact === "video" && blob.type && !blob.type.includes("mp4")) {
        statusMessage = t("share_unsupported_meta_format");
        return;
      }

      const media =
        target === "instagram" && artifact === "card"
          ? await toInstagramJpeg(blob)
          : blob;

      const { url } = await getVideoUploader().uploadShareArtifact(
        sequence.id,
        media,
        artifact
      );

      postStage =
        artifact === "video" ? t("share_meta_processing") : t("share_posting");
      const result = await publishToMeta({
        target,
        mediaType: artifact === "video" ? "video" : "image",
        mediaUrl: url,
        caption,
        instagram:
          target === "instagram"
            ? {
                format:
                  postDeliveryState.draft.format === "reel" ? "reel" : "image",
                selectedAccountId:
                  postDeliveryState.draft.selectedAccountId ?? "",
                capabilitySnapshotId:
                  postDeliveryState.draft.capabilitySnapshotId,
                shareToFeed:
                  postDeliveryState.draft.instagram.shareToFeed ?? true,
                thumbOffsetMs:
                  postDeliveryState.draft.instagram.cover?.kind === "frame"
                    ? postDeliveryState.draft.instagram.cover.offsetMs
                    : openerEnabled
                      ? openerCoverOffsetMs()
                      : null,
              }
            : undefined,
      });

      if (result.permalink) {
        postedPermalinks = { ...postedPermalinks, [target]: result.permalink };
      }
      statusMessage =
        target === "instagram"
          ? t("share_posted_instagram")
          : t("share_posted_page");
    } catch (error) {
      console.error("[PostShareSheet] Direct post failed:", error);
      statusMessage =
        error instanceof MetaPublishClientError
          ? error.message
          : t("share_post_failed");
    } finally {
      postingTarget = null;
      postStage = "";
    }
  }

  let busyLocalTile = $state<string | null>(null);

  async function runLocalTile(
    id: string,
    action: () => Promise<HandoffResult>
  ): Promise<void> {
    statusMessage = "";
    busyLocalTile = id;
    try {
      const result = await action();
      if (result.status !== "canceled" && result.message) {
        statusMessage = result.message;
      }
    } finally {
      busyLocalTile = null;
    }
  }

  function runNetwork(plan: NetworkPlan): void {
    switch (plan.kind) {
      case "review":
        openInstagramReview();
        return;
      case "post":
        void postToTarget(plan.target as MetaPublishTarget);
        return;
      case "connect":
        void connectTarget(plan.target as MetaPublishTarget);
        return;
      case "choose-page":
        pageMenuOpen = true;
        return;
      case "handoff":
        void runDestination(plan.destination as HandoffDestinationId);
    }
  }

  /** Account setup can run before the artifact is ready; delivery cannot. */
  function networkDisabled(plan: NetworkPlan): boolean {
    if (plan.kind === "connect" || plan.kind === "choose-page") return metaBusy;
    return (
      !activeBlob ||
      videoBusy ||
      videoSettingsStale ||
      metaBusy ||
      busyDestination !== null ||
      qrPending
    );
  }

  async function connectTarget(target: MetaPublishTarget): Promise<void> {
    connectingTarget = target;
    statusMessage = "";

    try {
      const account = await connectMetaAccount(target);
      statusMessage = account
        ? `${t("share_connected_with")} ${account}`
        : t("share_connected");
    } catch (error) {
      statusMessage =
        error instanceof MetaPublishClientError
          ? error.message
          : t("share_connect_failed");
    } finally {
      connectingTarget = null;
    }
  }

  async function forgetTarget(target: MetaPublishTarget): Promise<void> {
    connectingTarget = target;
    try {
      await disconnectMetaAccount(target);
      statusMessage = t("share_disconnected");
    } catch {
      statusMessage = t("share_disconnect_failed");
    } finally {
      connectingTarget = null;
    }
  }

  async function handlePageChange(pageId: string): Promise<void> {
    pageMenuOpen = false;
    try {
      await selectFacebookPage(pageId);
    } catch {
      statusMessage = t("share_switch_page_failed");
    }
  }

  /** Reopens Meta consent when the desired Page was absent from the grant. */
  async function changeSharedPages(): Promise<void> {
    pageMenuOpen = false;
    connectingTarget = "facebook-page";
    statusMessage = "";

    try {
      const account = await connectMetaAccount("facebook-page", {
        reselect: true,
      });
      statusMessage = account
        ? `${t("share_connected_with")} ${account}`
        : t("share_connected");
    } catch (error) {
      statusMessage =
        error instanceof MetaPublishClientError
          ? error.message
          : t("share_reopen_pages_failed");
    } finally {
      connectingTarget = null;
    }
  }

  // The fixed-positioned menu cannot rely on the chip's outside-click boundary.
  $effect(() => {
    if (!pageMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest(".page-chip")) {
        pageMenuOpen = false;
      }
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  });

  $effect(() => {
    if (!instagramReviewOpen) return;
    postDeliveryState.setCapabilitySnapshot(
      metaStatus.instagram?.capabilities ?? null
    );
  });
</script>

{#snippet brandMark(brand: "instagram" | "facebook")}
  <span class="brand-mark">
    {#if brand === "instagram"}
      <InstagramIcon />
    {:else}
      <FacebookIcon />
    {/if}
  </span>
{/snippet}

<!-- Posted state reuses the network button so success cannot shift layout. -->
{#snippet networkButton(plan: NetworkPlan)}
  {@const permalink = plan.target ? postedPermalinks[plan.target] : undefined}
  {@const busy =
    (!!plan.target &&
      (postingTarget === plan.target || connectingTarget === plan.target)) ||
    (!!plan.destination &&
      (busyDestination === plan.destination ||
        (plan.destination === "send-to-phone" && qrPending)))}
  {#if permalink}
    <a
      class="network network--{plan.brand} is-posted"
      href={permalink}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span class="network-mark">{@render brandMark(plan.brand)}</span>
      <span class="network-text">
        <span class="network-label">View on {plan.name}</span>
        <span class="network-hint">{plan.hint}</span>
      </span>
      <i
        class="network-chevron fa-solid fa-arrow-up-right-from-square"
        aria-hidden="true"
      ></i>
    </a>
  {:else}
    <button
      type="button"
      class="network network--{plan.brand}"
      disabled={networkDisabled(plan)}
      onclick={() => runNetwork(plan)}
    >
      <span class="network-mark">
        {#if busy}
          <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
        {:else}
          {@render brandMark(plan.brand)}
        {/if}
      </span>
      <span class="network-text">
        <span class="network-label">{plan.label}</span>
        <!-- Progress replaces the account hint in place. -->
        <span class="network-hint">
          {busy && postStage ? postStage : plan.hint}
        </span>
      </span>
      <i class="network-chevron fa-solid fa-chevron-right" aria-hidden="true"
      ></i>
    </button>
  {/if}
{/snippet}

<ShareSheetFrame
  {isOpen}
  ariaLabel={shareRoute === "publish"
    ? t("share_publish_post")
    : shareRoute === "download"
      ? artifact === "video"
        ? videoSettingsAvailable
          ? t("share_download_video")
          : t("share_download_post")
        : t("share_download_card")
      : t("share_sequence")}
  {onClose}
  onClosed={runPendingHandoff}
  narrow={!!qrDataUrl}
>
  {#snippet children(surface)}
    <Crossfade
      key={instagramReviewOpen && reviewPreviewUrl
        ? "instagram-review"
        : "share-sheet"}
      duration={DURATION.normal}
      mode="swap"
      motion="step"
    >
      {#if instagramReviewOpen && reviewPreviewUrl}
        <InstagramPostReview
          previewUrl={reviewPreviewUrl}
          mediaKind={artifact === "video" ? "video" : "image"}
          hasAudio={activeHasAudio === true}
          busy={postingTarget === "instagram"}
          stage={postStage}
          postedPermalink={postedPermalinks.instagram ?? null}
          onBack={closeInstagramReview}
          onClose={closeShareFromInstagramReview}
          onEditComposition={editInstagramComposition}
          onPost={postReviewedInstagram}
          onHandoff={finishInstagramReview}
          onReconnect={() => void connectTarget("instagram")}
        />
      {:else}
        <!-- Focus the surface so the dialog does not highlight Close on arrival. -->
        <div
          class="sheet"
          data-surface={surface}
          class:qr-step={!!qrDataUrl}
          class:menu-step={!filePreparationOpen}
          tabindex="-1"
          use:focusOnMount
        >
          <header class="panel-header">
            {#if (shareRoute === "download" && initialEntry === "chooser" && !qrDataUrl) || (shareRoute === "publish" && initialEntry !== "publish")}
              <button
                type="button"
                class="header-icon"
                onclick={returnToChooser}
                aria-label={t("share_back")}
              >
                <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
              </button>
            {/if}
            <div class="title-group">
              <h2 class="panel-title">
                {shareRoute === "publish"
                  ? t("share_publish_post")
                  : shareRoute === "download"
                    ? artifact === "video"
                      ? videoSettingsAvailable
                        ? t("share_download_video")
                        : t("share_download_post")
                      : t("share_download_card")
                    : t("share_sequence")}
              </h2>
              <div class="sequence-identity">
                <TKAWordGlyph word={glyphWord} height={glyphHeight} darkMode />
              </div>
            </div>
            <button
              type="button"
              class="header-icon"
              onclick={onClose}
              aria-label={t("share_close_sheet")}
            >
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </header>

          <!-- Home and Download are one split shell: a stage that stays mounted
               across both, and a rail whose task swaps. Publish keeps its own
               single column inside the same dialog width. -->
          <Crossfade
            key={publishFlow ? "publish" : "split"}
            duration={DURATION.normal}
            mode="swap"
            motion="step"
          >
            {#if !publishFlow}
              <div class="share-split" data-route={splitRoute}>
                {#if stageVisible}
                  <div class="stage-frame" transition:growFade={{ axis: "y" }}>
                    <div
                      class="stage"
                      class:live-card-stage={shareRoute === "download" &&
                        artifact === "card" &&
                        !!cardPreview.request}
                    >
                      <!-- A plain stack: no fill and no animateHeight, so the
                           live card keeps the real measured space the stage
                           gives it and its onReady lifecycle. -->
                      <Crossfade key={stageKey} duration={DURATION.normal}>
                        {#if splitRoute === "home"}
                          {#if homeLivePreview}
                            <div class="home-live">
                              {@render liveVideoPreview?.()}
                            </div>
                          {:else if animationPreviewUrl}
                            <img
                              class="preview"
                              src={animationPreviewUrl}
                              alt={t("share_current_sequence_view")}
                            />
                          {:else}
                            <div class="stage-empty">
                              <TKAWordGlyph
                                word={glyphWord}
                                height={glyphHeight * 2}
                                darkMode
                              />
                            </div>
                          {/if}
                        {:else if artifact === "card" && displayedCardRequest && !qrDataUrl}
                          <!-- The live SVG card measures its parent and owns its
                               intrinsic height. The host below gives it a
                               definite, capped box instead of a pinned wrapper. -->
                          {@const request = displayedCardRequest}
                          <div class="card-host">
                            {#key request.sourceRevision}
                              <LiveExportCard
                                sequence={request.sequence}
                                options={request.options}
                                revision={request.revision}
                                automaticLayout={isCardLayoutAutomatic(
                                  request.sequence.steps.length
                                )}
                                onAutoLayoutResolved={(layout, width, height) =>
                                  resolveLiveCardAutoLayout(
                                    layout,
                                    width,
                                    height,
                                    request.sourceRevision
                                  )}
                                onReady={() =>
                                  markLiveCardReady(request.sourceRevision)}
                              />
                            {/key}
                          </div>
                        {:else if qrDataUrl}
                          <div class="qr-view">
                            <img
                              src={qrDataUrl}
                              alt={t("share_qr_uploaded_file")}
                            />
                            <p>
                              {t("share_scan_phone_instagram")}
                            </p>
                            <button
                              type="button"
                              class="secondary"
                              onclick={closeQrView}
                            >
                              <i
                                class="fa-solid fa-arrow-left"
                                aria-hidden="true"
                              ></i>
                              {t("share_back_short")}
                            </button>
                          </div>
                        {:else if artifact === "video" && activeVideoUrl}
                          <!-- svelte-ignore a11y_media_has_caption -->
                          <video
                            class="preview"
                            src={activeVideoUrl}
                            autoplay
                            loop
                            muted
                            playsinline
                          ></video>
                        {:else if showingLiveVideoPreview && liveVideoPreview}
                          <div class="live-video-preview">
                            {@render liveVideoPreview()}
                          </div>
                        {:else if artifact === "video" && openerPreviewUrl}
                          <!-- This capture belongs to the viewer. The sheet only presents
                               it, and it is the exact image the clip opens with. -->
                          <img
                            class="preview"
                            src={openerPreviewUrl}
                            alt={openerEnabled
                              ? `Video opens with ${openerLabel.toLowerCase()}`
                              : t("share_current_animation_view")}
                          />
                        {:else if artifact === "video" && !videoBusy}
                          <div
                            class="stage-pending stage-refused"
                            role="status"
                          >
                            <i class="fa-solid fa-video" aria-hidden="true"></i>
                            <strong
                              >{videoStatus === "failed"
                                ? t("share_video_render_failed")
                                : t("share_animation_preview")}</strong
                            >
                            <span
                              >{videoStatus === "failed"
                                ? t("share_check_settings_retry")
                                : t("share_video_preview_after_render")}</span
                            >
                          </div>
                        {:else}
                          <div class="stage-pending" role="status">
                            <i
                              class="fa-solid fa-circle-notch fa-spin"
                              aria-hidden="true"
                            ></i>
                            <span>{progressLabel || t("share_preparing")}</span>
                          </div>
                        {/if}
                      </Crossfade>
                    </div>

                    {#if shareRoute === "download" && artifact === "video" && (videoBusy || videoStatus === "failed" || videoStatus === "canceled")}
                      <p
                        class="render-feedback"
                        role="status"
                        transition:growFade={{ axis: "y" }}
                      >
                        {videoBusy
                          ? progressLabel || t("share_rendering_animation")
                          : videoStatus === "canceled"
                            ? t("share_render_canceled")
                            : t("share_video_render_retry")}
                      </p>
                    {/if}
                  </div>
                {/if}

                <div class="rail" bind:this={sharingRail}>
                  <div class="rail-body">
                    <Crossfade
                      key={shareRoute}
                      duration={DURATION.normal}
                      mode="swap"
                      motion="step"
                    >
                      {#if shareRoute === "home"}
                        <div class="intent-list">
                          <div class="intent-grid">
                            <button
                              type="button"
                              class="intent"
                              aria-busy={copyLinkPending}
                              onclick={handleCopyLinkIntent}
                            >
                              <Crossfade
                                key={copyLinkState}
                                duration={DURATION.fast}
                                mode="crossfade"
                              >
                                <span class="intent-body">
                                  <i
                                    class={copyLinkState === "pending"
                                      ? "fa-solid fa-circle-notch fa-spin"
                                      : copyLinkState === "copied"
                                        ? "fa-solid fa-check"
                                        : "fa-solid fa-link"}
                                    aria-hidden="true"
                                  ></i>
                                  <span class="intent-label">
                                    {copyLinkState === "pending"
                                      ? t("share_copying_link")
                                      : copyLinkState === "copied"
                                        ? t("share_link_copied")
                                        : t("share_copy_link")}
                                  </span>
                                  <small
                                    class="intent-hint"
                                    class:link-value={copyLinkState ===
                                      "copied"}
                                  >
                                    {copyLinkState === "copied" && copiedLinkUrl
                                      ? displayLink(copiedLinkUrl)
                                      : t("share_link_description")}
                                  </small>
                                </span>
                              </Crossfade>
                            </button>
                            {#if onSendInTka}
                              <button
                                type="button"
                                class="intent"
                                onclick={() =>
                                  handOffAfterClose(() => onSendInTka?.())}
                              >
                                <span class="intent-body">
                                  <i
                                    class="fa-solid fa-user-group"
                                    aria-hidden="true"
                                  ></i>
                                  <span class="intent-label"
                                    >{t("share_send_friend")}</span
                                  >
                                  <small class="intent-hint"
                                    >{t("share_send_friend_hint")}</small
                                  >
                                </span>
                              </button>
                            {/if}
                            <button
                              type="button"
                              class="intent"
                              data-share-intent="download"
                              onclick={() => beginDownload(artifact)}
                            >
                              <span class="intent-body">
                                <i
                                  class="fa-solid fa-download"
                                  aria-hidden="true"
                                ></i>
                                <span class="intent-label"
                                  >{t("share_download_file")}</span
                                >
                                <small class="intent-hint"
                                  >{t("share_download_file_hint")}</small
                                >
                              </span>
                            </button>
                            <button
                              type="button"
                              class="intent"
                              data-share-intent="publish"
                              onclick={openPublish}
                            >
                              <span class="intent-body">
                                <i
                                  class="fa-solid fa-paper-plane"
                                  aria-hidden="true"
                                ></i>
                                <span class="intent-label"
                                  >{t("share_publish_socially")}</span
                                >
                                <small class="intent-hint"
                                  >{t("share_publish_hint")}</small
                                >
                              </span>
                            </button>
                          </div>
                          {#if copyLinkMessage && copyLinkMessage !== t("share_link_copied")}
                            <p
                              class="delivery-feedback"
                              role="status"
                              transition:growFade={{ axis: "y" }}
                            >
                              {copyLinkMessage}
                            </p>
                          {/if}
                          {#if revealedLinkUrl}
                            <label
                              class="link-reveal"
                              transition:growFade={{ axis: "y" }}
                            >
                              <span>{t("share_sequence_link")}</span>
                              <input
                                type="url"
                                readonly
                                value={revealedLinkUrl}
                                use:selectOnMount
                                onfocus={(event) =>
                                  event.currentTarget.select()}
                              />
                            </label>
                          {/if}
                        </div>
                      {:else if publishGate}
                        <!-- The guest gate keeps the Home shell and its preview;
                             only the rail's task changes. -->
                        <div class="publish-gate">
                          {#if !postingAvailable}
                            <p class="account-note">
                              {t("share_social_unavailable")}
                            </p>
                            <PanelButton
                              variant="primary"
                              fullWidth
                              onclick={() => beginDownload(artifact)}
                            >
                              <i class="fa-solid fa-download" aria-hidden="true"
                              ></i>
                              {t("share_download_file")}
                            </PanelButton>
                          {:else}
                            <p class="account-note">
                              {t("share_publish_needs_account")}
                            </p>
                            <PanelButton
                              variant="primary"
                              fullWidth
                              onclick={requestAccountForFile}
                            >
                              <i
                                class="fa-solid fa-user-plus"
                                aria-hidden="true"
                              ></i>
                              {t("share_create_free_account")}
                            </PanelButton>
                          {/if}
                        </div>
                      {:else}
                        <div class="rail-stack">
                          {#if !qrDataUrl}
                            {#if availableArtifacts.length > 1}
                              <fieldset class="file-type" disabled={videoBusy}>
                                <SegmentedControl
                                  options={artifactOptions}
                                  value={artifact}
                                  onchange={(value) => chooseArtifact(value)}
                                  color="accent"
                                  ariaLabel={t("share_file_type")}
                                />
                              </fieldset>
                            {/if}
                          {/if}

                          {#if !qrDataUrl}
                            <Crossfade
                              key={artifact}
                              duration={DURATION.normal}
                              animateHeight
                            >
                              {#if openerEnabled && sequence}
                                <fieldset
                                  class="opener-row"
                                  aria-label={t("share_opens_with")}
                                  disabled={videoBusy}
                                >
                                  <span id="share-video-opener"
                                    >{t("share_opens_with")}</span
                                  >
                                  <SegmentedControl
                                    options={openerOptions}
                                    value={exportOptions.videoOpener}
                                    onchange={(value) =>
                                      exportOptions.setVideoOpener(value)}
                                    color="accent"
                                    ariaLabelledby="share-video-opener"
                                  />
                                </fieldset>
                              {/if}
                              {#if artifact === "card" && sequence}
                                <!-- The same editor as the viewer's Card tab, open at every
                                     size: the card is being chosen as it is downloaded, so
                                     every setting that shapes it is on screen, not only the
                                     footer. Composition and pictograph toggles are the
                                     account defaults the Card tab writes too; the footer
                                     stays a one-share override until saved to the card. -->
                                <fieldset
                                  class="card-settings"
                                  aria-label={t("share_card_settings")}
                                >
                                  <ExportImagePanel
                                    {exportOptions}
                                    layout="inline"
                                    grouping="share"
                                    stepCount={sequence.steps?.length ?? 0}
                                    resolvedAutoLayout={resolvedCardAutoLayout}
                                    cardPresentation={shareDraft.cardPresentation}
                                    onCardPresentationChange={changeShareCardPresentation}
                                    onSaveCardPresentation={onSaveCardPresentation
                                      ? saveCardPresentation
                                      : undefined}
                                    cardPresentationDirty={shareDraft.cardPresentationDirty}
                                    cardPresentationSaving={savingCardPresentation}
                                  />
                                </fieldset>
                              {/if}
                              {#if artifact === "video" && sequence && videoSettingsAvailable}
                                <fieldset
                                  class="video-settings"
                                  aria-label={t("share_video_settings")}
                                  disabled={videoBusy}
                                >
                                  <div class="video-rows">
                                    <div class="video-row">
                                      <span id="share-video-resolution"
                                        >{t("share_resolution")}</span
                                      >
                                      <SegmentedControl
                                        options={videoResolutionOptions}
                                        value={String(
                                          exportOptions.videoResolution
                                        )}
                                        onchange={(value) =>
                                          exportOptions.setVideoResolution(
                                            Number(value) as VideoResolution
                                          )}
                                        color="accent"
                                        ariaLabelledby="share-video-resolution"
                                      />
                                    </div>
                                    <div class="video-row">
                                      <span id="share-video-fps"
                                        >{t("share_frame_rate")}</span
                                      >
                                      <SegmentedControl
                                        options={videoFpsOptions}
                                        value={String(exportOptions.videoFps)}
                                        onchange={(value) =>
                                          exportOptions.setVideoFps(
                                            Number(value) as VideoFps
                                          )}
                                        color="accent"
                                        ariaLabelledby="share-video-fps"
                                      />
                                    </div>
                                    {#if is3DExport}
                                      <div class="video-row">
                                        <span id="share-video-quality"
                                          >{t("share_quality")}</span
                                        >
                                        <SegmentedControl
                                          options={videoQualityOptions}
                                          value={exportOptions.videoQuality}
                                          onchange={(value) =>
                                            exportOptions.setVideoQuality(
                                              value
                                            )}
                                          color="accent"
                                          ariaLabelledby="share-video-quality"
                                        />
                                      </div>
                                    {/if}
                                    <div
                                      class="video-row repeat-stepper"
                                      role="group"
                                      aria-labelledby="share-video-repeats"
                                    >
                                      <span id="share-video-repeats"
                                        >{t("share_repeats")}</span
                                      >
                                      <div class="stepper-keys">
                                        <button
                                          type="button"
                                          aria-label={t(
                                            "share_decrease_repeats"
                                          )}
                                          onclick={() =>
                                            exportOptions.setVideoLoopCount(
                                              exportOptions.videoLoopCount - 1
                                            )}
                                          disabled={exportOptions.videoLoopCount <=
                                            1}>−</button
                                        ><strong
                                          >{exportOptions.videoLoopCount}</strong
                                        ><button
                                          type="button"
                                          aria-label={t(
                                            "share_increase_repeats"
                                          )}
                                          onclick={() =>
                                            exportOptions.setVideoLoopCount(
                                              exportOptions.videoLoopCount + 1
                                            )}
                                          disabled={exportOptions.videoLoopCount >=
                                            10}>+</button
                                        >
                                      </div>
                                    </div>
                                  </div>
                                  {#if videoSettingsStale}
                                    <p
                                      class="settings-note"
                                      transition:growFade={{ axis: "y" }}
                                    >
                                      {t("share_settings_changed_render")}
                                    </p>
                                  {/if}
                                </fieldset>
                              {/if}
                              {#if activeBlob && !videoSettingsStale}
                                <div
                                  class="ready-delivery"
                                  transition:growFade={{ axis: "y" }}
                                >
                                  {#if nativeShare}<PanelButton
                                      onclick={() =>
                                        runDestination("native-share")}
                                      >{artifact === "video"
                                        ? t("share_video")
                                        : t("share_card")}
                                      {t("share_via_app")}</PanelButton
                                    >{/if}
                                  {#if destinations.some((destination) => destination.id === "send-to-phone")}<PanelButton
                                      onclick={() =>
                                        runDestination("send-to-phone")}
                                      >{t("share_send_phone")}</PanelButton
                                    ><small class="transfer-note"
                                      >{t("share_upload_before_phone")}</small
                                    >{/if}
                                </div>
                              {/if}
                            </Crossfade>
                          {/if}
                        </div>
                      {/if}
                    </Crossfade>
                  </div>
                  {#if shareRoute === "download" && (!qrDataUrl || statusMessage || qrError)}
                    <footer
                      class="share-dock"
                      transition:growFade={{ axis: "y" }}
                    >
                      {#if !qrDataUrl}
                        {#if needsAccountForFiles}
                          <p class="account-note">
                            {artifact === "card"
                              ? t("share_card_needs_account")
                              : t("share_video_needs_account")}
                          </p>
                          <PanelButton
                            variant="primary"
                            fullWidth
                            onclick={requestAccountForFile}
                          >
                            <i class="fa-solid fa-user-plus" aria-hidden="true"
                            ></i>
                            {t("share_create_free_account")}
                          </PanelButton>
                        {:else if artifact === "video" && videoBusy}
                          <PanelButton fullWidth onclick={cancelVideo}>
                            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                            {t("share_cancel_render")}
                          </PanelButton>
                        {:else if artifact === "video" && (!hasVideo || videoSettingsStale)}
                          <PanelButton
                            variant="primary"
                            fullWidth
                            onclick={downloadVideo}
                          >
                            <i class="fa-solid fa-film" aria-hidden="true"></i>
                            {t("share_download_video")}
                          </PanelButton>
                        {:else if artifact === "card"}
                          <PanelButton
                            variant="primary"
                            fullWidth
                            disabled={!cardPreview.request ||
                              busyDestination !== null ||
                              qrPending}
                            ariaBusy={busyDestination === "download" ||
                              cardDownloadPending}
                            onclick={downloadCard}
                          >
                            <i
                              class={busyDestination === "download" ||
                              cardDownloadPending
                                ? "fa-solid fa-circle-notch fa-spin"
                                : cardPreview.hasError
                                  ? "fa-solid fa-rotate-right"
                                  : "fa-solid fa-download"}
                              aria-hidden="true"
                            ></i>
                            {cardPreview.hasError
                              ? t("share_retry_image")
                              : cardDownloadPending
                                ? t("share_preparing_download")
                                : busyDestination === "download"
                                  ? t("share_downloading")
                                  : t("share_download_card")}
                          </PanelButton>
                        {:else}
                          <PanelButton
                            variant="primary"
                            fullWidth
                            disabled={!activeBlob ||
                              busyDestination !== null ||
                              qrPending}
                            ariaBusy={busyDestination === "download"}
                            onclick={() => runDestination(primaryDeliveryId)}
                          >
                            <i
                              class={busyDestination === "download"
                                ? "fa-solid fa-circle-notch fa-spin"
                                : "fa-solid fa-download"}
                              aria-hidden="true"
                            ></i>
                            {busyDestination === "download"
                              ? t("share_downloading")
                              : t("share_download_video")}
                          </PanelButton>
                        {/if}
                      {/if}
                      {#if statusMessage || qrError}
                        <p
                          class="delivery-feedback"
                          role="status"
                          transition:growFade={{ axis: "y" }}
                        >
                          {qrError || statusMessage}
                        </p>
                      {/if}
                    </footer>
                  {/if}
                </div>
              </div>
            {:else}
              <div class="sheet-scroll publish-body">
                <Crossfade
                  key={publishPreparationKey}
                  duration={DURATION.normal}
                  animateHeight
                >
                  {#if artifact === "video" && videoBusy}
                    {#if activeVideoUrl || openerPreviewUrl}
                      {#if activeVideoUrl}
                        <!-- svelte-ignore a11y_media_has_caption -->
                        <video
                          class="preview publish-preview"
                          src={activeVideoUrl}
                          autoplay
                          loop
                          muted
                          playsinline
                        ></video>
                      {:else}
                        <img
                          class="preview publish-preview"
                          src={openerPreviewUrl}
                          alt={t("share_current_animation_view")}
                        />
                      {/if}
                    {/if}
                    <p class="render-feedback" role="status">
                      {progressLabel || t("share_rendering_animation")}
                    </p>
                    <PanelButton onclick={cancelVideo}>
                      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                      {t("share_cancel_render")}
                    </PanelButton>
                  {:else if artifact === "video" && videoSettingsStale}
                    <p class="render-feedback" role="status">
                      {t("share_settings_changed_publish")}
                    </p>
                    <PanelButton variant="primary" onclick={requestVideo}>
                      <i class="fa-solid fa-film" aria-hidden="true"></i>
                      {t("share_prepare_updated_video")}
                    </PanelButton>
                  {:else if artifact === "video" && activeVideoUrl}
                    <video
                      class="preview publish-preview"
                      src={activeVideoUrl}
                      autoplay
                      loop
                      muted
                      playsinline
                    ></video>
                  {:else if artifact === "card" && cardPreview.url}
                    <img
                      class="preview publish-preview"
                      src={cardPreview.url}
                      alt={t("share_card_preview")}
                    />
                  {:else}
                    <p class="render-feedback">
                      {t("share_prepare_media_account")}
                    </p>
                    <PanelButton
                      variant="primary"
                      onclick={artifact === "video"
                        ? requestVideo
                        : () => (filePreparationOpen = true)}
                      >{artifact === "video"
                        ? t("share_prepare_video")
                        : t("share_prepare_card")}</PanelButton
                    >
                  {/if}
                </Crossfade>
                {#if postingAvailable && !needsAccountForFiles && !videoBusy && !videoSettingsStale}
                  <div
                    class="publish-actions"
                    transition:growFade={{ axis: "y" }}
                  >
                    <label for="post-share-caption" class="post-caption"
                      >{t("share_post_caption")}</label
                    >
                    <textarea
                      id="post-share-caption"
                      aria-label={t("share_post_caption")}
                      value={caption}
                      oninput={(event) => {
                        shareDraft.caption = event.currentTarget.value;
                        shareDraft.captionTouched = true;
                      }}
                      rows="3"
                      placeholder={t("share_caption_placeholder")}
                    ></textarea>
                    <div class="actions">
                      {#each networks as plan (plan.key)}{@render networkButton(
                          plan
                        )}{/each}
                    </div>
                  </div>
                {/if}
                {#if onOpenPostStudio}
                  <PanelButton onclick={openPostStudio}>
                    <i
                      class="fa-solid fa-wand-magic-sparkles"
                      aria-hidden="true"
                    ></i>
                    {t("share_edit_composition")}
                  </PanelButton>
                {/if}
              </div>
            {/if}
          </Crossfade>
        </div>
      {/if}
    </Crossfade>
  {/snippet}
</ShareSheetFrame>

<style>
  .brand-mark {
    display: inline-flex;
    flex: 0 0 auto;
  }

  .brand-mark :global(svg) {
    width: 1.15em;
    height: 1.15em;
  }

  .stage-pending {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
  }

  .stage-refused {
    flex-direction: column;
    color: var(--theme-text, rgba(255, 255, 255, 0.92));
  }

  /* The live card measures this box, its parent, and caps itself to the
     explicit max-height. Auto layout then sees a stable capacity before the
     PNG exists, and a tall card scales down whole instead of being cropped or
     choosing against the entire viewport. The stage has no padding of its own
     (the animation fills it edge to edge on every route), so the card keeps
     its breathing room here: 0.75rem on each side, and the cap is the stage
     minus that inset and the border. */
  .card-host {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    width: calc(100% - 1.5rem);
    height: calc(100% - 1.5rem);
    min-width: 0;
    min-height: 0;
    max-height: calc(var(--stage-h) - 1.5rem - 2px);
  }

  .studio-launch {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.45rem 0.75rem;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b7cff) 42%, transparent);
    border-radius: 0.75rem;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b7cff) 10%,
      transparent
    );
    color: color-mix(in srgb, var(--theme-accent, #8b7cff) 70%, white);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }

  .studio-launch:hover {
    border-color: color-mix(in srgb, var(--theme-accent, #8b7cff) 74%, white);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b7cff) 17%,
      transparent
    );
  }

  .studio-launch:focus-visible {
    outline: 3px solid var(--theme-accent, #8b7cff);
    outline-offset: 2px;
  }

  .qr-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    text-align: center;
  }

  /* Let the code shrink enough to keep Back above the fold. */
  .qr-view img {
    width: min(11rem, 26vh);
    height: min(11rem, 26vh);
    border-radius: 0.75rem;
    background: #fff;
    padding: 0.5rem;
    box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, 0.45);
  }

  .qr-view p {
    margin: 0;
    max-width: 22rem;
    font-size: 0.875rem;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
  }

  .video-settings {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .video-settings:disabled {
    opacity: 0.6;
  }
  /* The thumbnail choice sits under the stage it previews. */
  .opener-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    min-width: 0;
    margin: 0;
    padding: 0 0.25rem;
    border: 0;
    color: var(--theme-text-secondary);
    font-size: var(--font-size-min, 0.875rem);
  }
  .opener-row > span {
    flex: 0 0 auto;
    font-weight: 600;
  }
  .opener-row :global(.segmented-control) {
    flex: 1 1 auto;
    min-width: 0;
  }
  .opener-row :global(.segment) {
    white-space: nowrap;
  }
  .opener-row:disabled {
    opacity: 0.6;
  }
  /* Video settings follow the card's hierarchy: always on screen, each a
     label beside its control, dropping the label above only when the rail is
     too narrow for both. The rail's own width decides, never the viewport. */
  .video-rows {
    --share-label-w: 6rem;
    container-type: inline-size;
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
  .video-row {
    display: grid;
    grid-template-columns: var(--share-label-w) minmax(0, 1fr);
    align-items: center;
    gap: 0.25rem 0.75rem;
    min-width: 0;
    color: var(--theme-text);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    line-height: 1.25;
  }
  .video-row :global(.segmented-control) {
    width: 100%;
  }
  /* Short labels like "120 fps" stay on one line inside the row. */
  .video-row :global(.segment) {
    white-space: nowrap;
  }
  @container (max-width: 21.99rem) {
    .video-row {
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
    }
  }
  .stepper-keys {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .stepper-keys strong {
    min-width: 2rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .stepper-keys button {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.5rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    font-size: 1.125rem;
    cursor: pointer;
  }
  .publish-preview {
    max-height: 20rem;
  }
  .ready-delivery {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .transfer-note {
    margin: 0;
    color: var(--theme-text-secondary);
    font-size: 0.875rem;
  }
  .settings-note {
    margin: 0.75rem 0 0;
    color: var(--theme-text-secondary);
    font-size: 0.875rem;
  }
  /* The guest gate is the rail's whole task: the note, then one full-width
     action at the dock's size. */
  .publish-gate {
    min-width: 0;
  }
  .publish-gate :global(.panel-btn) {
    min-height: 48px;
    font-size: 1rem;
    font-weight: 600;
  }
  /* The note sits above its action, never against it. */
  .account-note {
    margin: 0 0 0.75rem;
    color: var(--theme-text-secondary);
    font-size: 0.875rem;
    line-height: 1.4;
  }
  .link-reveal {
    display: grid;
    gap: 0.375rem;
    margin-top: -0.25rem;
    padding: 0 0.25rem;
  }
  .link-reveal > span {
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.68));
    font-size: 0.875rem;
  }
  .link-reveal > input {
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.75rem;
    border: 1px solid var(--theme-accent, #8b7cff);
    border-radius: 0.625rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #fff);
    font: inherit;
    font-size: 0.875rem;
  }
  .link-reveal > input:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .caption-block {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .publish-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Scroll instead of adding a layout-shifting chip row. */
  .presets {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 0.125rem;
    margin-inline: -1rem;
    padding-inline: 1rem;
  }

  .presets::-webkit-scrollbar {
    display: none;
  }

  .presets > :global(*) {
    flex: 0 0 auto;
  }

  textarea {
    width: 100%;
    /* Prevent user resizing from pushing actions below the drawer. */
    resize: none;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, #fff);
    font: inherit;
    line-height: 1.45;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
  }

  textarea::placeholder {
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.4));
  }

  textarea:focus {
    outline: none;
    border-color: var(--theme-accent, #6366f1);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--theme-accent, #6366f1) 28%, transparent);
  }

  /* Unbounded account names truncate instead of changing button height. */

  .network {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    width: 100%;
    min-height: 3.25rem;
    padding: 0.625rem 1rem;
    border: 1px solid var(--theme-stroke-strong);
    background: var(--theme-card-bg);
    color: #fff;
    font: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition:
      transform var(--duration-instant) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard),
      filter var(--duration-fast) var(--ease-standard);
  }

  .network--instagram {
    --network-fill: linear-gradient(
      118deg,
      #f9ce34 0%,
      #ee2a7b 48%,
      #6228d7 100%
    );
  }

  .network--facebook {
    --network-fill: linear-gradient(135deg, #1877f2 0%, #0b53c0 100%);
  }

  /* Preserve white-mark contrast across the Instagram gradient. */
  .network-mark {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 999px;
    background: var(--network-fill);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
    font-size: 1.0625rem;
  }

  .network-text {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
  }

  /* Unbounded account names truncate instead of changing button height. */
  .network-label,
  .network-hint {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .network-label {
    font-size: 1rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .network-hint {
    font-size: 0.8125rem;
    opacity: 0.85;
  }

  .network-chevron {
    flex: 0 0 auto;
    font-size: 0.8125rem;
    opacity: 0.7;
  }

  .network:hover:not(:disabled) {
    filter: brightness(1.08) saturate(1.05);
    box-shadow: none;
  }

  .network:active:not(:disabled) {
    transform: scale(0.985);
  }

  .network:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
  }

  .network.is-posted {
    filter: saturate(0.72);
  }

  /* Equal columns keep destination changes from reflowing the row. */
  .tiles {
    grid-auto-columns: 1fr;
  }

  .tile {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 2.75rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #fff);
    font: inherit;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      transform var(--duration-instant) var(--ease-standard);
  }

  .tile-icon {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    color: var(--theme-text, #fff);
  }

  .tile-label {
    font-weight: 500;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.72));
    white-space: nowrap;
  }

  .tile:hover:not(:disabled) {
    background: var(--theme-surface-3, rgba(255, 255, 255, 0.09));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
  }

  .tile:active:not(:disabled) {
    transform: scale(0.96);
  }

  .tile:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Account setup scrolls instead of adding an unbudgeted row. */
  .connections {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    overflow-x: auto;
    scrollbar-width: none;
    margin-inline: -1rem;
    padding-inline: 1rem;
  }

  .connections::-webkit-scrollbar {
    display: none;
  }

  .connections > :global(*) {
    flex: 0 0 auto;
  }

  .page-chip {
    position: relative;
  }

  .page-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    min-height: var(--min-touch-target);
    padding: 0.625rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 0.5rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-standard);
  }

  .page-option:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #fff);
  }

  .page-option.selected {
    color: var(--theme-text, #fff);
    font-weight: 600;
  }

  .page-option i {
    font-size: 0.625rem;
  }

  .page-option--add {
    margin-top: 0.25rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0 0 0.5rem 0.5rem;
  }

  .page-option--add:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .secondary {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    padding: 0.5rem 1.125rem;
    border-radius: 999px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    background: var(--theme-surface-2, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #fff);
    font: inherit;
    cursor: pointer;
  }

  .secondary:hover {
    background: var(--theme-surface-3, rgba(255, 255, 255, 0.12));
  }

  .sheet {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: var(--theme-text);
    background: var(--theme-panel-bg, #17171f);
  }
  /* Route Crossfade keeps the old and new task in one grid cell. Its live
     layer must still be the sheet's bounded column so Download's scroll area
     yields space to the dock on short landscapes. */
  .sheet > :global(.crossfade) {
    flex: 1 1 auto;
    min-height: 0;
  }
  .sheet > :global(.crossfade) > :global(.layer) {
    display: flex;
    flex: 1 1 auto;
    max-height: 100%;
    min-height: 0;
    overflow: hidden;
    flex-direction: column;
  }
  .delivery-feedback {
    margin: 0.5rem 0 0;
    font-size: var(--font-size-min, 0.875rem);
    color: var(--theme-text-secondary);
    text-align: center;
  }
  .sheet:focus {
    outline: none;
  }
  .panel-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    gap: 1rem;
    border-bottom: 1px solid var(--theme-stroke);
  }
  .title-group {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .panel-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 650;
    letter-spacing: -0.025em;
  }
  .sequence-identity {
    height: 22px;
    opacity: 0.7;
    overflow: hidden;
  }
  .header-icon {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: 1rem;
    cursor: pointer;
  }
  .sheet-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    padding: 1rem 1.25rem;
  }
  .menu-step {
    height: auto;
  }

  /* One shell for Home and Download. The stage is the artwork and keeps its
     box across both routes; only the rail beside it swaps. Below 900px the
     two stack: stage on top (Download only), rail underneath. */
  .share-split {
    --stage-h: clamp(11rem, 36dvh, 20rem);
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .stage-frame {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
    padding: 1rem 1.25rem 0;
  }
  .stage {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    height: var(--stage-h);
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.875rem;
    background: var(--theme-card-bg);
    overflow: hidden;
  }
  /* The stage Crossfade is a plain stack: no fill and no animateHeight, so the
     live card measures a real box instead of one that is waiting on it. */
  .stage :global(.crossfade) {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
  .stage :global(.crossfade > .layer) {
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
  }
  .home-live {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .stage-empty {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    color: var(--theme-text-dim);
  }
  .render-feedback {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    color: var(--theme-text-secondary);
    text-align: center;
  }

  .rail {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .rail-body {
    flex: 1 1 auto;
    min-height: 0;
    padding: 1rem 1.25rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .rail-body :global(.crossfade),
  .rail-body :global(.crossfade > .layer) {
    min-width: 0;
    min-height: 0;
  }
  .rail-stack {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
    min-width: 0;
  }
  .intent-list {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
    min-width: 0;
  }
  .intent-grid {
    display: grid;
    grid-template-columns: 1fr;
    grid-auto-rows: minmax(6rem, auto);
    align-content: start;
    gap: 0.75rem;
  }
  /* The phone-transfer QR is one centred column; the rail steps aside. */
  .qr-step .rail-body {
    display: none;
  }
  .qr-step .stage {
    height: auto;
    min-height: var(--stage-h);
  }
  .intent {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #fff);
    font: inherit;
    cursor: pointer;
  }
  .intent {
    display: grid;
    align-content: center;
    min-height: 6rem;
    padding: 1rem 1.125rem;
    border-radius: 0.875rem;
    text-align: left;
  }
  .intent-body {
    display: grid;
    grid-template-columns: 2.75rem minmax(0, 1fr);
    column-gap: 0.875rem;
    align-items: center;
  }
  .intent-body > i {
    grid-row: span 2;
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.75rem;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b7cff) 16%,
      transparent
    );
    font-size: 1.25rem;
    color: var(--theme-accent, #8b7cff);
  }
  .intent-label {
    font-size: 1rem;
    font-weight: 650;
  }
  /* The copied link replaces the hint in place; two lines cover both. */
  .intent-hint {
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.68));
    font-size: 0.875rem;
    line-height: 1.35;
  }
  .intent-hint.link-value {
    color: var(--theme-text, #fff);
    overflow-wrap: anywhere;
  }
  .intent:hover:not(:disabled) {
    border-color: var(--theme-accent, #8b7cff);
    background: var(--theme-surface-hover, rgba(255, 255, 255, 0.1));
  }
  .intent:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  /* Card / Video: one full-width two-part switch at the top of the column. */
  .file-type {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .file-type :global(.segmented-control) {
    width: 100%;
  }
  .file-type:disabled {
    opacity: 0.55;
  }
  .preview {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: 100%;
    height: 100%;
    min-height: 0;
    object-fit: contain;
    border-radius: 0.25rem;
  }
  /* The supplied stage lives in the host's style scope, so this boundary owns
     the dimensions that keep the canvas useful across share-sheet layouts. */
  .stage :global(.live-video-preview) {
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  .stage-pending {
    text-align: center;
    font-size: 0.875rem;
    padding: 1rem;
  }
  .stage-refused {
    gap: 0.75rem;
  }
  .card-settings {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .content-heading {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .optional-label {
    font-size: 0.75rem;
    color: var(--theme-text-dim);
  }
  textarea {
    height: 4.75rem;
    min-height: 4.75rem;
    padding: 0.75rem;
    font-size: 1rem;
    border-radius: 0.625rem;
    background: var(--theme-card-bg);
  }
  .preset-toggle {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-self: start;
  }
  .presets {
    flex-wrap: wrap;
    overflow: visible;
    margin: 0;
    padding: 0;
    gap: 0.5rem;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .actions:empty {
    display: none;
  }
  .destination-heading {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--theme-text-dim);
  }
  .tiles {
    display: grid;
    grid-auto-flow: row;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
    gap: 0.5rem;
  }
  .tile {
    flex-direction: column;
    padding: 0.75rem 0.25rem;
    gap: 0.5rem;
    border-radius: 0.625rem;
    background: var(--theme-card-bg);
  }
  .tile-icon {
    background: none;
    border-radius: 0;
    font-size: 1.125rem;
  }
  .tile-label {
    font-size: 0.875rem;
  }
  .tile-hint {
    display: block;
    max-width: 100%;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.62));
    font-size: 0.875rem;
    line-height: 1.25;
    text-align: center;
  }
  .connections {
    flex-wrap: wrap;
    overflow: visible;
    margin: 0;
    padding: 0;
  }
  .network {
    box-shadow: none;
    border-radius: 0.625rem;
  }
  .share-dock {
    flex: 0 0 auto;
    padding: 0.75rem 1.25rem max(0.375rem, env(safe-area-inset-bottom));
    border-top: 1px solid var(--theme-stroke);
  }
  .share-dock :global(.panel-btn) {
    min-height: 48px;
    font-size: 1rem;
    font-weight: 600;
  }
  .header-icon:focus-visible,
  .tile:focus-visible,
  .network:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
  @media (min-width: 900px) {
    .panel-header {
      padding: 1.25rem 1.75rem;
    }
    .title-group {
      flex-direction: row;
      align-items: center;
      gap: 1rem;
    }
    .panel-title {
      /* Download video is the widest route label. Reserve it so changing
         Card to Video cannot push the word mark on desktop. */
      min-inline-size: 10rem;
      font-size: 1.25rem;
    }
    .sheet-scroll {
      padding: 1.125rem 1.5rem;
    }
    /* Publish is a plain container: a centred column with room around it. It
       carries no button styling of its own. */
    .sheet-scroll.publish-body {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
      padding: 1.5rem 1.75rem;
      max-width: 42rem;
      width: 100%;
      box-sizing: border-box;
      align-items: stretch;
      margin-inline: auto;
    }
    /* Side by side: the stage takes the open canvas, the rail keeps a fixed
       reading column. The viewport sets the stage height. Home's rail is held
       to that height; Download's rail takes the height its settings need,
       up to the sheet, so the card settings and the action fit without an
       inner scrollbar. Only a sheet too short for them scrolls the rail body,
       with the dock pinned beneath it. */
    .share-split {
      --stage-cap: 34rem;
      --stage-h: clamp(
        11rem,
        min(calc(var(--viewport-height, 100dvh) - 11rem), var(--stage-cap)),
        54rem
      );
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(20rem, 24rem);
      grid-template-rows: minmax(0, 1fr);
      align-items: start;
      column-gap: 1.5rem;
      padding: 1.25rem 1.75rem;
    }
    .stage-frame {
      padding: 0;
    }
    /* It sits on the dialog itself: the stage and the choices are the only
       outlined surfaces, so the column reads as content, not an empty box. */
    .rail {
      align-self: stretch;
      min-height: 0;
      overflow: hidden;
    }
    .share-split[data-route="home"] .rail {
      align-self: start;
      contain: size;
      height: var(--stage-h);
    }
    /* Content-sized: the dock follows the last control instead of sitting at
       the far end of a void. */
    .rail-body {
      flex: 0 1 auto;
      padding: 0.25rem 0.25rem 0.25rem 0.25rem;
    }
    .share-split[data-route="home"]:not(:has(.stage-frame)) {
      grid-template-columns: minmax(0, 1fr);
    }
    .share-dock {
      padding: 0.75rem 0 0;
    }
    .qr-step .share-split {
      grid-template-columns: minmax(0, 1fr);
    }
    .qr-step .rail {
      height: auto;
      contain: none;
    }
  }
  /* Wide canvases recompose rather than magnify: the dialog widens (see
     ShareSheetFrame), the stage cap and the rail grow together, and the
     controls keep their size. The stage-to-rail ratio stays near 1.4 instead
     of the preview racing ahead of a fixed-size column. */
  @media (min-width: 1680px) and (min-height: 1000px) {
    .share-split {
      --stage-cap: 38rem;
      grid-template-columns: minmax(0, 1fr) minmax(22rem, 26rem);
    }
  }
  @media (min-width: 2600px) and (min-height: 1600px) {
    .share-split {
      --stage-cap: 46rem;
      grid-template-columns: minmax(0, 1fr) minmax(24rem, 28rem);
    }
  }
  /* Desktop with height to spare: on Home the three choices share the stage's
     full height, so the column ends where the preview ends instead of leaving
     the lower right empty. Content scales modestly and sits centred in each
     card. Download keeps its content-hugging column. */
  @media (min-width: 900px) and (min-height: 561px) {
    .share-split[data-route="home"] .rail-body {
      flex: 1 1 auto;
    }
    .share-split[data-route="home"] .rail-body :global(.crossfade),
    .share-split[data-route="home"] .rail-body :global(.crossfade > .layer),
    .share-split[data-route="home"] .intent-list {
      height: 100%;
    }
    .share-split[data-route="home"] .intent-grid {
      height: 100%;
      grid-auto-rows: minmax(6rem, 1fr);
      align-content: stretch;
    }
    .share-split[data-route="home"] .intent {
      align-content: center;
    }
    .share-split[data-route="home"] .intent-body {
      grid-template-columns: 3.25rem minmax(0, 1fr);
      column-gap: 1rem;
    }
    .share-split[data-route="home"] .intent-body > i {
      width: 3.25rem;
      height: 3.25rem;
      font-size: 1.5rem;
    }
    .share-split[data-route="home"] .intent-label {
      font-size: 1.125rem;
    }
    .share-split[data-route="home"] .intent-hint {
      font-size: 0.9375rem;
    }
  }
  /* Short landscape: one column of compact rows, so every choice fits beside
     the stage without scrolling. Never a grid of narrow cards. The stage is a
     square about as tall as the row stack, and the width it frees goes to the
     rows so their hints fit on a line (and wrap, never clip, when they do not). */
  @media (min-width: 900px) and (max-height: 560px) {
    .share-split {
      --stage-h: clamp(
        8rem,
        calc(var(--viewport-height, 100dvh) - 9.5rem),
        14rem
      );
      grid-template-columns: var(--stage-h) minmax(0, 1fr);
      padding-block: 0.75rem;
    }
    .intent-grid {
      gap: 0.5rem;
      grid-auto-rows: minmax(var(--min-touch-target, 44px), auto);
    }
    .intent {
      min-height: var(--min-touch-target, 44px);
      padding: 0.5rem 0.75rem;
    }
    .intent-body {
      grid-template-columns: 2rem minmax(0, 1fr);
      column-gap: 0.75rem;
    }
    .intent-body > i {
      width: 2rem;
      height: 2rem;
      font-size: 1rem;
    }
  }
  @media (max-height: 500px) {
    .panel-header {
      padding-block: 0.5rem;
    }
    .sheet-scroll {
      padding-block: 0.75rem;
    }
    .share-dock {
      padding-block: 0.5rem;
    }
  }
  @media (max-width: 899px) {
    .share-dock {
      padding-inline: 1.25rem;
    }
    /* Phone: Home carries the animation as a compact strip above the choices;
       Download grows the same stage to its working height. Only the stage's
       height moves, through the shared transition token. */
    .share-split[data-route="home"] {
      --stage-h: 11.5rem;
    }
    .stage {
      transition: height var(--transition-normal);
    }
    .intent-grid {
      grid-auto-rows: minmax(4.5rem, auto);
      gap: 0.5rem;
    }
    .intent {
      min-height: 4.5rem;
      padding: 0.75rem 1rem;
    }
    .intent-hint {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
    }
    .intent-hint.link-value {
      display: block;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition: none !important;
    }
  }
</style>
