<!-- Owns the artifact, caption, and destination handoff for every sequence
     viewer. Rendering stays asynchronous, and fixed preview/status geometry
     prevents state changes from moving the sheet. -->
<script lang="ts">
  import { onDestroy, untrack, type Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { growFade } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import ShareSheetFrame from "./ShareSheetFrame.svelte";
  import {
    getExportOptionsState,
    type VideoFps,
    type VideoResolution,
    type VideoQuality,
  } from "$lib/shared/animation-panel/state/export-options-state.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import InstagramIcon from "$lib/shared/auth/components/icons/InstagramIcon.svelte";
  import FacebookIcon from "$lib/shared/auth/components/icons/FacebookIcon.svelte";
  import InstagramPostReview from "$lib/shared/share/components/instagram/InstagramPostReview.svelte";
  import { createPostDeliveryState } from "$lib/shared/share/state/post-delivery-state.svelte";
  import { setPostDeliveryContext } from "$lib/shared/share/context/post-delivery-context";
  import { hasDecodableAudioTrack } from "$lib/shared/media-composition/services/media-audio-inspector";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { deriveWord } from "$lib/shared/foundation/services/word-deriver";
  import { getVideoUploader } from "$lib/shared/share/get-video-uploader";
  import { getQRCodeGenerator } from "$lib/shared/qr/get-qr-code-generator";
  import { getShortCodeManager } from "$lib/shared/qr/get-short-code-manager";
  import { getCaptionPresetManager } from "$lib/shared/share/state/caption-presets.svelte";
  import { createCardPreviewState } from "$lib/shared/share/state/card-preview-state.svelte";
  import LiveExportCard from "$lib/shared/share/components/LiveExportCard.svelte";
  import { isCardLayoutAutomatic } from "$lib/shared/share/services/card-render-options";
  import { createPostShareDraftState } from "$lib/shared/share/state/post-share-draft-state.svelte";
  import ExportImagePanel from "$lib/shared/sequence-viewer/components/ExportImagePanel.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import {
    cardPresentationFromFooterSettings,
    type CardPresentation,
  } from "$lib/shared/share/domain/models/card-presentation";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
  import { VIEWER_STATE_PARAM_NAMES } from "$lib/shared/sequence-viewer/services/viewer-url-state-codec";
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
  } from "$lib/shared/share/services/post-handoff";
  import { getUser } from "$lib/shared/auth/state/auth-state.svelte";
  import {
    planFileRequest,
    pendingVideoDownloadOutcome,
    videoDownloadSettingsKey,
  } from "$lib/shared/share/domain/video-download-intent";
  import { pendingCardDownloadOutcome } from "$lib/shared/share/domain/card-download-intent";
  import {
    VIDEO_OPENER_OPTIONS,
    openerAddsHold,
    openerCoverOffsetMs,
    type VideoOpener,
    type VideoRenderRequest,
  } from "$lib/shared/share/domain/video-opener";
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
  } from "$lib/shared/share/services/meta-publish";

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
    videoLabel = "Video",
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
  const artifactOptions = $derived(
    shareDraft.availableArtifacts.map((value) => ({
      value,
      label: value === "card" ? "Card" : videoLabel,
    }))
  );
  let cardSettingsOpen = $state(false);
  let presetsOpen = $state(false);
  /** Opening Share must not spend a render on a link or sequence handoff. */
  let filePreparationOpen = $state(false);
  type ShareRoute = "home" | "download" | "link" | "publish";
  let shareRoute = $state<ShareRoute>("home");
  let pendingDownload = $state(false);
  let pendingDownloadVersion = $state<number | null>(null);
  let pendingDownloadSettingsKey = $state<string | null>(null);
  let pendingDownloadSourceKey = $state<string | null>(null);
  let animationPreviewUrl = $state<string | null>(null);
  /** Captured once per session and choice; "this frame" is the preview itself. */
  let openerPreviews = $state<Partial<Record<VideoOpener, string>>>({});
  let openerCaptureSession = 0;
  const openerOptions = [...VIDEO_OPENER_OPTIONS];
  let videoSettingsOpen = $state(false);
  // A tall sheet has room to show the settings without a disclosure.
  const roomySheet = new MediaQuery("(min-height: 760px)");
  // Keep phone downloads focused on the artifact; a roomy desktop can show the
  // card controls without making people open a second layer.
  const roomyCardSheet = new MediaQuery(
    "(min-width: 900px) and (min-height: 760px)"
  );
  const cardSettingsExpanded = $derived(
    cardSettingsOpen || roomyCardSheet.current
  );
  const videoSettingsExpanded = $derived(
    videoSettingsOpen || roomySheet.current
  );
  const videoResolutionOptions: { value: VideoResolution; label: string }[] = [
    { value: 720, label: "720p" },
    { value: 1080, label: "1080p" },
    { value: 2160, label: "4K" },
    { value: 4320, label: "8K" },
  ];
  const videoFpsOptions: { value: VideoFps; label: string }[] = [
    { value: 30, label: "30 fps" },
    { value: 60, label: "60 fps" },
    { value: 120, label: "120 fps" },
  ];
  const videoQualityOptions: { value: VideoQuality; label: string }[] = [
    { value: "standard", label: "Standard" },
    { value: "cinema", label: "Cinema" },
  ];
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
      statusMessage = "Couldn't render the card";
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
        label: "Review for Instagram",
        hint: `@${instagram.username}`,
        kind: "review",
        target: "instagram",
      });
    } else if (postingAvailable) {
      plans.push({
        key: "instagram",
        brand: "instagram",
        name: "Instagram",
        label: "Connect professional Instagram",
        hint: "Creator or business account",
        kind: "connect",
        target: "instagram",
      });
    } else if (destinations.some((d) => d.id === "send-to-phone")) {
      plans.push({
        key: "instagram",
        brand: "instagram",
        name: "Instagram",
        label: "Send to Instagram",
        hint: "Scan the code, post from your phone",
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
        label: "Post to Facebook",
        hint: page.selectedPageName || "Your Page",
        kind: "post",
        target: "facebook-page",
      });
    } else if (page) {
      plans.push({
        key: "facebook",
        brand: "facebook",
        name: "Facebook",
        label: "Choose a Page",
        hint: "Pick where your posts land",
        kind: "choose-page",
        target: "facebook-page",
      });
    } else if (postingAvailable) {
      plans.push({
        key: "facebook",
        brand: "facebook",
        name: "Facebook",
        label: "Connect Facebook",
        hint: "Post to your Page",
        kind: "connect",
        target: "facebook-page",
      });
    } else if (destinations.some((d) => d.id === "copy-image-facebook")) {
      plans.push({
        key: "facebook",
        brand: "facebook",
        name: "Facebook",
        label: "Open Facebook",
        hint: "Paste the image, then use Copy caption",
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

  const previewReady = $derived(
    !qrDataUrl &&
      ((artifact === "card" && !!cardPreview.request) ||
        (artifact === "video" && !!activeVideoUrl))
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
  const openerLabel = $derived(
    VIDEO_OPENER_OPTIONS.find((option) => option.value === opener)?.label ??
      "First beat"
  );
  /** The stage shows exactly the image the clip will open with. */
  const openerPreviewUrl = $derived(
    openerEnabled && opener !== "this-frame"
      ? (openerPreviews[opener] ?? animationPreviewUrl)
      : animationPreviewUrl
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
    if (!openerEnabled || shareRoute === "home") return;
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
      return `Rendering ${videoLabel.toLowerCase()}… ${Math.round(exportProgress * 100)}%`;
    }
    return `Rendering ${videoLabel.toLowerCase()}…`;
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
    cardSettingsOpen = false;
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
      copyLinkMessage = "Save this sequence to create a shareable link.";
      return;
    }

    const session = linkSession;
    const target = sequence;
    const viewerUrl = shareUrl;
    copyLinkPending = true;
    copyLinkMessage = "";
    try {
      const result = copyLinkUrl
        ? await copyLink(copyLinkUrl)
        : await copyPreparedLink(
            requestPostLink().then((url) => buildCopyLinkUrl(url, viewerUrl))
          );

      if (target && linkSessionIsCurrent(session, target) && result.message) {
        copyLinkMessage = result.message;
        if (result.status === "failed") {
          const fallbackUrl =
            copyLinkUrl || buildCopyLinkUrl(shortUrl || viewerUrl, viewerUrl);
          if (fallbackUrl) {
            revealedLinkUrl = fallbackUrl;
            copyLinkMessage = "Copy it from the link below";
          }
        }
      }
    } catch {
      if (!target || linkSessionIsCurrent(session, target)) {
        copyLinkMessage = "Couldn't copy the link. Try again.";
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

  function returnToChooser(): void {
    if (videoBusy || isExportingVideo) cancelVideo();
    filePreparationOpen = false;
    shareRoute = "home";
    captionOpen = false;
    publishOpen = false;
    qrDataUrl = null;
    qrError = "";
    statusMessage = "";
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
        statusMessage = "Prepare the updated video before publishing.";
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
    statusMessage = "Download the post, then finish it in Instagram.";
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
      statusMessage = "Couldn't render the card. Try again.";
      return;
    }
    if (outcome === "deliver") void runDestination("download");
  });

  $effect(() => {
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
      statusMessage =
        "Settings or the current view changed while rendering. Download again to prepare the updated file.";
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
        statusMessage = "Card footer saved";
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
    statusMessage = "Saved as a preset";
  }

  function removePreset(preset: (typeof presets)[number]): void {
    if (!preset.template) return;
    captions.removeCustomPreset(preset.template);
    statusMessage = "Preset removed";
  }

  async function sendToPhone(): Promise<void> {
    const blob = activeBlob;
    if (!blob || !sequence?.id) {
      qrError = "Save this sequence first so it has somewhere to upload to.";
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
      qrError = "Couldn't prepare the handoff. Sign in and try again.";
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
      statusMessage = "Couldn't finish sharing. Try again.";
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
        ? "Prepare the updated video before publishing."
        : "Prepare media before choosing an account.";
      return;
    }
    if (!sequence?.id) {
      statusMessage =
        "Save this sequence first so it has somewhere to upload to.";
      return;
    }

    postingTarget = target;
    statusMessage = "";
    postStage = "Uploading…";

    try {
      // Reject unsupported containers before paying for upload and processing.
      if (artifact === "video" && blob.type && !blob.type.includes("mp4")) {
        statusMessage =
          "This video isn't in a format Instagram or Facebook accepts.";
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
        artifact === "video" ? "Meta is processing the video…" : "Posting…";
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
        target === "instagram" ? "Posted to Instagram" : "Posted to your Page";
    } catch (error) {
      console.error("[PostShareSheet] Direct post failed:", error);
      statusMessage =
        error instanceof MetaPublishClientError
          ? error.message
          : "Couldn't post that. Try again.";
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
      statusMessage = account ? `Connected ${account}` : "Connected";
    } catch (error) {
      statusMessage =
        error instanceof MetaPublishClientError
          ? error.message
          : "Couldn't connect that account.";
    } finally {
      connectingTarget = null;
    }
  }

  async function forgetTarget(target: MetaPublishTarget): Promise<void> {
    connectingTarget = target;
    try {
      await disconnectMetaAccount(target);
      statusMessage = "Disconnected";
    } catch {
      statusMessage = "Couldn't disconnect that account.";
    } finally {
      connectingTarget = null;
    }
  }

  async function handlePageChange(pageId: string): Promise<void> {
    pageMenuOpen = false;
    try {
      await selectFacebookPage(pageId);
    } catch {
      statusMessage = "Couldn't switch Page.";
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
      statusMessage = account ? `Connected ${account}` : "Connected";
    } catch (error) {
      statusMessage =
        error instanceof MetaPublishClientError
          ? error.message
          : "Couldn't reopen the Page list.";
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
    ? "Publish a post"
    : shareRoute === "link"
      ? "Share a link"
      : shareRoute === "download"
        ? `Download ${artifact === "video" ? (videoSettingsAvailable ? "animation" : "post") : "card"}`
        : "Share sequence"}
  {onClose}
  onClosed={runPendingHandoff}
  narrow={!!qrDataUrl}
  compact={shareRoute === "home" && !qrDataUrl}
  focused={shareRoute === "download" ||
    shareRoute === "link" ||
    shareRoute === "publish"}
  wide={shareRoute === "download"}
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
            <div class="title-group">
              <h2 class="panel-title">
                {shareRoute === "publish"
                  ? "Publish a post"
                  : shareRoute === "link"
                    ? "Share a link"
                    : shareRoute === "download"
                      ? `Download ${artifact === "video" ? (videoSettingsAvailable ? "animation" : "post") : "card"}`
                      : "Share sequence"}
              </h2>
              <div class="sequence-identity">
                <TKAWordGlyph word={glyphWord} height={glyphHeight} darkMode />
              </div>
            </div>
            <button
              type="button"
              class="header-close"
              onclick={onClose}
              aria-label="Close share sheet"
            >
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </header>

          <Crossfade
            key={shareRoute === "download"
              ? `download:${qrDataUrl ? "phone" : "file"}`
              : shareRoute}
            duration={DURATION.normal}
            mode="swap"
            motion="step"
          >
            {#if shareRoute === "home"}
              <div class="share-intents">
                {#if animationPreviewUrl}
                  <img
                    class="home-preview"
                    src={animationPreviewUrl}
                    alt="Current sequence view"
                  />
                {/if}
                <div class="intent-grid">
                  <button
                    type="button"
                    class="intent"
                    onclick={() => beginDownload(artifact)}
                  >
                    <i class="fa-solid fa-download" aria-hidden="true"></i>
                    <span>Download a file</span>
                    <small>Save the current view as a video or card image</small
                    >
                  </button>
                  <button
                    type="button"
                    class="intent"
                    disabled={busyLocalTile !== null || copyLinkPending}
                    onclick={() => (shareRoute = "link")}
                  >
                    <i class="fa-solid fa-link" aria-hidden="true"></i>
                    <span>Share a link</span>
                    <small>Open this exact view or send it to a friend</small>
                  </button>
                  <button type="button" class="intent" onclick={openPublish}>
                    <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
                    <span>Publish socially</span>
                    <small>Write a caption and choose a connected account</small
                    >
                  </button>
                </div>
              </div>
            {:else if shareRoute === "link"}
              <div class="sheet-scroll link-route">
                <button
                  type="button"
                  class="back-to-chooser"
                  onclick={returnToChooser}
                  ><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back
                  to sharing</button
                >
                <p class="link-description">
                  Anyone with this link opens the current sequence view.
                </p>
                <PanelButton
                  variant="primary"
                  fullWidth
                  disabled={copyLinkPending}
                  onclick={handleCopyLinkIntent}
                >
                  <i
                    class={copyLinkPending
                      ? "fa-solid fa-circle-notch fa-spin"
                      : copyLinkMessage === "Link copied"
                        ? "fa-solid fa-check"
                        : "fa-solid fa-copy"}
                    aria-hidden="true"
                  ></i>
                  {copyLinkPending
                    ? "Copying link…"
                    : copyLinkMessage === "Link copied"
                      ? "Link copied"
                      : "Copy link"}
                </PanelButton>
                {#if copyLinkMessage && copyLinkMessage !== "Link copied"}
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
                    <span>Sequence link</span>
                    <input
                      type="url"
                      readonly
                      value={revealedLinkUrl}
                      use:selectOnMount
                      onfocus={(event) => event.currentTarget.select()}
                    />
                  </label>
                {/if}
                {#if onSendInTka}
                  <PanelButton
                    onclick={() => handOffAfterClose(() => onSendInTka?.())}
                  >
                    <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
                    Send to a friend
                  </PanelButton>
                {/if}
              </div>
            {:else if shareRoute === "download"}
              <div
                class="sheet-scroll"
                class:download-route={true}
                class:card-preparation={artifact === "card"}
                class:video-preparation={artifact === "video"}
                class:has-preview={previewReady ||
                  !!animationPreviewUrl ||
                  showingLiveVideoPreview}
              >
                <div class="preview-column">
                  {#if !qrDataUrl}
                    <div class="preparation-toolbar">
                      {#if initialEntry === "chooser"}
                        <button
                          type="button"
                          class="back-to-chooser"
                          onclick={returnToChooser}
                        >
                          <i class="fa-solid fa-arrow-left" aria-hidden="true"
                          ></i>
                          Back to sharing
                        </button>
                      {/if}
                      {#if availableArtifacts.length > 1}
                        <fieldset class="file-type" disabled={videoBusy}>
                          <span id="share-file-type">File type</span>
                          <SegmentedControl
                            options={artifactOptions}
                            value={artifact}
                            onchange={(value) => chooseArtifact(value)}
                            color="accent"
                            size="sm"
                            ariaLabelledby="share-file-type"
                          />
                        </fieldset>
                      {/if}
                    </div>
                  {/if}

                  <Crossfade
                    key={artifact}
                    duration={DURATION.normal}
                    animateHeight
                  >
                    <div
                      class="stage"
                      class:showing-media={!!previewReady ||
                        showingLiveVideoPreview}
                      class:video-placeholder={artifact === "video" &&
                        !activeVideoUrl &&
                        !showingLiveVideoPreview &&
                        !qrDataUrl}
                      class:live-video-stage={showingLiveVideoPreview}
                      class:live-card-stage={artifact === "card" &&
                        !!cardPreview.request}
                    >
                      {#if artifact === "card" && displayedCardRequest && !qrDataUrl}
                        <!-- The live SVG card owns its measured intrinsic desktop
                           height. Keep it out of a stacked stage wrapper. -->
                        {@const request = displayedCardRequest}
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
                      {:else}
                        <Crossfade
                          key={qrDataUrl
                            ? "phone"
                            : `video:${activeVideoUrl ? "ready" : showingLiveVideoPreview ? "live" : openerPreviewUrl ? "opener" : videoStatus}`}
                          duration={DURATION.normal}
                          fill={!!(
                            qrDataUrl ||
                            activeVideoUrl ||
                            showingLiveVideoPreview ||
                            openerPreviewUrl
                          )}
                          animateHeight
                        >
                          {#if qrDataUrl}
                            <div class="qr-view">
                              <img
                                src={qrDataUrl}
                                alt="QR code linking to the uploaded file"
                              />
                              <p>
                                Scan with your phone, save it, then post from
                                Instagram.
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
                                Back
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
                                : "Current animation view"}
                            />
                          {:else if artifact === "video" && !videoBusy}
                            <div
                              class="stage-pending stage-refused"
                              role="status"
                            >
                              <i class="fa-solid fa-video" aria-hidden="true"
                              ></i>
                              <strong
                                >{videoStatus === "failed"
                                  ? "Video could not be rendered"
                                  : "Animation preview"}</strong
                              >
                              <span
                                >{videoStatus === "failed"
                                  ? "Check the settings and try again."
                                  : "Your video preview appears after rendering."}</span
                              >
                            </div>
                          {:else}
                            <div class="stage-pending" role="status">
                              <i
                                class="fa-solid fa-circle-notch fa-spin"
                                aria-hidden="true"
                              ></i>
                              <span>{progressLabel || "Preparing…"}</span>
                            </div>
                          {/if}
                        </Crossfade>
                      {/if}
                    </div>
                  </Crossfade>

                  {#if artifact === "video" && (videoBusy || videoStatus === "failed" || videoStatus === "canceled")}
                    <p
                      class="render-feedback"
                      role="status"
                      transition:growFade={{ axis: "y" }}
                    >
                      {videoBusy
                        ? progressLabel || "Rendering animation…"
                        : videoStatus === "canceled"
                          ? "Render canceled"
                          : "Video could not be rendered. Check the settings and try again."}
                    </p>
                  {/if}
                </div>
                <div class="editing-column">
                  {#if !qrDataUrl}
                    <Crossfade
                      key={artifact}
                      duration={DURATION.normal}
                      animateHeight
                    >
                      {#if openerEnabled && sequence}
                        <fieldset
                          class="opener-row"
                          aria-label="Opens with"
                          disabled={videoBusy}
                        >
                          <span id="share-video-opener">Opens with</span>
                          <SegmentedControl
                            options={openerOptions}
                            value={exportOptions.videoOpener}
                            onchange={(value) =>
                              exportOptions.setVideoOpener(value)}
                            color="accent"
                            size="sm"
                            ariaLabelledby="share-video-opener"
                          />
                        </fieldset>
                      {/if}
                      {#if artifact === "card" && sequence}
                        <!-- The same editor as the viewer's Card tab, folded the way
                       Video settings is: the card is being chosen as it is
                       downloaded, so every setting that shapes it is here, not
                       only the footer. Composition and pictograph toggles are
                       the account defaults the Card tab writes too; the footer
                       stays a one-share override until saved to the card. -->
                        <fieldset
                          class="card-settings"
                          aria-label="Card settings"
                        >
                          {#if roomyCardSheet.current}
                            <div class="settings-heading">
                              Card settings
                              <span class="setting-value"
                                >{exportOptions.imageDarkMode
                                  ? "Dark"
                                  : "Light"} · Footer
                                {shareDraft.cardPresentation.footer.mode ===
                                "off"
                                  ? "off"
                                  : shareDraft.cardPresentation.footer.mode ===
                                      "credit"
                                    ? "credit"
                                    : "custom"}</span
                              >
                            </div>
                          {:else}
                            <PanelButton
                              fullWidth
                              ariaExpanded={cardSettingsOpen}
                              onclick={() =>
                                (cardSettingsOpen = !cardSettingsOpen)}
                            >
                              <i class="fa-solid fa-sliders" aria-hidden="true"
                              ></i>
                              Card settings
                              <span class="setting-value"
                                >{exportOptions.imageDarkMode
                                  ? "Dark"
                                  : "Light"} · Footer
                                {shareDraft.cardPresentation.footer.mode ===
                                "off"
                                  ? "off"
                                  : shareDraft.cardPresentation.footer.mode ===
                                      "credit"
                                    ? "credit"
                                    : "custom"}</span
                              >
                              <i
                                class={cardSettingsOpen
                                  ? "fa-solid fa-chevron-up"
                                  : "fa-solid fa-chevron-down"}
                                aria-hidden="true"
                              ></i>
                            </PanelButton>
                          {/if}
                          {#if cardSettingsExpanded}
                            <div
                              class="disclosure-body"
                              transition:growFade={{ axis: "y" }}
                            >
                              <ExportImagePanel
                                {exportOptions}
                                layout="inline"
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
                            </div>
                          {/if}
                        </fieldset>
                      {/if}
                      {#if artifact === "video" && sequence && videoSettingsAvailable}
                        <fieldset
                          class="video-settings"
                          aria-label="Video settings"
                          disabled={videoBusy}
                        >
                          {#if roomySheet.current}
                            <div class="settings-heading">
                              Video settings
                              <span class="setting-value"
                                >{exportOptions.videoResolution}p · {exportOptions.videoFps}
                                fps · {exportOptions.videoLoopCount}×{is3DExport
                                  ? ` · ${exportOptions.videoQuality}`
                                  : ""}</span
                              >
                            </div>
                          {:else}
                            <PanelButton
                              fullWidth
                              ariaExpanded={videoSettingsOpen}
                              onclick={() =>
                                (videoSettingsOpen = !videoSettingsOpen)}
                            >
                              Video settings
                              <span class="setting-value"
                                >{exportOptions.videoResolution}p · {exportOptions.videoFps}
                                fps · {exportOptions.videoLoopCount}×{is3DExport
                                  ? ` · ${exportOptions.videoQuality}`
                                  : ""}</span
                              >
                              <i
                                class={videoSettingsOpen
                                  ? "fa-solid fa-chevron-up"
                                  : "fa-solid fa-chevron-down"}
                                aria-hidden="true"
                              ></i>
                            </PanelButton>
                          {/if}
                          {#if videoSettingsExpanded}<div
                              class="compact-settings"
                              transition:growFade={{ axis: "y" }}
                            >
                              <div class="video-setting">
                                <span id="share-video-resolution"
                                  >Resolution</span
                                >
                                <SegmentedControl
                                  options={videoResolutionOptions}
                                  value={exportOptions.videoResolution}
                                  onchange={(value) =>
                                    exportOptions.setVideoResolution(value)}
                                  color="accent"
                                  size="sm"
                                  ariaLabelledby="share-video-resolution"
                                />
                              </div>
                              <div class="video-setting">
                                <span id="share-video-fps">Frame rate</span>
                                <SegmentedControl
                                  options={videoFpsOptions}
                                  value={exportOptions.videoFps}
                                  onchange={(value) =>
                                    exportOptions.setVideoFps(value)}
                                  color="accent"
                                  size="sm"
                                  ariaLabelledby="share-video-fps"
                                />
                              </div>
                              {#if is3DExport}
                                <div class="video-setting">
                                  <span id="share-video-quality">Quality</span>
                                  <SegmentedControl
                                    options={videoQualityOptions}
                                    value={exportOptions.videoQuality}
                                    onchange={(value) =>
                                      exportOptions.setVideoQuality(value)}
                                    color="accent"
                                    size="sm"
                                    ariaLabelledby="share-video-quality"
                                  />
                                </div>
                              {/if}
                              <div class="repeat-stepper">
                                <span>Repeats</span><button
                                  type="button"
                                  aria-label="Decrease repeats"
                                  onclick={() =>
                                    exportOptions.setVideoLoopCount(
                                      exportOptions.videoLoopCount - 1
                                    )}
                                  disabled={exportOptions.videoLoopCount <= 1}
                                  >−</button
                                ><strong>{exportOptions.videoLoopCount}</strong
                                ><button
                                  type="button"
                                  aria-label="Increase repeats"
                                  onclick={() =>
                                    exportOptions.setVideoLoopCount(
                                      exportOptions.videoLoopCount + 1
                                    )}
                                  disabled={exportOptions.videoLoopCount >= 10}
                                  >+</button
                                >
                              </div>
                            </div>{/if}
                          {#if videoSettingsStale}
                            <p
                              class="settings-note"
                              transition:growFade={{ axis: "y" }}
                            >
                              Settings changed. Download will render a new file.
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
                              onclick={() => runDestination("native-share")}
                              >Share {artifact === "video"
                                ? "video"
                                : "card"}…</PanelButton
                            >{/if}
                          {#if destinations.some((destination) => destination.id === "send-to-phone")}<PanelButton
                              onclick={() => runDestination("send-to-phone")}
                              >Send to phone</PanelButton
                            ><small class="transfer-note"
                              >Uploads this file before creating a phone
                              transfer.</small
                            >{/if}
                        </div>
                      {/if}
                    </Crossfade>
                  {/if}
                </div>
              </div>
              <footer class="share-dock">
                {#if !qrDataUrl}
                  {#if needsAccountForFiles}
                    <p class="account-note">
                      Saving this {artifact === "card" ? "card" : "video"} needs a
                      free account. Your settings are kept.
                    </p>
                    <PanelButton
                      variant="primary"
                      fullWidth
                      onclick={requestAccountForFile}
                    >
                      <i class="fa-solid fa-user-plus" aria-hidden="true"></i>
                      Create free account
                    </PanelButton>
                  {:else if artifact === "video" && videoBusy}
                    <PanelButton fullWidth onclick={cancelVideo}>
                      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                      Cancel render
                    </PanelButton>
                  {:else if artifact === "video" && (!hasVideo || videoSettingsStale)}
                    <PanelButton
                      variant="primary"
                      fullWidth
                      onclick={downloadVideo}
                    >
                      <i class="fa-solid fa-film" aria-hidden="true"></i>
                      Download video
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
                        ? "Retry image"
                        : cardDownloadPending
                          ? "Preparing download…"
                          : busyDestination === "download"
                            ? "Downloading…"
                            : "Download card"}
                    </PanelButton>
                  {:else}
                    <PanelButton
                      variant="primary"
                      fullWidth
                      disabled={!activeBlob ||
                        busyDestination !== null ||
                        qrPending}
                      ariaBusy={busyDestination === "download" ||
                        (artifact === "card" &&
                          !activeBlob &&
                          !cardRenderFailed)}
                      onclick={() => runDestination(primaryDeliveryId)}
                    >
                      <i
                        class={busyDestination === "download" ||
                        (artifact === "card" &&
                          !activeBlob &&
                          !cardRenderFailed)
                          ? "fa-solid fa-circle-notch fa-spin"
                          : "fa-solid fa-download"}
                        aria-hidden="true"
                      ></i>
                      {artifact === "card" && !activeBlob && !cardRenderFailed
                        ? "Creating image…"
                        : busyDestination === "download"
                          ? "Downloading…"
                          : artifact === "card"
                            ? "Download card"
                            : "Download video"}
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
            {:else if shareRoute === "publish"}
              <div class="sheet-scroll publish-route">
                {#if initialEntry !== "publish"}
                  <button
                    type="button"
                    class="back-to-chooser"
                    onclick={() => (shareRoute = "home")}
                    >Back to sharing</button
                  >
                {/if}
                <Crossfade
                  key={publishPreparationKey}
                  duration={DURATION.normal}
                  animateHeight
                >
                  {#if !postingAvailable}
                    <p class="account-note">
                      Social publishing is not available here yet. Download a
                      file, then post it from the social app you use.
                    </p>
                    <PanelButton
                      variant="primary"
                      onclick={() => beginDownload(artifact)}
                    >
                      <i class="fa-solid fa-download" aria-hidden="true"></i>
                      Download a file
                    </PanelButton>
                  {:else if needsAccountForFiles}
                    <p class="account-note">
                      Publishing a post needs a free account so it can connect
                      to your social accounts.
                    </p>
                    <PanelButton
                      variant="primary"
                      fullWidth
                      onclick={requestAccountForFile}
                    >
                      <i class="fa-solid fa-user-plus" aria-hidden="true"></i>
                      Create free account
                    </PanelButton>
                  {:else if artifact === "video" && videoBusy}
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
                          alt="Current animation view"
                        />
                      {/if}
                    {/if}
                    <p class="render-feedback" role="status">
                      {progressLabel || "Rendering animation…"}
                    </p>
                    <PanelButton onclick={cancelVideo}>
                      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                      Cancel render
                    </PanelButton>
                  {:else if artifact === "video" && videoSettingsStale}
                    <p class="render-feedback" role="status">
                      Settings changed. Prepare the updated video before
                      publishing.
                    </p>
                    <PanelButton variant="primary" onclick={requestVideo}>
                      <i class="fa-solid fa-film" aria-hidden="true"></i>
                      Prepare updated video
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
                      alt="Sequence card preview"
                    />
                  {:else}
                    <p class="render-feedback">
                      Prepare media before choosing an account.
                    </p>
                    <PanelButton
                      variant="primary"
                      onclick={artifact === "video"
                        ? requestVideo
                        : () => (filePreparationOpen = true)}
                      >{artifact === "video"
                        ? "Prepare video"
                        : "Prepare card"}</PanelButton
                    >
                  {/if}
                </Crossfade>
                {#if postingAvailable && !needsAccountForFiles && !videoBusy && !videoSettingsStale}
                  <div
                    class="publish-actions"
                    transition:growFade={{ axis: "y" }}
                  >
                    <label for="post-share-caption" class="post-caption"
                      >Post caption</label
                    >
                    <textarea
                      id="post-share-caption"
                      aria-label="Post caption"
                      value={caption}
                      oninput={(event) => {
                        shareDraft.caption = event.currentTarget.value;
                        shareDraft.captionTouched = true;
                      }}
                      rows="3"
                      placeholder="Write a caption…"
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
                    Edit post composition
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

  /* Auto needs the stage's stable capacity before the PNG exists. Giving the
     narrow layout an explicit cap keeps it from choosing against the entire
     viewport and then shrinking a tall card into a short preview. */
  .stage.live-card-stage {
    position: relative;
    height: clamp(12rem, 30dvh, 18rem);
    max-height: clamp(12rem, 30dvh, 18rem);
    overflow: visible;
  }

  /* Keep the shared control content-sized above the artwork. */
  .artifact-picker {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    max-width: 100%;
  }

  .artifact-picker :global(.segmented-control) {
    width: auto;
  }

  .artifact-picker.single-artifact {
    justify-content: flex-end;
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
  .download-title {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
    text-transform: capitalize;
  }
  .settings-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: var(--min-touch-target, 44px);
    padding-inline: 0.25rem;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
  }
  /* Each setting is a label over its control; the groups share one row when
     the sheet is wide enough and wrap into a column when it is not. */
  .compact-settings {
    display: flex;
    flex-wrap: wrap;
    align-items: start;
    gap: 0.75rem 1.25rem;
    padding: 0.5rem 0.25rem 0;
  }
  .video-setting,
  .repeat-stepper {
    display: grid;
    gap: 0.375rem;
    justify-items: start;
    color: var(--theme-text-secondary);
    font-size: var(--font-size-min, 0.875rem);
  }
  /* Segmented groups grow to fill the row; the stepper keeps its fixed keys. */
  .video-setting {
    flex: 1 1 auto;
    min-width: 0;
    justify-items: stretch;
  }
  .video-setting > span {
    justify-self: start;
  }
  .repeat-stepper {
    flex: 0 0 auto;
  }
  /* Short labels like "120 fps" stay on one line inside the compact row. */
  .compact-settings :global(.segment) {
    white-space: nowrap;
  }
  .repeat-stepper {
    grid-template-columns: repeat(3, auto);
    align-items: center;
    gap: 0.25rem;
  }
  .repeat-stepper > span {
    grid-column: 1 / -1;
    margin-bottom: 0.125rem;
  }
  .repeat-stepper strong {
    min-width: 1.5rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .repeat-stepper button {
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
  .render-feedback,
  .transfer-note {
    margin: 0;
    color: var(--theme-text-secondary);
    font-size: var(--font-size-compact, 0.75rem);
  }
  .settings-note {
    margin: 0.75rem 0 0;
    color: var(--theme-text-secondary);
    font-size: 0.875rem;
  }
  .account-note {
    margin: 0;
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
    font-size: var(--font-size-compact, 0.75rem);
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

  @media (prefers-reduced-motion: reduce) {
    .chevron {
      transition: none;
    }
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
      border-color 0.15s ease,
      box-shadow 0.15s ease;
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
      transform 0.12s ease,
      box-shadow 0.18s ease,
      filter 0.18s ease;
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
      background 0.15s ease,
      border-color 0.15s ease,
      transform 0.12s ease;
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
    transition: background var(--duration-fast, 150ms) ease;
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
  .header-close {
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
  .share-intents {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1.25rem;
  }
  .home-preview {
    display: block;
    width: min(100%, 16rem);
    max-height: 8rem;
    margin: 0 auto 1rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.625rem;
    object-fit: contain;
    background: var(--theme-card-bg);
  }
  .menu-step {
    height: auto;
  }
  .menu-step .share-intents {
    flex: 0 0 auto;
    overflow: visible;
  }
  .intent-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
  .link-route {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }
  .link-description {
    margin: 0;
    color: var(--theme-text-secondary);
    font-size: var(--font-size-min, 0.875rem);
  }
  .intent,
  .publish-route {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #fff);
    font: inherit;
    cursor: pointer;
  }
  .intent {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr);
    column-gap: 0.75rem;
    align-items: center;
    min-height: 5.25rem;
    padding: 0.875rem 1rem;
    border-radius: 0.75rem;
    text-align: left;
  }
  .intent > i {
    grid-row: span 2;
    font-size: 1.125rem;
    color: var(--theme-accent, #8b7cff);
  }
  .intent > span {
    font-weight: 650;
  }
  .intent > small {
    min-height: 2.7em;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.35;
  }
  .intent:hover:not(:disabled),
  .publish-route:hover {
    border-color: var(--theme-accent, #8b7cff);
    background: var(--theme-surface-hover, rgba(255, 255, 255, 0.1));
  }
  .intent:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .publish-route {
    width: fit-content;
    min-height: var(--min-touch-target, 44px);
    margin-top: 1rem;
    padding-inline: 0.875rem;
    border-radius: 0.625rem;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.75));
    font-size: var(--font-size-min, 0.875rem);
  }
  .preview-column,
  .editing-column {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .preparation-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .file-type {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
    margin: 0 0 0 auto;
    padding: 0;
    border: 0;
    color: var(--theme-text-secondary);
    font-size: var(--font-size-min, 0.875rem);
  }
  .file-type:disabled {
    opacity: 0.55;
  }
  .delivery-column {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .back-to-chooser {
    align-self: flex-start;
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.625rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.78));
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    cursor: pointer;
  }
  .editing-column {
    margin-top: 0.75rem;
  }
  .stage,
  .stage.showing-media {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    height: clamp(12rem, 30dvh, 18rem);
    min-height: 0;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    background: var(--theme-card-bg);
    box-shadow: none;
    overflow: hidden;
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
  .sheet-scroll.video-preparation .stage {
    height: clamp(14rem, 48dvh, 28rem);
  }
  .stage.live-video-stage {
    padding: 0.5rem;
  }
  /* The supplied stage lives in the host's style scope, so this boundary owns
     the dimensions that keep the canvas useful across share-sheet layouts. */
  .stage :global(.live-video-preview) {
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  @media (max-height: 480px) {
    .sheet-scroll.video-preparation .stage {
      height: min(52dvh, 16rem);
    }
  }
  .stage-pending {
    text-align: center;
    font-size: 0.875rem;
    padding: 1rem;
  }
  .stage-refused {
    gap: 0.75rem;
  }
  .artifact-picker {
    align-self: stretch;
    justify-content: space-between;
  }
  .card-settings {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .card-settings :global(.export-panel.inline) {
    background: transparent;
  }
  .setting-value {
    margin-left: auto;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
  }
  .disclosure-body {
    padding: 0.75rem 0.25rem 0.25rem;
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
    font-size: var(--font-size-compact, 0.75rem);
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
  .header-close:focus-visible,
  .tile:focus-visible,
  .network:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
  .qr-step .editing-column {
    display: none;
  }
  .qr-step .stage {
    height: 100%;
    min-height: 20rem;
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
      /* Download animation is the widest route label. Reserve it so changing
         Card to Video cannot push the word mark on desktop. */
      min-inline-size: 12rem;
      font-size: 1.25rem;
    }
    .sheet-scroll {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 1fr);
      align-items: start;
      gap: 1.25rem;
      padding: 1.125rem 1.5rem;
    }
    .sheet-scroll.download-route {
      grid-template-columns: minmax(24rem, 1.45fr) minmax(20rem, 0.9fr);
      gap: 1.5rem;
      width: min(100%, 72rem);
      margin-inline: auto;
    }
    .sheet-scroll.publish-route,
    .sheet-scroll.link-route {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
      max-width: 42rem;
      width: 100%;
      box-sizing: border-box;
      align-items: stretch;
      margin-inline: auto;
    }
    .sheet-scroll.download-route .stage {
      height: clamp(20rem, 40dvh, 24rem);
    }
    /* A card can be wide, square, or tall. Let its own ratio set the desktop
       stage, but stop a tall card before it crowds the download controls. */
    .sheet-scroll.download-route.card-preparation {
      --settings-card-stage-max-height: max(
        11rem,
        calc(
          var(--viewport-height, 100dvh) - 3rem - 5.25rem - 5.125rem - 2.25rem -
            3.5rem - 2px
        )
      );
    }
    .sheet-scroll.download-route.card-preparation .stage {
      height: auto;
      max-height: var(--settings-card-stage-max-height);
    }
    .sheet-scroll.download-route.card-preparation .stage.live-card-stage {
      --live-export-card-max-height: calc(
        var(--settings-card-stage-max-height) - 1.5rem
      );
      overflow: hidden;
    }
    .sheet-scroll.download-route.card-preparation .stage .preview {
      width: 100%;
      height: auto;
      max-height: calc(var(--settings-card-stage-max-height) - 1.5rem);
    }
    .share-intents {
      padding: 1.75rem;
    }
    .editing-column {
      margin-top: 0;
      gap: 0.875rem;
    }
    .stage,
    .stage.showing-media {
      height: clamp(12rem, 38dvh, 26rem);
    }
    .sheet-scroll.video-preparation.has-preview .preview-column {
      align-self: stretch;
    }
    .sheet-scroll.video-preparation.has-preview .stage {
      flex: 1 0 auto;
    }
    .share-dock {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem 1.75rem;
    }
    .share-dock :global(.panel-btn--full-width) {
      flex: 0 0 auto;
      width: fit-content;
      /* Busy and retry labels share the same right edge as Download. */
      min-width: 12rem;
      margin-inline-start: auto;
    }
    .share-dock .delivery-feedback {
      order: -1;
      flex: 1 1 auto;
      margin: 0;
      text-align: left;
    }
    .qr-step .sheet-scroll {
      display: block;
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
  @media (min-width: 900px) and (max-height: 500px) {
    .sheet-scroll.download-route {
      display: grid;
      grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
      align-items: start;
    }
    .sheet-scroll.download-route .stage {
      height: 11rem;
      min-height: 0;
    }
    .sheet-scroll.download-route .stage.live-card-stage {
      max-height: 11rem;
    }
    .sheet-scroll.download-route .preview-column {
      align-self: start;
    }
  }
  .sheet-scroll:not(.has-preview) .stage {
    height: auto;
    min-height: 0;
    padding: 0.625rem 0.75rem;
    border-radius: 0.625rem;
  }
  .sheet-scroll:not(.has-preview) .stage-pending {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: row;
    gap: 0.5rem;
    padding: 0;
  }
  .sheet-scroll:not(.has-preview) .stage-refused span {
    text-align: left;
  }
  @media (max-width: 899px) {
    .video-preparation .preview-column {
      gap: 0.5rem;
    }
    .video-preparation .editing-column {
      margin-top: 0.75rem;
    }
    .sheet-scroll:not(.has-preview) .stage {
      margin-top: -0.25rem;
    }
    .sheet-scroll:not(.has-preview) .stage-refused {
      align-items: flex-start;
      flex-direction: column;
    }
    .sheet-scroll:not(.has-preview) .stage-refused span {
      text-align: left;
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
