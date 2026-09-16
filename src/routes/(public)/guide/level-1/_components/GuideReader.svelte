<script lang="ts">
  /**
   * GuideReader - the durable 3-pane shell for the faithful guide: manifest nav
   * (left) + one printable page fit-to-pane (center) + slide-open live-animation
   * companion (right). Renders the shared GuideDocument (all manifest pages, the
   * single source of truth) and shows only the active page, scaled to fit - the
   * same technique /book uses, so /print + /book never drift from this.
   *
   * The center is rendered through the `sheetFrame` snippet. Keeping it a snippet
   * is the swappable-frame seam: a future reflow frame drops in here without
   * touching nav or companion (see docs/superpowers/specs/2026-07-07-guide-reader-design.md).
   */
  import { onMount, flushSync, tick } from "svelte";
  import { writeUrl } from "$lib/shared/navigation/services/url-state";
  import "../_styles/guide.css";
  import "../_styles/guide-print.css";
  import {
    setGuidePrintMode,
    setGuideSequenceClick,
    type GuideSequenceClick,
  } from "../_data/guide-data-context";
  import GuidePage from "./GuidePage.svelte";
  import GuidePageNav from "./GuidePageNav.svelte";
  import GuideCompanion from "./GuideCompanion.svelte";
  import {
    GuideActiveStep,
    setGuideActiveStep,
  } from "../_data/guide-active-step.svelte";
  import {
    SequenceSelection,
    setSequenceSelection,
  } from "$lib/shared/selection/sequence-selection.svelte";
  import "$lib/shared/selection/selection.css";
  import { stripToSequence } from "../_data/guide-sequence-adapter";
  import { ensureMotionData } from "$lib/shared/sequence-viewer/services/sequence-motion-loader";
  import { loadOverrides } from "../_data/guide-overrides.svelte";
  import type { GuidePageMeta } from "../_data/guide-manifest";
  import {
    GUIDE_READER_BASE,
    indexForSlug,
    slugForIndex,
    slugFromPath,
  } from "../_data/guide-page-links";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    consumeGuideScanIntent,
    fireCodexCell,
  } from "../_data/guide-scan-intent";
  import {
    suppressBackground,
    releaseBackground,
  } from "$lib/shared/background/shared/state/background-suppression.svelte";
  import {
    LEVEL1_READER_CONFIG,
    type GuideReaderConfig,
  } from "../_data/guide-reader-config";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import {
    guideFramePrefs,
    setGuideFrame,
    type GuideFrame,
  } from "../_data/guide-frame-prefs.svelte";
  import { hasReflowContent } from "../_data/guide-content";

  // The level seam: which document/pages/nav render, and whether the
  // level-1-only deep-link / QR-scan / codex machinery is live. Defaults to
  // Level 1, so an unparameterized <GuideReader /> is byte-for-byte the
  // historical reader. GuideTab passes the Level-2 config for the L2 view.
  let { config = LEVEL1_READER_CONFIG }: { config?: GuideReaderConfig } =
    $props();
  const Doc = $derived(config.document);

  // Faithful pages render in print STYLE (ink-on-white, static pictographs).
  setGuidePrintMode();

  const PAGE_W = 816; // 8.5in @96dpi
  const PAGE_H = 1056; // 11in

  // Persist scroll position so it survives HMR remounts, full reloads, and
  // navigating away and back - sessionStorage, restored after the first fit()
  // lays the pages out. Keyed per-reader (one reader today; keep it explicit).
  // Keyed per level so Level 1 and Level 2 keep independent scroll/companion
  // state (switching levels remounts the reader; each restores its own).
  const SCROLL_KEY = `guide-reader-scroll-${config.levelLabel}`;
  // Persist the open companion (clicked strip) so a reload / HMR remount keeps
  // the animation drawer up instead of collapsing it and forcing a re-click.
  // Cleared on explicit close, so it only restores a drawer left open.
  const COMPANION_KEY = `guide-reader-companion-${config.levelLabel}`;

  let activeIndex = $state(0); // highlighted page - driven by scroll position
  let scale = $state(0.5);
  let stageEl = $state<HTMLDivElement>();
  let docWrap = $state<HTMLDivElement>();

  // Mobile detection - owned here (single source of truth for the 720px
  // cutoff), measured off the reader's own container width so it tracks the
  // SAME breakpoint the `@container (max-width: 720px)` CSS below uses,
  // rather than duplicating it as a `matchMedia` viewport check (this reader
  // sits inside a `container-type: inline-size` ancestor - GuideTab.svelte -
  // so its container width, not the viewport, is what actually flips the
  // layout). Passed down to GuideCompanion as a plain prop.
  const MOBILE_BREAKPOINT_PX = 720;
  let readerEl = $state<HTMLDivElement>();
  let isMobile = $state(false);
  // The mobile companion sheet - observed so the scroll-sync band recomputes
  // whenever the sheet's rendered height changes (compact <-> overflow-open).
  let companionEl = $state<HTMLElement>();

  let clicked = $state<SequenceData | null>(null);
  let companionOpen = $state(false);
  // Codex mode: the active body page is the interactive Codex sheet (manifest
  // id "codex"). The companion auto-opens to host its controls (prop family,
  // visibility, transforms) even before any cell is clicked - see
  // GuideCodexControls.svelte / guide-codex-state.svelte.ts.
  const isCodexPage = $derived(
    config.isCodexSlug(
      config.bodyPages[activeIndex - config.frontMatterCount]?.id ?? ""
    )
  );
  $effect(() => {
    if (isCodexPage) {
      companionOpen = true;
    } else if (!clicked) {
      // Leaving the Codex page with nothing animating - close the panel that
      // was opened purely to host its controls.
      companionOpen = false;
    }
  });

  // Golden step ring: the companion animates a clicked strip while THIS signal
  // rings the matching cell on the page's on-screen strip, in sync - the same
  // dual-view coupling the Sequence Viewer has. Provided down to the pages via
  // context (getGuideActiveStep); the companion reports its live step in.
  const activeStep = new GuideActiveStep();
  setGuideActiveStep(activeStep);

  // Whole-sequence selection: the accent "Lift & Glow" ring marks WHICH strip is
  // active while the amber step ring (activeStep) hops through its steps. Only the
  // reader sets a scope - /print and /book don't, so their strips stay pristine.
  const selection = new SequenceSelection();
  setSequenceSelection(selection);

  // Scroll a page into view; the scroll handler keeps activeIndex (the nav
  // highlight) in sync as you scroll freely between the stacked pages.
  function go(n: number) {
    const i = Math.max(0, Math.min(config.readerPageCount - 1, n));
    activeIndex = i;
    docWrap?.querySelectorAll<HTMLElement>(".reader-page")[i]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    // Settle-correction: the nearest-center recompute runs on every
    // 'scroll'/'scrollend' event during the animation via a throttled rAF, so
    // it can land on activeIndex === i mid-transit and never get a final
    // correcting pass if the tab is backgrounded/inactive enough to starve
    // requestAnimationFrame (observed: isCodexPage - and any page's nav
    // highlight - can go stale after a nav click otherwise). Calling the pure
    // recompute directly (no rAF) once the smooth scroll should be done closes
    // that gap without touching the scroll-event path at all.
    settleTimer = setTimeout(recomputeActiveIndex, 500);
  }
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  // Nearest-to-viewport-centre page becomes the active (highlighted) one, and
  // the raw scrollTop is persisted so a remount/reload can restore it.
  let scrollRaf = 0;
  // True while we're parking at the saved offset. It (a) drives the `restoring`
  // class that hides the doc until it's landed - so the reader APPEARS already
  // scrolled there rather than jumping from the top - and (b) blocks onScroll
  // from persisting an intermediate clamped value over the saved target. It must
  // be Svelte-owned (a class, not an imperative inline style): `.reader-doc`
  // carries a reactive `style` for --w/--h, and any scale change re-renders that
  // attribute, which would wipe an imperative visibility we set on the element.
  // Initialized hidden when there's an offset to restore so the FIRST paint is
  // already blanked (SSR-safe: savedScrollTarget() catches missing sessionStorage).
  //
  // Deep link: /learn/guide/<slug> parks on that page and takes precedence over
  // the saved scroll offset (spec: 2026-07-09-guide-deep-links-design.md).
  const deepLinkIndex: number | null =
    !config.enableDeepLinks || typeof window === "undefined"
      ? null
      : (() => {
          const slug = slugFromPath(window.location.pathname);
          return slug ? indexForSlug(slug) : null;
        })();
  let restoring = $state(deepLinkIndex !== null || savedScrollTarget() > 0);
  // The actual nearest-to-center recompute - pulled out of the rAF wrapper so
  // the settle-correction timer in go() can call it directly. If a scroll
  // handler's rAF never gets scheduled (backgrounded/inactive tab throttling
  // can starve it indefinitely), this direct call still lands, so activeIndex
  // (and anything derived from it, like isCodexPage) can't get stuck stale
  // after a nav click's smooth scroll settles.
  function recomputeActiveIndex() {
    if (!docWrap) return;
    const cont = docWrap.getBoundingClientRect();
    const mid = cont.top + cont.height / 2;
    let best = 0;
    let bestDist = Infinity;
    docWrap.querySelectorAll<HTMLElement>(".reader-page").forEach((p, i) => {
      const r = p.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best !== activeIndex) activeIndex = best;
    if (restoring) return; // don't clobber the saved target mid-restore
    try {
      sessionStorage.setItem(SCROLL_KEY, String(docWrap.scrollTop));
    } catch {
      // sessionStorage unavailable (private mode / disabled) - scroll just
      // won't persist; not worth surfacing.
    }
  }
  function onScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      recomputeActiveIndex();
    });
  }

  // Which prop the companion animates for the clicked strip (staff pages hand
  // up "staff" so the player renders real staves from the authored orientations;
  // the codex page hands up any PropType the reader has selected there).
  let clickedPropType = $state<"hand" | "staff" | PropType>("hand");
  // Identity of the clicked strip + a human page label - the companion needs
  // both for the admin action row (saveOverride key) and Copy-for-AI's header
  // ("Guide: Level 1 › <page title> › <word>").
  let clickedKey = $state<string | null>(null);
  let clickedPageTitle = $state("");
  // Whether the companion shows the α/β/γ position indicator for the clicked
  // strip. Defaults to on for hand renders (the early hand-path chapters), off
  // for staff/letter/word strips; a strip can override via payload.
  let clickedShowPlacementGlyph = $state(false);

  async function handleSequenceClick(payload: GuideSequenceClick) {
    // Ring the clicked strip's Start box immediately (before motion data even
    // resolves), then the player's live step drives it from there.
    activeStep.begin(payload.key ?? "");
    selection.select(payload.key ?? ""); // persist the accent ring on the active strip
    clickedPropType = payload.propType ?? "hand";
    // Hand renders are the hand-path chapters → position glyph on by default;
    // any strip can override via payload.showPlacementGlyph. PropType.HAND === "hand",
    // so the string compare covers both the "hand" literal and the enum.
    const isHandStrip = String(clickedPropType).toLowerCase() === "hand";
    clickedShowPlacementGlyph = payload.showPlacementGlyph ?? isHandStrip;
    clickedKey = payload.key ?? null;
    clickedPageTitle =
      config.bodyPages[activeIndex - config.frontMatterCount]?.title ?? "";
    const seq = stripToSequence(payload.strip, { word: payload.word });
    clicked = (await ensureMotionData(seq)) ?? seq;
    companionOpen = true;
    // Remember the open drawer so a reload / HMR restores it (see onMount).
    persistCompanion(payload);
    if (isMobile) {
      // Wait for the DOM to reflect both the new `.is-selected` ring and the
      // just-opened sheet before measuring - one `tick()` flushes Svelte's
      // pending updates, then an rAF lets layout (the sheet's height) settle.
      await tick();
      requestAnimationFrame(syncMobileScroll);
    }
  }
  setGuideSequenceClick(handleSequenceClick);

  // Mobile split-view scroll-sync: keeps the clicked (golden-ringed) strip
  // visible in the band of viewport ABOVE the bottom sheet, so the source
  // cell and its live animation are on screen together (spec:
  // 2026-07-11-guide-companion-mobile-design.md). Re-run whenever the sheet's
  // own height changes (compact <-> overflow-open) via the ResizeObserver
  // wired up in onMount below.
  function currentSelectedCell(): HTMLElement | null {
    return (
      docWrap?.querySelector<HTMLElement>(".tka-seq-cell.is-selected") ?? null
    );
  }

  function prefersReducedMotion(): boolean {
    return (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    );
  }

  /** Scroll the doc scroller so `cellEl`'s bounding box lands centered in the
   *  band of viewport between the top (0) and `bandBottomPx` (the sheet's
   *  top edge) - the visible strip above the mobile companion sheet. */
  function scrollCellIntoBand(cellEl: HTMLElement, bandBottomPx: number): void {
    if (!docWrap) return;
    const cellRect = cellEl.getBoundingClientRect();
    const docRect = docWrap.getBoundingClientRect();
    // Cell's vertical center, expressed in docWrap's own scroll-content
    // coordinate space (independent of the current scroll position).
    const cellCenterInContent =
      cellRect.top - docRect.top + docWrap.scrollTop + cellRect.height / 2;
    // Where we want that center to land, in the SAME viewport-relative frame
    // docRect.top already lives in.
    const bandCenterInViewport = bandBottomPx / 2;
    const targetScrollTop =
      cellCenterInContent - (bandCenterInViewport - docRect.top);
    const maxScroll = Math.max(0, docWrap.scrollHeight - docWrap.clientHeight);
    docWrap.scrollTo({
      top: Math.max(0, Math.min(targetScrollTop, maxScroll)),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  function syncMobileScroll(): void {
    if (!isMobile || !companionOpen || !companionEl) return;
    const cell = currentSelectedCell();
    if (!cell) return;
    const sheetHeight = companionEl.getBoundingClientRect().height;
    const bandBottom = window.innerHeight - sheetHeight;
    scrollCellIntoBand(cell, bandBottom);
  }

  // Guide overrides load once per reader mount (public read; admin gate lives
  // on the write side). Reactive singleton - pages + companion re-render as
  // soon as this resolves, no manual plumbing needed beyond this one call.
  // Pause the global animated background while the reader is open. Its rAF
  // repaints a viewport-sized canvas every frame behind the (near-fully
  // opaque) pages, and its bursty entities (cosmic comets/UFOs, ocean fish)
  // stole enough main thread to stutter the companion's playback - measured
  // 37.9fps / 40.7% hitch frames with the background on vs 59.9fps / 0.1%
  // with it off, same page, same playing strip. Museum precedent; see
  // background-suppression.svelte.ts. Sync onMount on purpose: an async
  // onMount's return value is a Promise, so its cleanup would never register.
  onMount(() => {
    suppressBackground("guide-reader");
    return () => releaseBackground("guide-reader");
  });

  onMount(async () => {
    loadOverrides();
    // Restore a companion left open before a reload / HMR remount. The Codex
    // page opens its own companion (isCodexPage effect), so skip there to avoid
    // fighting it; otherwise re-run the click to reopen the animation drawer.
    if (!isCodexPage) {
      const saved = savedCompanion();
      if (saved) void handleSequenceClick(saved);
    }

    // One-shot physical-book scan handoff (guide-scan-intent.ts): a QR scan
    // stashed a request to reproduce what a tap would do once the reader
    // mounts. Consumed here (after the deep-link slug landing above has set
    // activeIndex synchronously), guarded by tick()+rAF so the just-mounted
    // Codex page (which registers its cell trigger in its own onMount - child
    // onMounts run before this parent one) has settled before we fire.
    const scanIntent = config.enableDeepLinks ? consumeGuideScanIntent() : null;
    if (scanIntent) {
      await tick();
      requestAnimationFrame(() => {
        if (scanIntent.cellKey && config.isCodexSlug(scanIntent.slug)) {
          fireCodexCell(scanIntent.cellKey);
        } else if (scanIntent.sequence) {
          // TODO(guide-companion word-path): auto-open companion for
          // multi-letter scans. GuideSequenceClick (guide-data-context.ts)
          // only accepts a flat StepData[] strip, not a raw SequenceData -
          // wiring this cleanly needs a `sequence` field added to that type,
          // which is out of scope for this file set. For now the reader lands
          // on the target page; the user taps the strip to open the companion.
        }
      });
    }
  });

  // Live URL sync: the address bar always carries the active page's deep link
  // (replaceState - no history spam; copying the URL bar IS the share
  // affordance, like the sequence ?open= sync). Gated to /learn/guide paths so
  // the test harness and other hosts never rewrite their URLs.
  $effect(() => {
    const i = activeIndex;
    if (!config.enableDeepLinks) return;
    if (restoring) return;
    if (typeof window === "undefined") return;
    if (!window.location.pathname.startsWith(GUIDE_READER_BASE)) return;
    const slug = slugForIndex(i);
    if (!slug) return;
    const t = setTimeout(() => {
      if (window.location.pathname !== `${GUIDE_READER_BASE}/${slug}`) {
        writeUrl(
          `${GUIDE_READER_BASE}/${slug}${window.location.search}${window.location.hash}`
        );
      }
    }, 200);
    return () => clearTimeout(t);
  });

  // Fit each page FULLY inside the pane (whole page visible - no per-page
  // scrolling); the pages then stack and you scroll between them, like a PDF
  // reader's continuous view. 40/32 = the reader-doc padding (20px / 16px).
  function fit() {
    if (!stageEl) return;
    const w = stageEl.clientWidth - 32;
    const h = stageEl.clientHeight - 40;
    scale = Math.max(0.1, Math.min(w / PAGE_W, h / PAGE_H));
  }

  // The persisted offset to restore (0 = nothing to restore).
  function savedScrollTarget(): number {
    try {
      const v = Number(sessionStorage.getItem(SCROLL_KEY) ?? 0);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch {
      return 0;
    }
  }

  // Companion (clicked strip) persistence - mirror of the scroll restore. The
  // click payload is plain serializable data (strip StepData[], word, key,
  // propType), so it round-trips through sessionStorage.
  function persistCompanion(payload: GuideSequenceClick): void {
    try {
      sessionStorage.setItem(COMPANION_KEY, JSON.stringify(payload));
    } catch {
      // private mode / quota - the drawer just won't survive a reload
    }
  }
  function clearCompanion(): void {
    try {
      sessionStorage.removeItem(COMPANION_KEY);
    } catch {
      // ignore
    }
  }
  function savedCompanion(): GuideSequenceClick | null {
    try {
      const raw = sessionStorage.getItem(COMPANION_KEY);
      return raw ? (JSON.parse(raw) as GuideSequenceClick) : null;
    } catch {
      return null;
    }
  }

  onMount(() => {
    // Apply the fitted scale, then flush it to the DOM synchronously so the
    // pages take their real heights before we measure/scroll - the doc is then
    // tall enough that the very first park lands at the target, in this same
    // (pre-paint) tick. `restoring` keeps the doc hidden until we land.
    fit();
    flushSync();

    const reveal = () => {
      restoring = false;
    };

    // Where to park: a /learn/guide/<slug> deep link beats the saved scroll
    // offset. The deep-link target is element-measured (recomputed each attempt
    // while layout settles); the saved offset is a fixed number.
    const fixedTarget = savedScrollTarget();
    const getTarget: (() => number | null) | null =
      deepLinkIndex !== null
        ? () => {
            if (!docWrap) return null;
            const el =
              docWrap.querySelectorAll<HTMLElement>(".reader-page")[
                deepLinkIndex
              ];
            if (!el) return null;
            const delta =
              el.getBoundingClientRect().top -
              docWrap.getBoundingClientRect().top;
            return docWrap.scrollTop + delta;
          }
        : fixedTarget > 0
          ? () => fixedTarget
          : null;

    if (deepLinkIndex !== null) activeIndex = deepLinkIndex; // nav highlight up front

    if (getTarget && docWrap) {
      let attempts = 0;
      let lastHeight = -1;
      let stableFrames = 0;
      const park = (): void => {
        if (!docWrap) return reveal();
        const target = getTarget();
        if (target === null) return reveal();
        const scrollHeight = docWrap.scrollHeight;
        // behavior:"instant" - NOT "auto". "auto" defers to the doc's CSS
        // scroll-behavior:smooth, which animates every scrollTo and is exactly
        // the visible crawl-to-position we're eliminating. "instant" jumps.
        docWrap.scrollTo({ top: target, behavior: "instant" });
        attempts += 1;

        // Landed on the target - reveal.
        if (Math.abs(docWrap.scrollTop - target) <= 2) return reveal();

        // If the scale is still settling the height keeps growing; retry until
        // we reach the target. Only once the height holds steady across a few
        // frames AND still can't reach the target do we accept the clamp
        // (content is genuinely shorter than the target now).
        if (scrollHeight === lastHeight) stableFrames += 1;
        else {
          stableFrames = 0;
          lastHeight = scrollHeight;
        }
        const maxScroll = scrollHeight - docWrap.clientHeight;
        if ((stableFrames >= 3 && maxScroll < target) || attempts >= 90)
          return reveal();
        requestAnimationFrame(park);
      };
      park(); // first attempt synchronously (pre-paint); retries via rAF if needed
    } else {
      reveal();
    }

    const ro = new ResizeObserver(fit);
    if (stageEl) ro.observe(stageEl);
    return () => {
      ro.disconnect();
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
    };
  });

  // Mobile detection off the reader's own container width - tracks the same
  // 720px cutoff the `@container` CSS below uses.
  onMount(() => {
    if (!readerEl) return;
    const readerRo = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? readerEl!.clientWidth;
      isMobile = width <= MOBILE_BREAKPOINT_PX;
    });
    readerRo.observe(readerEl);
    return () => readerRo.disconnect();
  });

  // First mobile load defaults to the reflow frame (print sheets are mobile-
  // hostile); once the user toggles, respect their choice. Desktop stays sheet.
  let userPickedFrame = $state(false);
  $effect(() => {
    if (!userPickedFrame && isMobile && guideFramePrefs.frame === "sheet") {
      setGuideFrame("flow");
    }
  });

  // The active body page's manifest id - drives whether the sheet/flow toggle
  // shows (only pages with single-source reflow content can reflow).
  const activeReflowable = $derived(
    hasReflowContent(
      config.bodyPages[activeIndex - config.frontMatterCount]?.id ?? ""
    )
  );

  // Re-observe the sheet element whenever it (re)mounts (companionOpen
  // toggles `{#if companionOpen}` in the markup, so companionEl's identity
  // changes) and re-sync immediately so a freshly opened sheet is measured.
  $effect(() => {
    const el = companionEl;
    if (!el || !isMobile) return;
    const ro = new ResizeObserver(() => syncMobileScroll());
    ro.observe(el);
    return () => ro.disconnect();
  });
</script>

{#snippet sheetFrame(meta: GuidePageMeta)}
  {#if guideFramePrefs.frame === "flow" && meta.reflowable}
    <!-- Flow mode: the reflowable page renders full-width + unscaled (its content
         is a FlowFrame), NOT trapped in the scaled 8.5×11 sheet. Keeps the
         `reader-page` class so the reader's scroll/index/deep-link queries (which
         select `.reader-page`) still count it; `.reader-flow-page` overrides the
         fixed sheet sizing. Other pages keep the scaled sheet below. -->
    <div class="reader-page reader-flow-page">
      {@render meta.content()}
    </div>
  {:else}
    <div class="reader-page">
      <div class="page-fixed" style="transform: scale({scale})">
        <GuidePage
          title={meta.title}
          pageNumber={meta.pageNumber}
          fullBleed={meta.fullBleed}
        >
          {@render meta.content()}
        </GuidePage>
      </div>
    </div>
  {/if}
{/snippet}

<div class="reader" bind:this={readerEl}>
  <aside class="reader-aside">
    <GuidePageNav
      rows={config.navRows}
      hrefFor={config.hrefFor}
      {activeIndex}
      onSelect={go}
    />
  </aside>

  <div class="reader-stage" bind:this={stageEl}>
    {#if activeReflowable}
      <div class="frame-toggle">
        <SegmentedControl
          options={[
            { value: "sheet", label: "Page" },
            { value: "flow", label: "Reflow" },
          ]}
          value={guideFramePrefs.frame}
          onchange={(v: GuideFrame) => {
            userPickedFrame = true;
            setGuideFrame(v);
          }}
          size="sm"
          color="accent"
        />
      </div>
    {/if}
    <div
      class="reader-doc"
      class:restoring
      bind:this={docWrap}
      onscroll={onScroll}
      onscrollend={onScroll}
      style="--w:{PAGE_W * scale}px; --h:{PAGE_H * scale}px"
    >
      <Doc
        built={config.built}
        page={sheetFrame}
        frame={guideFramePrefs.frame}
      />
    </div>
  </div>

  <aside
    class="reader-companion"
    class:open={companionOpen}
    class:mobile={isMobile}
    aria-hidden={!companionOpen}
    bind:this={companionEl}
  >
    {#if companionOpen}
      <GuideCompanion
        sequence={clicked}
        propType={clickedPropType}
        stripKey={clickedKey}
        pageTitle={clickedPageTitle}
        levelLabel={config.levelLabel}
        showPlacementGlyph={clickedShowPlacementGlyph}
        isCodexMode={isCodexPage}
        {isMobile}
        onStep={(s) => activeStep.report(s)}
        onClose={() => {
          companionOpen = false;
          activeStep.clear();
          selection.clear();
          clearCompanion();
        }}
      />
    {/if}
  </aside>
</div>

<style>
  .reader {
    position: relative;
    display: flex;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: var(--theme-bg, oklch(0.13 0.015 270));
    color: var(--theme-text, #e8e6f0);
  }
  .reader-aside {
    width: 240px;
    min-width: 240px;
    height: 100%;
    background: var(--theme-panel-bg, oklch(0.15 0.02 270 / 0.6));
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }
  .reader-stage {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .frame-toggle {
    display: flex;
    justify-content: center;
    padding: 8px 0 0;
  }
  /* Flow page: full stage width, content height, its own white editorial sheet.
     Two-class selector (.reader-page.reader-flow-page) so it beats the equal-
     specificity .reader-page sizing rule below regardless of source order -
     otherwise the fixed --w/--h + overflow:hidden would clip the flow column. */
  .reader-doc :global(.reader-page.reader-flow-page) {
    flex: 0 0 auto;
    width: min(100%, 52rem);
    height: auto;
    overflow: visible;
    background: #fff;
    color: #1a1a1a;
    border-radius: 2px;
    box-shadow: 0 6px 28px rgba(0, 0, 0, 0.4);
  }
  /* Continuous scroller: pages stack vertically, each fit fully to the pane, and
     you scroll between them. */
  .reader-doc {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 20px 16px;
    scroll-behavior: smooth;
  }
  /* Hidden (but still laid out, so scrollHeight is valid and scrollTo works)
     while restoring the saved scroll offset - the doc reveals already parked
     there instead of visibly jumping from the top. */
  .reader-doc.restoring {
    visibility: hidden;
  }
  /* Each page is a scaled footprint box (the fixed 816×1056 sheet is transformed
     down; transform alone doesn't shrink layout size, so the box carries --w/--h).
     flex:0 0 auto keeps its height so the stack scrolls page-by-page. */
  .reader-doc :global(.reader-page) {
    flex: 0 0 auto;
    width: var(--w);
    height: var(--h);
    overflow: hidden;
    box-shadow: 0 6px 28px rgba(0, 0, 0, 0.4);
    border-radius: 2px;
  }
  .reader-doc :global(.reader-page .page-fixed) {
    width: 816px;
    height: 1056px;
    transform-origin: top left;
    background: #fff;
  }
  .reader-doc :global(.reader-page .guide-page) {
    margin: 0;
    box-shadow: none;
  }
  /* Companion slides open from the right (reduced-motion collapses the slide). */
  .reader-companion {
    flex: 0 0 auto;
    width: 0;
    min-width: 0;
    overflow: hidden;
    background: var(--theme-panel-bg, oklch(0.15 0.02 270 / 0.6));
    border-left: 0 solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    transition:
      width 240ms ease,
      min-width 240ms ease;
  }
  .reader-companion.open {
    width: clamp(360px, 40vw, 560px);
    min-width: 360px;
    border-left-width: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    .reader-companion {
      transition: none;
    }
    .reader-doc {
      scroll-behavior: auto;
    }
  }

  /* Mobile: nav collapses and the companion becomes a bottom sheet - sized by
     its own content (GuideCompanion's hero-animator layout), NOT a full-panel
     overlay. The doc scroller stays visible above it and the reader scrolls
     the clicked cell into the visible band (see scrollCellIntoBand). */
  @container (max-width: 720px) {
    .reader-aside {
      display: none;
    }
    .reader-companion.mobile {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      top: auto;
      inset: auto 0 0 0;
      width: auto;
      min-width: 0;
      max-height: 92svh;
      height: auto;
      /* Opaque sheet - without this the page bleeds through the animator and
         controls, muddying both. Solid app background, not a translucent tint. */
      background: var(--theme-bg, oklch(0.13 0.015 270));
      border-left: 0;
      border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
      border-radius: 16px 16px 0 0;
      box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.4);
      transform: translateY(100%);
      transition: transform 240ms ease;
    }
    .reader-companion.mobile.open {
      width: auto;
      min-width: 0;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .reader-companion.mobile {
      transition: none;
    }
  }
</style>
