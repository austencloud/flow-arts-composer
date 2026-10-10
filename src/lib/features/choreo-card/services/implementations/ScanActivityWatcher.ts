import {
  collection,
  collectionGroup,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { parsePropTypeFromURLValue } from "#lib/shared/navigation/services/sequence-encoder.js";
import type {
  IScanActivityWatcher,
  ScanActivityAuthor,
  ScanActivityCardDocument,
  ScanActivityEventRecord,
} from "../contracts/IScanActivityWatcher";

const EVENT_WINDOW_SIZE = 100;
const FIRESTORE_IN_LIMIT = 30;

function toFiniteOrNull(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function toISOString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return String(value);
}

function inBatches<T>(values: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
}

export class ScanActivityWatcher implements IScanActivityWatcher {
  async watchRecentEvents(
    onEvents: (events: ScanActivityEventRecord[]) => void,
    onError: (error: Error) => void
  ): Promise<() => void> {
    const firestore = await getFirestoreInstance();
    const eventsQuery = query(
      collectionGroup(firestore, "scanEvents"),
      orderBy("timestamp", "desc"),
      limit(EVENT_WINDOW_SIZE)
    );

    return onSnapshot(
      eventsQuery,
      (snapshot) => {
        const events: ScanActivityEventRecord[] = snapshot.docs.map(
          (eventDoc) => {
            const path = eventDoc.ref.path;
            const code =
              path.match(/^shortcodes\/([^/]+)\/scanEvents\//)?.[1] ?? "?";
            const data = eventDoc.data();
            return {
              id: path,
              code,
              timestamp: toISOString(data.timestamp),
              city:
                typeof data.city === "string" && data.city ? data.city : null,
              country:
                typeof data.country === "string" && data.country
                  ? data.country
                  : null,
              lat: toFiniteOrNull(data.lat),
              lng: toFiniteOrNull(data.lng),
              deviceId:
                typeof data.deviceHash === "string"
                  ? data.deviceHash
                  : typeof data.deviceId === "string"
                    ? data.deviceId
                    : null,
              userId: typeof data.userId === "string" ? data.userId : null,
              leftPropType:
                parsePropTypeFromURLValue(data.leftPropType) ?? null,
              rightPropType: parsePropTypeFromURLValue(data.rightPropType) ?? null,
              catDogMode:
                typeof data.catDogMode === "boolean" ? data.catDogMode : null,
            };
          }
        );
        onEvents(events);
      },
      (error) => onError(error)
    );
  }

  async loadCards(codes: string[]): Promise<ScanActivityCardDocument[]> {
    const uniqueCodes = [...new Set(codes.filter(Boolean))];
    if (uniqueCodes.length === 0) return [];

    const firestore = await getFirestoreInstance();
    const shortcodes = collection(firestore, "shortcodes");
    const batches = inBatches(uniqueCodes, FIRESTORE_IN_LIMIT);
    const snapshots = await Promise.all(
      batches.map((batch) =>
        getDocs(query(shortcodes, where(documentId(), "in", batch)))
      )
    );

    return snapshots.flatMap((snapshot) =>
      snapshot.docs.map((cardDoc) => ({
        code: cardDoc.id,
        data: cardDoc.data() as Record<string, unknown>,
      }))
    );
  }

  async loadAuthor(ownerId: string): Promise<ScanActivityAuthor> {
    const firestore = await getFirestoreInstance();
    const snapshot = await getDoc(doc(firestore, "users", ownerId));
    const data = snapshot.data() ?? {};
    return {
      displayName:
        typeof data.displayName === "string" && data.displayName
          ? data.displayName
          : "Unknown",
      avatarUrl: typeof data.photoURL === "string" ? data.photoURL : undefined,
    };
  }
}
