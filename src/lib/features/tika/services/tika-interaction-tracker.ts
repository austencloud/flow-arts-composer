/**
 * TikaInteractionTracker
 *
 * Persists topic interaction data to Firestore at
 * users/{uid}/tikaInteractions/{topicId}. One document per topic,
 * upserted atomically via Firestore increment/serverTimestamp.
 *
 * Quiz results are also delegated to QuizHistoryRecorder with a
 * "tika-inline" quizType marker so they feed into mastery calculations.
 */

import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit as firestoreLimit,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { recordAttempt } from "#lib/features/learn/services/quiz-history-recorder.js";

export interface TikaTopicInteraction {
  /** Normalized topic identifier (e.g., "letter-A", "position-alpha", "type-1") */
  topic: string;
  /** How many times this topic has been discussed */
  interactionCount: number;
  /** When this topic was last discussed */
  lastDiscussed: Date;
  /** Number of quiz attempts on this topic via TIKA inline quizzes */
  quizAttempts: number;
  /** Ratio of correct answers (0-1), or 0 if no attempts */
  quizCorrectRate: number;
}
import {
  getUserTikaInteractionsPath,
  getUserTikaInteractionPath,
} from "../data/firestore-paths";

const DEFAULT_HISTORY_LIMIT = 20;

export class TikaInteractionTracker {
  constructor() {}

  async recordTopicDiscussion(userId: string, topic: string): Promise<void> {
    const firestore = await getFirestoreInstance();
    const topicId = this.normalizeTopicId(topic);
    const docPath = getUserTikaInteractionPath(userId, topicId);
    const docRef = doc(firestore, docPath);

    const existing = await getDoc(docRef);

    if (existing.exists()) {
      await setDoc(
        docRef,
        {
          interactionCount: increment(1),
          lastDiscussed: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await setDoc(docRef, {
        topic: topicId,
        interactionCount: 1,
        lastDiscussed: serverTimestamp(),
        quizAttempts: 0,
        quizCorrectRate: 0,
      });
    }
  }

  async recordQuizResult(
    userId: string,
    topic: string,
    correct: boolean,
    quizType: string
  ): Promise<void> {
    const firestore = await getFirestoreInstance();
    const topicId = this.normalizeTopicId(topic);

    // 1. Update TIKA interaction stats
    const docPath = getUserTikaInteractionPath(userId, topicId);
    const docRef = doc(firestore, docPath);
    const existing = await getDoc(docRef);

    if (existing.exists()) {
      const data = existing.data();
      const prevAttempts = data.quizAttempts || 0;
      const prevCorrectRate = data.quizCorrectRate || 0;
      const prevCorrectCount = Math.round(prevCorrectRate * prevAttempts);
      const newCorrectCount = prevCorrectCount + (correct ? 1 : 0);
      const newAttempts = prevAttempts + 1;

      await setDoc(
        docRef,
        {
          quizAttempts: newAttempts,
          quizCorrectRate: newCorrectCount / newAttempts,
          lastDiscussed: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await setDoc(docRef, {
        topic: topicId,
        interactionCount: 1,
        lastDiscussed: serverTimestamp(),
        quizAttempts: 1,
        quizCorrectRate: correct ? 1 : 0,
      });
    }

    // 2. Delegate to quiz-history-recorder for mastery tracking
    await recordAttempt(userId, {
      conceptId: topicId,
      quizType: `tika-inline-${quizType}`,
      score: correct ? 100 : 0,
      correctCount: correct ? 1 : 0,
      totalCount: 1,
      timeSpentSeconds: 0,
      timestamp: new Date(),
    });
  }

  async getTopicHistory(
    userId: string,
    limit: number = DEFAULT_HISTORY_LIMIT
  ): Promise<TikaTopicInteraction[]> {
    const firestore = await getFirestoreInstance();
    const collectionPath = getUserTikaInteractionsPath(userId);
    const collectionRef = collection(firestore, collectionPath);
    const q = query(
      collectionRef,
      orderBy("lastDiscussed", "desc"),
      firestoreLimit(limit)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => {
      const data = d.data();
      return {
        topic: data.topic || d.id,
        interactionCount: data.interactionCount || 0,
        lastDiscussed: data.lastDiscussed?.toDate?.() || new Date(),
        quizAttempts: data.quizAttempts || 0,
        quizCorrectRate: data.quizCorrectRate || 0,
      };
    });
  }

  /**
   * Normalize topic strings to consistent document IDs.
   * "letter A" -> "letter-a", "position alpha" -> "position-alpha"
   */
  private normalizeTopicId(topic: string): string {
    return topic
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }
}
