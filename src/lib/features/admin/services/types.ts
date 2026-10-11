/**
 * Co-exported types from retired interface contracts.
 */

import type { PresenceLocation } from "#lib/shared/presence/domain/models/presence-models.js";


export type AuditActionType =
  | "role_changed"
  | "account_disabled"
  | "account_enabled"
  | "user_data_reset"
  | "user_deleted"
  | "announcement_created"
  | "announcement_updated"
  | "announcement_deleted"
  | "flag_updated"
  | "other";
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  action: AuditActionType;
  performedBy: string; // admin user ID
  affectedUserId?: string; // user being affected (if applicable)
  summary: string; // human-readable description
  details?: Record<string, unknown>; // additional metadata
}


export interface CachedUserMetadata {
  id: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  sequenceCount: number;
  publicSequenceCount: number;
  totalViews: number;
  shareCount: number;
  lastActivityDate: Date | null;
  createdAt: Date | null;
  disabled: boolean;
  role: string;
  /** Guest session flag. True for un-upgraded anonymous auth users. */
  isAnonymous: boolean;
  /** Attribution record captured at signup + any self-reported updates. Null for older accounts. */
  attribution: Record<string, unknown> | null;
  /** Persistent last-known IP location (admin view). */
  lastLocation?: PresenceLocation | null;
}
export interface CachedAnnouncement {
  id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  audiences: string[];
  displayMode: "modal" | "banner";
  createdAt: Date | null;
  expiresAt: Date | null;
  actionLabel?: string;
  actionUrl?: string;
}

export interface AdminUserAccountSummary {
  totalAuthAccounts: number;
  registeredAccounts: number;
  anonymousAccounts: number;
  totalProfiles: number;
  registeredProfiles: number;
  anonymousProfiles: number;
  missingRegisteredProfiles: number;
}

export interface SystemState {
  users: CachedUserMetadata[];
  announcements: CachedAnnouncement[];
  accountSummary: AdminUserAccountSummary | null;
  loadedAt: number;
  expiresAt: number;
}


export interface SummaryMetrics {
  totalUsers: number;
  activeToday: number;
  sequencesCreated: number;
  previousTotalUsers: number;
  previousActiveToday: number;
  previousSequencesCreated: number;
}
export interface UserActivityPoint {
  date: string;
  activeUsers: number;
}
export interface ContentStatistics {
  totalSequences: number;
  publicSequences: number;
  totalViews: number;
  totalShares: number;
}
export interface TopSequenceData {
  id: string;
  name: string;
  word: string;
  views: number;
  creator: string;
}
export interface AnalyticsTimeRange {
  days: number;
  startDate: Date;
  endDate: Date;
}
export interface EventTypeBreakdown {
  eventType: string;
  count: number;
  label: string;
  color: string;
}
export interface ModuleUsageData {
  module: string;
  views: number;
  label: string;
  color: string;
}
export interface RecentActivityEvent {
  id: string;
  eventType: string;
  category: string;
  timestamp: Date;
  userId: string;
  metadata?: Record<string, unknown>;
  user?: {
    displayName: string;
    photoURL: string | null;
    email: string | null;
  };
}


export interface UserEngagementSummary {
  /** Evidence source used for this window */
  source: "posthog" | "composer";
  /** ISO timestamp of last activity */
  lastActiveAt: string | null;
  /** ISO timestamp of account creation (from PostHog person properties) */
  memberSince: string | null;
  /** Number of sessions in the specified period */
  sessionsCount: number;
  /** Average session duration in milliseconds */
  avgSessionDuration: number;
  /** Total time spent in app in the period (ms) */
  totalTimeSpent: number;
}

export interface ModuleActivityBreakdown {
  /** Module name (browse, create, learn, etc.) */
  module: string;
  /** Percentage of time/activity in this module (0-100) */
  percentage: number;
  /** Number of events in this module */
  eventCount: number;
}

export interface ContentMetrics {
  /** Sequences created */
  sequencesCreated: number;
  /** Sequences saved to library */
  sequencesSaved: number;
  /** Sequences exported (PNG, etc.) */
  sequencesExported: number;
  /** Collections created */
  collectionsCreated: number;
  /** Sequences shared (public) */
  sequencesShared: number;
}

export interface PostHogSessionSummary {
  source: "posthog";
  /** PostHog session ID */
  sessionId: string;
  /** Session start time */
  startedAt: Date;
  /** Session end time (null if ongoing) */
  endedAt: Date | null;
  /** Session duration in milliseconds */
  duration: number;
  /** Modules visited during session */
  modules: string[];
  /** Total analytics events captured during the session */
  eventCount: number;
  /** Captured PostHog exception events */
  exceptionCount: number;
  /** Save, create, export, share, and collection actions */
  contentActionCount: number;
  /** First and last page routes observed during the session */
  entryPath: string | null;
  exitPath: string | null;
  /** Last observed client context */
  browser: string | null;
  operatingSystem: string | null;
  deviceType: string | null;
  /** Direct handoff to the session in PostHog */
  postHogUrl: string | null;
}

export interface ComposerSessionSummary {
  source: "composer";
  /** Composer session document ID */
  sessionId: string;
  /** First and last persisted activity in this Composer session */
  startedAt: Date;
  endedAt: Date;
  /** Persisted activity window in milliseconds */
  duration: number;
  /** Sequence draft metadata captured by the Composer */
  name: string | null;
  status: "active" | "completed" | "abandoned" | null;
  stepCount: number | null;
  isSaved: boolean | null;
  lastAutosaveAt: Date | null;
}

export type UserActivitySessionSummary =
  | PostHogSessionSummary
  | ComposerSessionSummary;

export interface PostHogSessionEvent {
  eventId: string;
  timestamp: Date;
  event: string;
  path: string | null;
  detail: string | null;
  exception: {
    type: string | null;
    message: string | null;
  } | null;
}

export type PostHogReplayAccessState =
  | "ready"
  | "processing"
  | "unavailable"
  | "configuration"
  | "error";

export interface PostHogReplayAccess {
  state: PostHogReplayAccessState;
  embedUrl: string | null;
  message: string;
}

export type TimePeriod = "today" | "week" | "month" | "all";


export interface UserWithActivity {
  userId: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  online: boolean;
  lastSeen: number;
  currentModule?: string;
  currentTab?: string | null;
  sessionId?: string;
  recentEventCount?: number;
}

export interface SessionSummary {
  sessionId: string;
  startedAt: Date;
  endedAt?: Date;
  duration: number;
  eventCount: number;
  modules: string[];
}

export interface UserActivityQueryOptions {
  userId: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  sessionId?: string;
}
