/**
 * workshop-portfolio-repository
 *
 * Persists a user's teaching portfolio: workshop templates, bios,
 * performance credits, social links, and insurance info.
 *
 * Path: userProfiles/{userId}/workshopPortfolio/data (single document)
 */

import { firestoreGet, firestoreSet } from "#lib/shared/firestore/index.js";
import { TeachingPortfolioSchema } from "../domain/models/workshop-portfolio-schemas";
import type { TeachingPortfolio } from "../domain/models/teaching-portfolio";

function portfolioPath(userId: string): string {
  return `userProfiles/${userId}/workshopPortfolio`;
}

export async function get(userId: string): Promise<TeachingPortfolio | null> {
  const result = await firestoreGet(portfolioPath(userId), "data", TeachingPortfolioSchema) as TeachingPortfolio | null;
  if (!result) return null;
  // Backwards compat: acts field added after initial release
  if (!result.acts) result.acts = [];
  return result;
}

export async function set(userId: string, portfolio: TeachingPortfolio): Promise<void> {
  await firestoreSet(portfolioPath(userId), "data", {
    ...portfolio,
    userId,
  } as Record<string, unknown>, { merge: true });
}
