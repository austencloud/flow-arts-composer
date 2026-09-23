/**
 * Searches for sequences with fuzzy matching, name search, smart ranking, and VTG aliases
 */
import type { MatchedSequence } from "../types";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

// Known user ID for Austen (primary sequence creator)
const AUSTEN_USER_ID = "PBp3GSBO6igCKPwJyLZNmVEmamI3";

// Max sequences to fetch for client-side filtering
const MAX_FETCH_LIMIT = 200;

// VTG terminology aliases → TKA patterns they map to
const VTG_ALIASES: Record<string, string[]> = {
  // Timing + direction combinations
  "tog-same": ["G", "H", "I"], // beta→beta with same direction
  "together-same": ["G", "H", "I"],
  "ts": ["G", "H", "I"],
  "split-same": ["A", "B", "C"], // alpha→alpha with same direction
  "ss": ["A", "B", "C"],
  "tog-opp": ["DJ", "EK", "FL"], // compounds with opposite direction
  "together-opp": ["DJ", "EK", "FL"],
  "to": ["DJ", "EK", "FL"],
  "split-opp": ["DJ", "EK", "FL"], // same compounds, different variation
  "so": ["DJ", "EK", "FL"],
  // Motion types
  "isolation": ["D", "J", "DJ"], // pro/pro movements
  "antispin": ["E", "K", "EK"], // anti/anti movements
  "hybrid": ["F", "L", "FL"], // mixed pro/anti
  // Position names
  "alpha": ["A", "B", "C", "D", "E", "F", "J", "K", "L"],
  "beta": ["G", "H", "I", "D", "E", "F", "J", "K", "L"],
  "gamma": ["M", "N", "O", "P", "Q", "R"],
};

interface ScoredMatch {
  sequence: MatchedSequence;
  score: number;
  matchType: "exact" | "starts" | "contains" | "name" | "fuzzy";
}

export class SequenceMatcher {
  private cachedSequences: MatchedSequence[] | null = null;
  private cacheTimestamp = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async searchByWord(query: string): Promise<MatchedSequence[]> {
    const normalizedQuery = query.toUpperCase().trim();
    if (!normalizedQuery) return [];

    const allSequences = await this.getAllSequences();
    const scored: ScoredMatch[] = [];

    // Check if query is a VTG alias
    const vtgPatterns = VTG_ALIASES[query.toLowerCase()];

    for (const seq of allSequences) {
      const match = this.scoreMatch(seq, normalizedQuery, vtgPatterns);
      if (match) {
        scored.push(match);
      }
    }

    // Sort by score (higher = better), then by word length (shorter = better)
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        stripWordNotation(a.sequence.word).length - stripWordNotation(b.sequence.word).length
      );
    });

    return scored.map((s) => s.sequence);
  }

  private scoreMatch(
    seq: MatchedSequence,
    query: string,
    vtgPatterns?: string[]
  ): ScoredMatch | null {
    // Skew braces mark a span, not a letter: match against the letters inside.
    const word = stripWordNotation(seq.word).toUpperCase();
    const name = seq.name.toUpperCase();

    // Exact word match (highest priority)
    if (word === query) {
      return { sequence: seq, score: 100, matchType: "exact" };
    }

    // Word starts with query
    if (word.startsWith(query)) {
      return { sequence: seq, score: 80, matchType: "starts" };
    }

    // Word contains query
    if (word.includes(query)) {
      return { sequence: seq, score: 60, matchType: "contains" };
    }

    // Name contains query (search by name/description)
    if (name.includes(query)) {
      return { sequence: seq, score: 50, matchType: "name" };
    }

    // VTG alias match
    if (vtgPatterns) {
      for (const pattern of vtgPatterns) {
        if (word.includes(pattern)) {
          return { sequence: seq, score: 45, matchType: "contains" };
        }
      }
    }

    // Fuzzy match (typo tolerance)
    const fuzzyScore = this.fuzzyMatch(word, query);
    if (fuzzyScore > 0) {
      return { sequence: seq, score: fuzzyScore, matchType: "fuzzy" };
    }

    return null;
  }

  /**
   * Get TKA letter count (dashes are modifiers, not letters)
   * "CCCΦ-" = 4 letters (C, C, C, Φ)
   * "Σ-Δ-" = 2 letters (Σ, Δ)
   */
  private getTkaLetterCount(word: string): number {
    return word.replace(/-/g, "").length;
  }

  /**
   * Strict fuzzy matching - only allows minor typos for near-exact matches
   * Returns a score 0-40 based on similarity (0 = no match)
   */
  private fuzzyMatch(word: string, query: string): number {
    // Strip dashes for TKA-aware comparison
    const wordLetters = word.replace(/-/g, "");
    const queryLetters = query.replace(/-/g, "");

    // Skip fuzzy for short queries (too many false positives)
    if (queryLetters.length < 4) return 0;

    // Only allow fuzzy matching when TKA letter counts are very similar
    // "CCCC" (4) should NOT match "CCCΦ" (4) - different final letter
    const lengthDiff = Math.abs(wordLetters.length - queryLetters.length);
    if (lengthDiff > 1) return 0;

    // Calculate Levenshtein distance on letter-only strings
    const distance = this.levenshteinDistance(wordLetters, queryLetters);

    // Very strict: only 1 edit allowed, and only for same-length or off-by-one
    if (distance === 1 && lengthDiff === 0) {
      // Single character substitution - but "C" → "Φ" is not a typo
      // Only accept if the differing characters are plausibly confused
      // For now, just disable same-length fuzzy matching entirely
      // It causes more false positives than it catches real typos
      return 0;
    }

    if (distance === 1 && lengthDiff === 1) {
      // Single character added/removed - only accept if it's at the end
      const shorter = wordLetters.length < queryLetters.length ? wordLetters : queryLetters;
      const longer = wordLetters.length < queryLetters.length ? queryLetters : wordLetters;
      if (longer.startsWith(shorter) || longer.endsWith(shorter)) {
        return 20;
      }
    }

    return 0;
  }

  private commonPrefixLength(a: string, b: string): number {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
  }

  private commonSuffixLength(a: string, b: string): number {
    let i = 0;
    while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
    return i;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0]![j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const prevRow = matrix[i - 1];
        const currRow = matrix[i];
        if (!prevRow || !currRow) continue;

        if (b[i - 1] === a[j - 1]) {
          currRow[j] = prevRow[j - 1] ?? 0;
        } else {
          currRow[j] = Math.min(
            (prevRow[j - 1] ?? 0) + 1, // substitution
            (currRow[j - 1] ?? 0) + 1, // insertion
            (prevRow[j] ?? 0) + 1 // deletion
          );
        }
      }
    }

    const lastRow = matrix[b.length];
    return lastRow?.[a.length] ?? 0;
  }

  private async getAllSequences(): Promise<MatchedSequence[]> {
    // Return cached if fresh
    if (this.cachedSequences && Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.cachedSequences;
    }

    const { collection, getDocs, query, limit } = await import("firebase/firestore");
    const db = await getFirestoreInstance();

    const results: MatchedSequence[] = [];
    const seenIds = new Set<string>();

    const publicQuery = query(collection(db, "publicSequences"), limit(MAX_FETCH_LIMIT));
    const publicSnapshot = await getDocs(publicQuery);

    for (const doc of publicSnapshot.docs) {
      const data = doc.data();
      seenIds.add(doc.id);
      results.push({
        id: doc.id,
        word: (data["word"] as string | undefined) || "",
        name: (data["name"] as string | undefined) || (data["word"] as string | undefined) || "Untitled",
        ownerId: (data["ownerId"] as string | undefined) || "",
        // `ownerDisplayName` is what the public projection writes; `author` and
        // `ownerName` were ghost fields nothing ever wrote, so this line always
        // rendered "Unknown".
        ownerName: (data["ownerDisplayName"] as string | undefined) || "Unknown",
        thumbnail: (data["thumbnails"] as string[] | undefined)?.[0] ?? null,
        isPublic: true,
      });
    }

    // Fetch from Austen's sequences
    const austenQuery = query(
      collection(db, `users/${AUSTEN_USER_ID}/sequences`),
      limit(MAX_FETCH_LIMIT)
    );
    const austenSnapshot = await getDocs(austenQuery);

    for (const doc of austenSnapshot.docs) {
      if (seenIds.has(doc.id)) continue;
      const data = doc.data();
      results.push({
        id: doc.id,
        word: (data["word"] as string | undefined) || "",
        name: (data["name"] as string | undefined) || (data["word"] as string | undefined) || "Untitled",
        ownerId: AUSTEN_USER_ID,
        ownerName: (data["author"] as string | undefined) || "Austen",
        thumbnail: (data["thumbnails"] as string[] | undefined)?.[0] ?? null,
        isPublic: (data["visibility"] as string | undefined) === "public",
      });
    }

    // Cache results
    this.cachedSequences = results;
    this.cacheTimestamp = Date.now();

    return results;
  }
}
