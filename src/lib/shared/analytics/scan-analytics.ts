/**
 * Scan analytics — the one joinable property set every /q event carries.
 *
 * One scanner's visit to one card is a "scan visit". PostHog's own identity for
 * that visit is not dependable: reset() mints a fresh distinct_id AND a fresh
 * session_id mid-load (a real scan on 2026-07-20 came back as two PostHog users
 * with an identical $device_id, 11s apart — one human, one card, two sessions),
 * and a failed resolve auto-reloads the page, which ends the page-load-scoped
 * view of things regardless. `scan_session_id` is our own anchor: minted once
 * per short code, kept in sessionStorage, so every event from the visit — across
 * a reload, across an identity churn — still joins on one id.
 *
 * Every scan event goes through `captureScanEvent` so the property set is
 * identical at every call site instead of being retyped (and drifting) per
 * event. The scan page and the shared viewer shell both call it, and the
 * per-control instrumentation phase builds on it.
 */

import { browser } from "$app/env";
import { getDeviceId } from "#lib/shared/foundation/services/device-id.js";
import { scanPropProperties } from "./scan-prop-attribution";
import type { CaptureOptions } from "posthog-js";
import {
  captureEvent,
  captureEventWithPostHog,
  getPostHogInstance,
  onPostHogReady,
  type PostHogReadyClient,
} from "./services/posthog";

const SCAN_SESSION_PREFIX = "tka:scan-session:";

/**
 * What a scan visit knows about itself. `isAuthenticated` is a getter, not a
 * value: a guest can sign in mid-visit, so it has to be read at event time. It
 * is also why this module never imports auth state — that would drag Firebase
 * into the analytics graph, which is exactly what the worker-safety note atop
 * services/posthog.ts exists to prevent.
 */
export interface ScanVisitContext {
  shortCode: string;
  sequenceWord: string | null;
  deckId: string | null;
  deckName: string | null;
  leftProp: string | null;
  rightProp: string | null;
  isAuthenticated: () => boolean;
}

/** The base property set. Every scan event carries all of it. */
export interface ScanBaseProperties {
  short_code: string;
  sequence_word: string | null;
  deck_id: string | null;
  deck_name: string | null;
  left_prop: string | null;
  right_prop: string | null;
  mixed_props: boolean | null;
  is_authenticated: boolean;
  device_id: string | null;
  scan_session_id: string;
}

export type ScanAnalyticsValue = string | number | boolean | null;
export type ScanExitReason =
  | "close_button"
  | "open_app"
  | "remix"
  | "guide"
  | "route_unmount"
  | "pagehide";

export interface ScanSessionState {
  startedAt: number;
  viewerOpenedAt: number | null;
  interactionCount: number;
  lastMode: string | null;
  played: boolean;
  practiced: boolean;
  exported: boolean;
  ended: boolean;
}

export interface ScanSessionInteraction {
  mode?: string;
  played?: boolean;
  practiced?: boolean;
  exported?: boolean;
  /** Lifecycle bookkeeping can update flags without pretending it was a new intent. */
  count?: boolean;
}

export interface ScanIntentOptions {
  /** Set false for a semantic event derived from the same physical touch. */
  count?: boolean;
}

export type ScanExportStage =
  | "requested"
  | "gated"
  | "started"
  | "completed"
  | "failed"
  | "canceled"
  | "retry";

export interface ScanSessionSummary {
  duration_ms: number;
  interaction_count: number;
  last_mode: string | null;
  played: boolean;
  practiced: boolean;
  exported: boolean;
  exit_reason: ScanExitReason;
}

interface PendingScanEvent {
  eventName: string;
  properties: Record<string, unknown>;
  interaction: ScanSessionInteraction;
  timer: ReturnType<typeof setTimeout>;
}

interface QueuedScanEvent {
  eventName: string;
  properties: Record<string, unknown>;
  options?: CaptureOptions;
}

let visit: ScanVisitContext | null = null;
let visitScanSessionId: string | null = null;
let lastRegisteredSuperProperties: string | null = null;
let sessionState = createScanSessionState();
let pagehideHandler: ((event: PageTransitionEvent) => void) | null = null;
let postHogReadyCleanup: (() => void) | null = null;
const pendingEvents = new Map<string, PendingScanEvent>();
const queuedScanEvents: QueuedScanEvent[] = [];
const sessionEndCleanups = new Set<(reason: ScanExitReason) => void>();

// Storage-blocked fallback (private mode, hardened settings). Still stable for
// the life of the page load, just not across the auto-reload.
const memorySessionIds = new Map<string, string>();

/** Pure state initializer used by the runtime tracker and its regression tests. */
export function createScanSessionState(now = Date.now()): ScanSessionState {
  return {
    startedAt: now,
    viewerOpenedAt: null,
    interactionCount: 0,
    lastMode: null,
    played: false,
    practiced: false,
    exported: false,
    ended: false,
  };
}

/** Pure transition: lifecycle events can opt out of the intent counter. */
export function recordScanSessionInteraction(
  state: ScanSessionState,
  interaction: ScanSessionInteraction
): ScanSessionState {
  if (state.ended) return state;
  return {
    ...state,
    interactionCount:
      state.interactionCount + (interaction.count === false ? 0 : 1),
    lastMode: interaction.mode ?? state.lastMode,
    played: state.played || interaction.played === true,
    practiced: state.practiced || interaction.practiced === true,
    exported: state.exported || interaction.exported === true,
  };
}

/**
 * Export events describe one intent across several lifecycle stages. Count the
 * intent, not every progress notification that follows it. An explicit cancel
 * is a separate intent; an inferred/native-share cancellation is bookkeeping.
 */
export function scanExportSessionInteraction(
  stage: ScanExportStage,
  userInitiated = false
): ScanSessionInteraction {
  return {
    count:
      stage === "requested" ||
      stage === "retry" ||
      (stage === "canceled" && userInitiated),
    exported: stage === "completed",
  };
}

/**
 * Pure final transition. Returning null is the dedupe contract: an unopened or
 * already-ended viewer never produces a second summary.
 */
export function finishScanSession(
  state: ScanSessionState,
  exitReason: ScanExitReason,
  now = Date.now()
): { state: ScanSessionState; summary: ScanSessionSummary } | null {
  if (state.ended || state.viewerOpenedAt === null) return null;
  return {
    state: { ...state, ended: true },
    summary: {
      duration_ms: Math.max(0, Math.round(now - state.viewerOpenedAt)),
      interaction_count: state.interactionCount,
      last_mode: state.lastMode,
      played: state.played,
      practiced: state.practiced,
      exported: state.exported,
      exit_reason: exitReason,
    },
  };
}

/**
 * The stable id for this scanner's visit to this card. Survives the
 * failed-resolve auto-reload because sessionStorage outlives a same-tab reload,
 * which is precisely the case that lost the SJJ6 scan.
 */
export function getScanSessionId(shortCode: string): string {
  const key = `${SCAN_SESSION_PREFIX}${shortCode}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(key, fresh);
    return fresh;
  } catch {
    const cached = memorySessionIds.get(key);
    if (cached) return cached;
    const fresh = crypto.randomUUID();
    memorySessionIds.set(key, fresh);
    return fresh;
  }
}

/**
 * Open a scan visit. Call as early as the short code is known — before the
 * resolve, not after — so anything that fires during load (an $exception, a
 * failed resolve) already carries the join keys. Word and deck arrive later via
 * updateScanAttribution.
 */
export function beginScanVisit(
  shortCode: string,
  options: {
    sequenceWord?: string | null;
    deckId?: string | null;
    deckName?: string | null;
    leftProp?: string | null;
    rightProp?: string | null;
    isAuthenticated?: () => boolean;
  } = {}
): void {
  if (!browser || !shortCode) return;

  // The universal route load opens the visit before SvelteKit commits its
  // history-change $pageview. QScanPage mounts later with the live auth getter.
  // Enrich that same visit without clearing queued events or session progress.
  if (
    visit?.shortCode === shortCode &&
    visitScanSessionId &&
    !sessionState.ended
  ) {
    visit = {
      ...visit,
      sequenceWord: options.sequenceWord ?? visit.sequenceWord,
      deckId: options.deckId ?? visit.deckId,
      deckName: options.deckName ?? visit.deckName,
      leftProp: options.leftProp ?? visit.leftProp,
      rightProp: options.rightProp ?? visit.rightProp,
      isAuthenticated: options.isAuthenticated ?? visit.isAuthenticated,
    };
    registerSuperProperties();
    return;
  }

  if (visit && visit.shortCode !== shortCode) {
    endScanViewerSession("route_unmount");
  }

  visitScanSessionId = getScanSessionId(shortCode);
  visit = {
    shortCode,
    sequenceWord: options.sequenceWord ?? null,
    deckId: options.deckId ?? null,
    deckName: options.deckName ?? null,
    leftProp: options.leftProp ?? null,
    rightProp: options.rightProp ?? null,
    isAuthenticated: options.isAuthenticated ?? (() => false),
  };
  lastRegisteredSuperProperties = null;
  sessionState = createScanSessionState();
  clearPendingEvents();
  installPagehideHandler();
  postHogReadyCleanup?.();
  postHogReadyCleanup = onPostHogReady((instance) => {
    registerSuperProperties(readScanBaseProperties(), instance);
    flushQueuedScanEvents(instance);
  });
  registerSuperProperties();
}

/**
 * Fill in the attribution that only exists after the short code resolves.
 * Partial by design — deck attribution and the word land at different moments.
 */
export function updateScanAttribution(
  attribution: Partial<
    Pick<
      ScanVisitContext,
      "sequenceWord" | "deckId" | "deckName" | "leftProp" | "rightProp"
    >
  >
): void {
  if (!visit) return;
  visit = {
    ...visit,
    sequenceWord: attribution.sequenceWord ?? visit.sequenceWord,
    deckId: attribution.deckId ?? visit.deckId,
    deckName: attribution.deckName ?? visit.deckName,
    leftProp: attribution.leftProp ?? visit.leftProp,
    rightProp: attribution.rightProp ?? visit.rightProp,
  };
  registerSuperProperties();
}

/** Refresh dynamic attribution after auth changes, even before another event. */
export function refreshScanSessionAttribution(): void {
  registerSuperProperties();
}

/** Is this page part of the active /q-origin scan visit? */
export function isScanVisit(): boolean {
  return browser && visit !== null;
}

/**
 * The full base set, or null when this isn't a scan visit.
 *
 * Exported so a caller that builds its own payload (a batched event, a
 * non-PostHog sink) gets the identical property names rather than re-deriving
 * them.
 */
export function scanBaseProperties(): ScanBaseProperties | null {
  const base = readScanBaseProperties();
  if (!base) return null;
  registerSuperProperties(base);
  return base;
}

function readScanBaseProperties(): ScanBaseProperties | null {
  if (!browser || !visit || !visitScanSessionId) return null;

  let deviceId: string | null = null;
  try {
    deviceId = getDeviceId();
  } catch {
    // Storage blocked — the scan_session_id still carries the visit.
  }

  return {
    short_code: visit.shortCode,
    sequence_word: visit.sequenceWord,
    deck_id: visit.deckId,
    deck_name: visit.deckName,
    ...scanPropProperties(visit.leftProp, visit.rightProp),
    is_authenticated: visit.isAuthenticated(),
    device_id: deviceId,
    scan_session_id: visitScanSessionId,
  };
}

/**
 * Capture a scan event with the base set merged in. No-ops off /q — the shared
 * viewer shell renders in the app drawer too, and an app-drawer click is not a
 * scan. Callers that want telemetry on both surfaces branch on isScanVisit()
 * explicitly rather than getting a half-attributed event by accident.
 */
export function captureScanEvent(
  eventName: string,
  properties?: Record<string, unknown>,
  options?: CaptureOptions
): void {
  const base = scanBaseProperties();
  if (!base) return;
  const payload = { ...base, ...properties };
  if (!getPostHogInstance()) {
    queuedScanEvents.push({ eventName, properties: payload, options });
    return;
  }
  captureEvent(eventName, payload, options);
}

/** Mark the point where the shared viewer, not merely the QR route, is usable. */
export function captureScanViewerOpened(mode: string): void {
  if (
    !isScanVisit() ||
    sessionState.viewerOpenedAt !== null ||
    sessionState.ended
  )
    return;
  sessionState = {
    ...sessionState,
    viewerOpenedAt: Date.now(),
    lastMode: mode,
  };
  captureScanEvent("qr_viewer_opened", { mode });
}

export function captureScanViewChanged(
  fromMode: string,
  toMode: string,
  source: string,
  options: ScanIntentOptions = {}
): void {
  if (fromMode === toMode) return;
  captureInteraction(
    "qr_view_changed",
    { from_mode: fromMode, to_mode: toMode, source },
    { mode: toMode, count: options.count }
  );
}

export function captureScanPlaybackChanged(properties: {
  action: "play" | "pause" | "seek" | "step_select" | "qr_play" | "mode";
  previous_value?: ScanAnalyticsValue;
  value?: ScanAnalyticsValue;
  source: string;
  bpm?: number;
  step?: number;
  coalesce?: boolean;
  count?: boolean;
}): void {
  const { coalesce = false, count, ...eventProperties } = properties;
  const key = coalesce
    ? `playback:${properties.action}:${properties.source}`
    : null;
  captureInteraction(
    "qr_playback_changed",
    eventProperties,
    {
      played: properties.action === "play" || properties.action === "qr_play",
      count,
    },
    key
  );
}

export function captureScanSettingChanged(properties: {
  group: string;
  setting: string;
  previous_value: ScanAnalyticsValue;
  value: ScanAnalyticsValue;
  previous_left_prop?: ScanAnalyticsValue;
  previous_right_prop?: ScanAnalyticsValue;
  left_prop?: ScanAnalyticsValue;
  right_prop?: ScanAnalyticsValue;
  source?: string;
  coalesce?: boolean;
  count?: boolean;
}): void {
  if (properties.previous_value === properties.value) return;
  const { coalesce = false, count, ...eventProperties } = properties;
  const key = coalesce
    ? `setting:${properties.group}:${properties.setting}`
    : null;
  captureInteraction("qr_setting_changed", eventProperties, { count }, key);
}

export function captureScanPracticeChanged(
  action: string,
  properties: Record<string, ScanAnalyticsValue> = {},
  coalesce = false
): void {
  captureInteraction(
    "qr_practice_changed",
    { action, ...properties },
    { practiced: true },
    coalesce ? `practice:${action}:${properties.changed_fields ?? ""}` : null
  );
}

export function captureScanAction(
  action: string,
  properties: Record<string, ScanAnalyticsValue> = {},
  options: ScanIntentOptions = {}
): void {
  captureInteraction(
    "qr_action",
    { action, ...properties },
    { count: options.count }
  );
}

export function captureScanExport(
  kind: string,
  stage: ScanExportStage,
  properties: Record<string, ScanAnalyticsValue> = {}
): void {
  captureInteraction(
    "qr_export",
    { export_kind: kind, stage, ...properties },
    scanExportSessionInteraction(stage, properties.user_initiated === true)
  );
}

/**
 * Register work that must become terminal before the session summary. Export
 * owners use this to cancel active attempts on close, navigation, or pagehide,
 * preventing a late async completion from landing after the summary.
 */
export function registerScanSessionCleanup(
  cleanup: (reason: ScanExitReason) => void
): () => void {
  if (!isScanVisit()) return () => {};
  sessionEndCleanups.add(cleanup);
  return () => sessionEndCleanups.delete(cleanup);
}

/**
 * One summary per mounted scan viewer. Page-exit capture bypasses batching and
 * asks the PostHog SDK for sendBeacon; explicit UI exits use the normal queue.
 */
export function endScanViewerSession(exitReason: ScanExitReason): void {
  if (!isScanVisit()) return;
  const cleanups = [...sessionEndCleanups];
  sessionEndCleanups.clear();
  for (const cleanup of cleanups) cleanup(exitReason);
  const lifecycleOptions =
    exitReason === "pagehide"
      ? { send_instantly: true, transport: "sendBeacon" as const }
      : undefined;
  flushPendingEvents(lifecycleOptions);
  const result = finishScanSession(sessionState, exitReason);
  if (!result) {
    // A failed /q resolve never opens the viewer, so there is no summary to
    // emit. It still has to stop being the active in-memory visit when the
    // route goes away. Keep the sessionStorage id: a same-code reload/retry is
    // the same physical scan and beginScanVisit() will recover it.
    deactivateScanVisit();
    return;
  }
  sessionState = result.state;
  captureScanEvent(
    "qr_session_summary",
    { ...result.summary },
    lifecycleOptions
  );
  retireCompletedScanVisit();
}

function flushQueuedScanEvents(instance: PostHogReadyClient): void {
  const events = queuedScanEvents.splice(0);
  for (const event of events) {
    captureEventWithPostHog(
      instance,
      event.eventName,
      event.properties,
      event.options
    );
  }
}

function retireCompletedScanVisit(): void {
  if (!visit || !visitScanSessionId) return;
  const key = `${SCAN_SESSION_PREFIX}${visit.shortCode}`;
  const completedId = visitScanSessionId;

  try {
    if (sessionStorage.getItem(key) === completedId) {
      sessionStorage.removeItem(key);
    }
  } catch {
    // The in-memory fallback below still retires storage-blocked visits.
  }

  if (memorySessionIds.get(key) === completedId) {
    memorySessionIds.delete(key);
  }
  deactivateScanVisit();
}

/** Stop scan-only shared instrumentation without retiring reload recovery. */
function deactivateScanVisit(): void {
  visit = null;
  visitScanSessionId = null;
  lastRegisteredSuperProperties = null;
  clearPendingEvents();
  if (browser && pagehideHandler) {
    window.removeEventListener("pagehide", pagehideHandler, true);
  }
  pagehideHandler = null;
}

function captureInteraction(
  eventName: string,
  properties: Record<string, unknown>,
  interaction: ScanSessionInteraction,
  coalesceKey: string | null = null
): void {
  if (!isScanVisit() || sessionState.ended) return;
  if (!coalesceKey) {
    emitInteraction(eventName, properties, interaction);
    return;
  }

  const pending = pendingEvents.get(coalesceKey);
  if (pending) {
    clearTimeout(pending.timer);
    pending.properties = {
      ...pending.properties,
      ...properties,
      previous_value: pending.properties.previous_value,
    };
    pending.interaction = { ...pending.interaction, ...interaction };
    pending.timer = setTimeout(() => flushPendingEvent(coalesceKey), 450);
    return;
  }

  pendingEvents.set(coalesceKey, {
    eventName,
    properties,
    interaction,
    timer: setTimeout(() => flushPendingEvent(coalesceKey), 450),
  });
}

function emitInteraction(
  eventName: string,
  properties: Record<string, unknown>,
  interaction: ScanSessionInteraction,
  options?: CaptureOptions
): void {
  sessionState = recordScanSessionInteraction(sessionState, interaction);
  captureScanEvent(eventName, properties, options);
}

function flushPendingEvent(key: string, options?: CaptureOptions): void {
  const pending = pendingEvents.get(key);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingEvents.delete(key);
  emitInteraction(
    pending.eventName,
    pending.properties,
    pending.interaction,
    options
  );
}

function flushPendingEvents(options?: CaptureOptions): void {
  for (const key of [...pendingEvents.keys()]) flushPendingEvent(key, options);
}

function clearPendingEvents(): void {
  for (const pending of pendingEvents.values()) clearTimeout(pending.timer);
  pendingEvents.clear();
}

function installPagehideHandler(): void {
  if (!browser) return;
  if (pagehideHandler)
    window.removeEventListener("pagehide", pagehideHandler, true);
  pagehideHandler = (event: PageTransitionEvent) => {
    // A bfcache trip is a pause, not an exit. The same live viewer resumes.
    if (event.persisted) return;
    endScanViewerSession("pagehide");
  };
  // Capture phase runs before PostHog's bubble listener, so even SDK versions
  // that ignore the transport override still see this event before queue flush.
  window.addEventListener("pagehide", pagehideHandler, { capture: true });
}

/**
 * Pin the full scan attribution as PostHog session super properties so it rides
 * along
 * on the events we do NOT author: $pageview, $pageleave, autocapture clicks,
 * $exception, $web_vitals. That is what makes a replay-less session
 * reconstructable — every event in it points back at the card.
 *
 * Session-scoped (register_for_session), not persistent: scan attribution must
 * not follow this browser onto every future page forever. Runs lazily because
 * beginScanVisit is deliberately called before PostHog finishes initializing.
 */
function registerSuperProperties(
  base = readScanBaseProperties(),
  instance: PostHogReadyClient | null = getPostHogInstance()
): void {
  if (!base) return;
  if (!instance) return;
  const signature = JSON.stringify(base);
  if (signature === lastRegisteredSuperProperties) return;
  instance.register_for_session(base);
  lastRegisteredSuperProperties = signature;
}

/** Test-only reset of the module-level visit. */
export function _resetScanAnalytics(): void {
  clearPendingEvents();
  queuedScanEvents.length = 0;
  sessionEndCleanups.clear();
  if (browser && pagehideHandler) {
    window.removeEventListener("pagehide", pagehideHandler, true);
  }
  pagehideHandler = null;
  postHogReadyCleanup?.();
  postHogReadyCleanup = null;
  visit = null;
  visitScanSessionId = null;
  lastRegisteredSuperProperties = null;
  sessionState = createScanSessionState();
  memorySessionIds.clear();
}
