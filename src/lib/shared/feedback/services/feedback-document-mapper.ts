/**
 * FeedbackDocumentMapper
 *
 * Maps Firestore documents to FeedbackItem domain models.
 * Handles type validation, timestamp conversion, and nested object mapping.
 */

import type { Timestamp } from "firebase/firestore";

import type {
  FeedbackItem,
  AdminResponse,
  TesterConfirmation,
  TesterConfirmationStatus,
  DeviceContext,
  StatusHistoryEntry,
} from "#lib/shared/feedback/domain/models/feedback-models.js";
import {
  isFeedbackStatus,
  isFeedbackType,
} from "#lib/shared/feedback/domain/models/feedback-models.js";

export function mapDocToFeedbackItem(
  id: string,
  data: Record<string, unknown>
): FeedbackItem {
  const adminResponse = mapAdminResponse(data);
  const testerConfirmation = mapTesterConfirmation(data);
  const deviceContext = mapDeviceContext(data);
  const statusHistory = mapStatusHistory(data);

  const type = isFeedbackType(data["type"]) ? data["type"] : "general";
  const status = isFeedbackStatus(data["status"]) ? data["status"] : "new";

  return {
    id,
    userId: data["userId"] as string,
    userEmail: data["userEmail"] as string,
    userDisplayName: data["userDisplayName"] as string,
    userPhotoURL: data["userPhotoURL"] as string | undefined,
    type,
    title: data["title"] as string,
    description: data["description"] as string,
    priority: data["priority"] as FeedbackItem["priority"],
    imageUrls: data["imageUrls"] as string[] | undefined,
    capturedModule: data["capturedModule"] as string,
    capturedTab: data["capturedTab"] as string,
    deviceContext,
    status,
    adminNotes: data["adminNotes"] as string | undefined,
    adminResponse,
    testerConfirmation,
    createdAt: (data["createdAt"] as Timestamp)?.toDate() || new Date(),
    updatedAt: (data["updatedAt"] as Timestamp)?.toDate() || undefined,
    fixedInVersion: data["fixedInVersion"] as string | undefined,
    archivedAt: (data["archivedAt"] as Timestamp)?.toDate() || undefined,
    deferredUntil:
      (data["deferredUntil"] as Timestamp)?.toDate() || undefined,
    reactivatedAt:
      (data["reactivatedAt"] as Timestamp)?.toDate() || undefined,
    reactivatedFrom:
      (data["reactivatedFrom"] as Timestamp)?.toDate() || undefined,
    statusHistory,
    isDeleted: data["isDeleted"] as boolean | undefined,
    deletedAt: (data["deletedAt"] as Timestamp)?.toDate() || undefined,
    deletedBy: data["deletedBy"] as string | undefined,
  };
}

function mapAdminResponse(
  data: Record<string, unknown>
): AdminResponse | undefined {
  const adminResponseData = data["adminResponse"] as
    | Record<string, unknown>
    | undefined;

  if (!adminResponseData) return undefined;

  return {
    message: adminResponseData["message"] as string,
    respondedAt:
      (adminResponseData["respondedAt"] as Timestamp)?.toDate() || new Date(),
    respondedBy: adminResponseData["respondedBy"] as string,
  };
}

function mapTesterConfirmation(
  data: Record<string, unknown>
): TesterConfirmation | undefined {
  const confirmationData = data["testerConfirmation"] as
    | Record<string, unknown>
    | undefined;

  if (!confirmationData) return undefined;

  return {
    status: confirmationData["status"] as TesterConfirmationStatus,
    comment: confirmationData["comment"] as string | undefined,
    respondedAt: (confirmationData["respondedAt"] as Timestamp)?.toDate(),
  };
}

function mapDeviceContext(
  data: Record<string, unknown>
): DeviceContext | undefined {
  const deviceContextData = data["deviceContext"] as
    | Record<string, unknown>
    | undefined;

  if (!deviceContextData) return undefined;

  return {
    userAgent: deviceContextData["userAgent"] as string,
    platform: deviceContextData["platform"] as string,
    isTouchDevice: deviceContextData["isTouchDevice"] as boolean,
    viewportWidth: deviceContextData["viewportWidth"] as number,
    viewportHeight: deviceContextData["viewportHeight"] as number,
    screenWidth: deviceContextData["screenWidth"] as number,
    screenHeight: deviceContextData["screenHeight"] as number,
    devicePixelRatio: deviceContextData["devicePixelRatio"] as number,
    appVersion: deviceContextData["appVersion"] as string,
    currentModule: deviceContextData["currentModule"] as string | undefined,
    currentTab: deviceContextData["currentTab"] as string | undefined,
    capturedAt:
      (deviceContextData["capturedAt"] as Timestamp)?.toDate() || new Date(),
  };
}

function mapStatusHistory(
  data: Record<string, unknown>
): StatusHistoryEntry[] | undefined {
  const statusHistoryData = data["statusHistory"] as
    | Array<Record<string, unknown>>
    | undefined;

  if (!statusHistoryData) return undefined;

  return statusHistoryData.map((entry) => ({
    status: isFeedbackStatus(entry["status"]) ? entry["status"] : "new",
    timestamp: (entry["timestamp"] as Timestamp)?.toDate() || new Date(),
    fromStatus: isFeedbackStatus(entry["fromStatus"])
      ? entry["fromStatus"]
      : undefined,
  }));
}
