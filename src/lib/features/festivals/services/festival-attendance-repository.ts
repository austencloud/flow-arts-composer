/**
 * festival-attendance-repository
 *
 * Tracks who's going (or interested in) each festival.
 * Each user gets one document per festival they've marked.
 *
 * Path: festivals/{festivalId}/attendance/{userId}
 */

import { firestoreList, firestoreSet, firestoreDelete } from "#lib/shared/firestore/index.js";
import { FestivalAttendanceSchema } from "../domain/models/festival-schemas";
import type { FestivalAttendance } from "../domain/models/festival";

function attendancePath(festivalId: string): string {
  return `festivals/${festivalId}/attendance`;
}

export async function getCount(festivalId: string): Promise<number> {
  const items = await firestoreList(attendancePath(festivalId), FestivalAttendanceSchema);
  return items.length;
}

export async function getAttendees(festivalId: string): Promise<FestivalAttendance[]> {
  return firestoreList(attendancePath(festivalId), FestivalAttendanceSchema) as unknown as Promise<FestivalAttendance[]>;
}

export async function setAttendance(
  festivalId: string,
  userId: string,
  data: Omit<FestivalAttendance, "festivalId" | "userId">,
): Promise<void> {
  await firestoreSet(attendancePath(festivalId), userId, {
    ...data,
    festivalId,
    userId,
  } as Record<string, unknown>);
}

export async function removeAttendance(festivalId: string, userId: string): Promise<void> {
  await firestoreDelete(attendancePath(festivalId), userId);
}
