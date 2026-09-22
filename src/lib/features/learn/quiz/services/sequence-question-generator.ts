import type { Catalog } from "$lib/features/choreo-card/domain/models/Catalog";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { getCachedCatalogs, loadCatalogs, loadCatalogSequencesPage } from "$lib/features/choreo-card/services/catalog-loader";
import { QuizAnswerFormat, QuizQuestionFormat, QuizType } from "../domain/enums/quiz-enums";
import type { QuizAnswerOption, QuizQuestionData } from "../domain/models/quiz-models";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";
import { calculate as calculateMandalaGeometry } from "$lib/shared/mandala/services/mandala-geometry-calculator";
import { shapeKey } from "$lib/shared/mandala/services/mandala-fingerprint";

let sequencePool: SequenceData[] = [];
let isInitialized = false;
const recentWords: string[] = [];
const RECENT_WORD_HISTORY = 5;
const LOAD_TIMEOUT_MS = 15_000;
const SEQS_PER_CATALOG = 8;

const sequenceCatalogMap = new Map<string, string>();
let mandalaShapeKeyCache = new WeakMap<SequenceData, string>();

export function getCatalogIdForSequence(sequenceId: string): string | undefined {
  return sequenceCatalogMap.get(sequenceId);
}

function isMatchingCatalog(d: Catalog): boolean {
  return d.level === 1;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function initialize(): Promise<void> {
  if (isInitialized) return;

  const cached = getCachedCatalogs();
  let allCatalogs: Catalog[];

  if (cached && cached.length > 0) {
    allCatalogs = cached;
  } else {
    allCatalogs = await withTimeout(loadCatalogs(), LOAD_TIMEOUT_MS, "loadCatalogs");
  }

  const matchingCatalogs = allCatalogs.filter(isMatchingCatalog);

  if (matchingCatalogs.length === 0) {
    throw new Error("No L1 rotated quartered 16-count catalogs found");
  }

  shuffleArray(matchingCatalogs);
  const catalogsToLoad = matchingCatalogs.slice(0, 20);

  const loads = catalogsToLoad.map((catalog) =>
    withTimeout(
      loadCatalogSequencesPage(catalog.id, SEQS_PER_CATALOG),
      LOAD_TIMEOUT_MS,
      `loadCatalogSequencesPage(${catalog.id})`
    )
      .then((r) => ({ catalogId: catalog.id, sequences: r.sequences }))
      .catch(() => ({ catalogId: catalog.id, sequences: [] as SequenceData[] }))
  );

  const results = await Promise.all(loads);

  sequenceCatalogMap.clear();
  sequencePool = [];
  for (const { catalogId, sequences } of results) {
    for (const seq of sequences) {
      if (seq.word && seq.word.length > 0) {
        sequencePool.push(seq);
        sequenceCatalogMap.set(seq.id, catalogId);
      }
    }
  }

  if (sequencePool.length < 4) {
    throw new Error(
      `Need at least 4 sequences with distinct words across ${matchingCatalogs.length} catalogs, found ${sequencePool.length}`
    );
  }

  isInitialized = true;
}

/**
 * Optional constraints for sequence-based questions, used by the Play arcade
 * (Read the Performer, Mandala Match).
 */
export interface SequenceQuestionOptions {
  /** Soft filter: prefer sequences whose simplified word is this length;
   *  falls back to the unfiltered pool if fewer than 4 candidates match. */
  wordLength?: number;
  /** Total answer options including the correct one (default 4). */
  optionCount?: number;
  /** Prefer distractor words that share more letters with the target word
   *  (lookalikes), ranked by shared-letter count descending. Mandala Match's
   *  "Lookalikes" level (3) is the only caller that sets this. */
  similarDistractors?: boolean;
}

export async function generateSequenceToWordQuestion(
  questionId: string,
  options: SequenceQuestionOptions = {}
): Promise<QuizQuestionData> {
  if (!isInitialized) {
    await initialize();
  }

  const correctSequence = pickRandomSequence(options.wordLength);
  const correctWord = simplifyRepeatedWord(correctSequence.word);

  const distractorWords = pickDistractorWords(
    correctSequence.word,
    (options.optionCount ?? 4) - 1,
    options.similarDistractors ?? false
  );

  const allWords = [correctWord, ...distractorWords];
  shuffleArray(allWords);

  const answerOptions: QuizAnswerOption[] = allWords.map((word) => ({
    id: generateOptionId(),
    content: word,
    isCorrect: word === correctWord,
  }));

  trackRecentWord(correctSequence.word);

  return {
    questionId,
    questionContent: correctSequence,
    answerOptions,
    correctAnswer: correctWord,
    questionType: QuizQuestionFormat.SEQUENCE_3D,
    answerType: QuizAnswerFormat.WORD_BUTTON,
    lessonType: QuizType.SEQUENCE_TO_WORD,
    generationTimestamp: new Date().toISOString(),
  };
}

/**
 * Options for whole-sequence matching questions (the mandala game family):
 * every answer option is a full SequenceData — rendered by the caller as a
 * choreo card or a mandala — instead of a word string.
 */
export interface SequenceMatchOptions {
  /** Total answer options including the correct one (default 4). */
  optionCount?: number;
  /** Prefer distractor sequences whose words share letters with the target
   *  (lookalike mandalas/cards). */
  similarDistractors?: boolean;
  /** Soft filter: prefer sequences with exactly this many steps (the games
   *  start at 8-count); falls back to the whole pool when too few match. */
  stepCount?: number;
  /** Which mandala-family game this question belongs to (stamped on the
   *  question for history/analytics; content shape is identical). */
  lessonType: QuizType;
}

/**
 * One target sequence + N-1 distractor sequences with distinct words and
 * distinct rendered mandalas, all from the same catalog pool.
 * `questionContent` and every option's `content` are SequenceData;
 * `correctAnswer` is the target's sequence id.
 */
export async function generateSequenceMatchQuestion(
  questionId: string,
  options: SequenceMatchOptions
): Promise<QuizQuestionData> {
  if (!isInitialized) {
    await initialize();
  }

  const optionCount = options.optionCount ?? 4;

  let pool = sequencePool;
  if (options.stepCount !== undefined) {
    const stepMatches = sequencePool.filter(
      (s) => s.steps.length === options.stepCount
    );
    // Soft constraint: never starve the generator — need enough for the
    // correct answer plus distinct-word distractors.
    if (stepMatches.length >= optionCount) {
      pool = stepMatches;
    }
  }

  let candidates = pool.filter((s) => !recentWords.includes(s.word));
  if (candidates.length < optionCount) {
    candidates = pool;
    recentWords.length = 0;
  }
  const correctSequence =
    candidates[Math.floor(Math.random() * candidates.length)]!;
  const correctWord = simplifyRepeatedWord(correctSequence.word);

  // A different sequence id is not enough to make a fair answer. Multiple
  // words can trace the same mandala, so exclude the target's shape and keep
  // only one option from every other rendered-shape class.
  const seenWords = new Set<string>([correctWord]);
  const seenMandalaShapes = new Set<string>([
    getMandalaShapeKey(correctSequence),
  ]);
  const distractorPool: SequenceData[] = [];
  for (const seq of pool) {
    const word = simplifyRepeatedWord(seq.word);
    if (seenWords.has(word)) continue;

    const mandalaShape = getMandalaShapeKey(seq);
    if (seenMandalaShapes.has(mandalaShape)) continue;

    seenWords.add(word);
    seenMandalaShapes.add(mandalaShape);
    distractorPool.push(seq);
  }

  shuffleArray(distractorPool);
  if (options.similarDistractors) {
    distractorPool.sort(
      (a, b) =>
        sharedLetterCount(simplifyRepeatedWord(b.word), correctWord) -
        sharedLetterCount(simplifyRepeatedWord(a.word), correctWord)
    );
  }

  const chosen = [correctSequence, ...distractorPool.slice(0, optionCount - 1)];
  shuffleArray(chosen);

  const answerOptions: QuizAnswerOption[] = chosen.map((seq) => ({
    id: generateOptionId(),
    content: seq,
    isCorrect: seq.id === correctSequence.id,
  }));

  trackRecentWord(correctSequence.word);

  return {
    questionId,
    questionContent: correctSequence,
    answerOptions,
    correctAnswer: correctSequence.id,
    questionType: QuizQuestionFormat.SEQUENCE_3D,
    answerType: QuizAnswerFormat.PICTOGRAPH,
    lessonType: options.lessonType,
    generationTimestamp: new Date().toISOString(),
  };
}

export function resetState(): void {
  recentWords.length = 0;
  sequencePool = [];
  sequenceCatalogMap.clear();
  mandalaShapeKeyCache = new WeakMap<SequenceData, string>();
  isInitialized = false;
}

function getMandalaShapeKey(sequence: SequenceData): string {
  const cached = mandalaShapeKeyCache.get(sequence);
  if (cached !== undefined) return cached;

  // These defaults match SequenceMandala in the arcade: arc paths and the
  // canonical two-ended prop when no prop override is supplied.
  const key = shapeKey(calculateMandalaGeometry(sequence.steps));
  mandalaShapeKeyCache.set(sequence, key);
  return key;
}

function pickRandomSequence(wordLength?: number): SequenceData {
  let candidates = sequencePool.filter(
    (s) => !recentWords.includes(s.word)
  );

  if (candidates.length < 4) {
    candidates = sequencePool;
    recentWords.length = 0;
  }

  // Soft length filter: prefer sequences whose simplified word matches the
  // requested length, but never starve the question generator over it — fall
  // back to the unfiltered candidate pool when too few match.
  if (wordLength !== undefined) {
    const lengthMatches = candidates.filter(
      // simplifyRepeatedWord keeps the skew braces of a braced word; strip
      // them back out before counting letters against the requested length.
      (s) => stripWordNotation(simplifyRepeatedWord(s.word)).length === wordLength
    );
    if (lengthMatches.length >= 4) {
      candidates = lengthMatches;
    }
  }

  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

function pickDistractorWords(
  correctRawWord: string,
  count: number,
  preferSimilar = false
): string[] {
  const correctSimplified = simplifyRepeatedWord(correctRawWord);
  const uniqueWords = [
    ...new Set(
      sequencePool
        .map((s) => simplifyRepeatedWord(s.word))
        .filter((w) => w !== correctSimplified)
    ),
  ];

  // Distinct-word guarantee preserved either way — uniqueWords is already
  // deduped above. Shuffle first so a shared-letter-count tie doesn't always
  // resolve to the same catalog order.
  shuffleArray(uniqueWords);

  if (preferSimilar) {
    uniqueWords.sort(
      (a, b) => sharedLetterCount(b, correctSimplified) - sharedLetterCount(a, correctSimplified)
    );
  }

  return uniqueWords.slice(0, count);
}

/**
 * Rough "how similar do these look" signal for the lookalike-distractor mode:
 * count of distinct letters `a` shares with `b` (order-insensitive, each
 * letter counted once). Not a TKA-domain claim — just a difficulty knob for
 * ranking candidate distractor words.
 */
function sharedLetterCount(a: string, b: string): number {
  const bLetters = new Set(b);
  let count = 0;
  for (const letter of new Set(a)) {
    if (bLetters.has(letter)) count++;
  }
  return count;
}

function trackRecentWord(word: string): void {
  recentWords.push(word);
  if (recentWords.length > RECENT_WORD_HISTORY) {
    recentWords.shift();
  }
}

function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j]!, array[i]!];
  }
}

function generateOptionId(): string {
  return `opt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
