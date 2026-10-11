/**
 * TikaWelcomeBuilder
 *
 * Generates personalized welcome greetings and suggestion chips
 * based on the user's learning state. Priority order:
 *
 * 1. Review (spaced repetition due) - amber
 * 2. Continue (recent TIKA topic) - blue
 * 3. Next (unlocked concepts) - green
 * 4. Explore (static fallback) - purple
 */

import type { TikaTopicInteraction } from "./tika-interaction-tracker";
import type { MasteryContext } from "#lib/features/learn/domain/quiz-history-types.js";

export interface WelcomeSuggestion {
  icon: string;
  text: string;
  question: string;
  reason: "review" | "next" | "continue" | "explore";
}
export interface WelcomeContext {
  greeting: string;
  suggestions: WelcomeSuggestion[];
  hasHistory: boolean;
}

const MAX_SUGGESTIONS = 6;

const STATIC_SUGGESTIONS: WelcomeSuggestion[] = [
  { icon: "fa-crosshairs", text: "What is alpha?", question: "What does alpha mean?", reason: "explore" },
  { icon: "fa-crosshairs", text: "What is beta?", question: "What does beta mean?", reason: "explore" },
  { icon: "fa-crosshairs", text: "What is gamma?", question: "What does gamma mean?", reason: "explore" },
  { icon: "fa-font", text: "What is letter A?", question: "What is letter A?", reason: "explore" },
  { icon: "fa-arrows-alt", text: "What is shift?", question: "What is shift?", reason: "explore" },
  { icon: "fa-layer-group", text: "Type 1 letters", question: "What are Type 1 letters?", reason: "explore" },
];

export function buildWelcome(
  masteryContext?: MasteryContext,
  topicHistory?: TikaTopicInteraction[],
  historySummary?: string
): WelcomeContext {
  const hasHistory = !!(historySummary && historySummary.length > 0);
  const hasLearningData = !!(
    masteryContext &&
    (masteryContext.masteredConcepts.length > 0 ||
      masteryContext.strugglingConcepts.length > 0 ||
      masteryContext.dueForReview.length > 0)
  );

  // No data at all: static defaults
  if (!hasHistory && !hasLearningData && (!topicHistory || topicHistory.length === 0)) {
    return {
      greeting: "I'm your AI tutor for The Kinetic Alphabet. Ask me anything about:",
      suggestions: STATIC_SUGGESTIONS,
      hasHistory: false,
    };
  }

  const suggestions: WelcomeSuggestion[] = [];

  // 1. Review suggestions (spaced repetition)
  if (masteryContext?.dueForReview) {
    for (const concept of masteryContext.dueForReview.slice(0, 2)) {
      suggestions.push({
        icon: "fa-redo",
        text: `Review: ${formatConceptName(concept)}`,
        question: `Quiz me on ${formatConceptName(concept)}`,
        reason: "review",
      });
    }
  }

  // 2. Continue suggestions (recent TIKA topics)
  if (topicHistory && topicHistory.length > 0) {
    const recentTopics = topicHistory
      .filter((t) => !suggestions.some((s) => s.text.includes(formatConceptName(t.topic))))
      .slice(0, 2);

    for (const topic of recentTopics) {
      suggestions.push({
        icon: "fa-history",
        text: `Continue: ${formatConceptName(topic.topic)}`,
        question: `Tell me more about ${formatConceptName(topic.topic)}`,
        reason: "continue",
      });
    }
  }

  // 3. Next concept suggestions
  if (masteryContext?.suggestedNext) {
    for (const concept of masteryContext.suggestedNext.slice(0, 2)) {
      if (suggestions.some((s) => s.text.includes(formatConceptName(concept)))) continue;
      suggestions.push({
        icon: "fa-arrow-right",
        text: `Learn: ${formatConceptName(concept)}`,
        question: `What is ${formatConceptName(concept)}?`,
        reason: "next",
      });
    }
  }

  // 4. Fill remaining with explore suggestions
  const remaining = MAX_SUGGESTIONS - suggestions.length;
  if (remaining > 0) {
    const used = new Set(suggestions.map((s) => s.question));
    const fillers = STATIC_SUGGESTIONS.filter((s) => !used.has(s.question));
    suggestions.push(...fillers.slice(0, remaining));
  }

  // Build greeting
  let greeting: string;
  if (hasHistory) {
    greeting = `Welcome back! ${historySummary}`;
  } else if (hasLearningData) {
    const masteredCount = masteryContext?.masteredConcepts.length || 0;
    greeting =
      masteredCount > 0
        ? `You've mastered ${masteredCount} concept${masteredCount === 1 ? "" : "s"}. Keep going!`
        : "I'm your AI tutor for The Kinetic Alphabet. Ask me anything:";
  } else {
    greeting = "I'm your AI tutor for The Kinetic Alphabet. Ask me anything:";
  }

  return {
    greeting,
    suggestions: suggestions.slice(0, MAX_SUGGESTIONS),
    hasHistory,
  };
}

/**
 * Format a topic ID into a readable name.
 * "letter-a" -> "letter A", "position-alpha" -> "alpha", "type-1" -> "Type 1"
 */
function formatConceptName(topicId: string): string {
  if (topicId.startsWith("letter-")) {
    return `letter ${topicId.replace("letter-", "").toUpperCase()}`;
  }
  if (topicId.startsWith("position-")) {
    return topicId.replace("position-", "");
  }
  if (topicId.startsWith("type-")) {
    return `Type ${topicId.replace("type-", "")}`;
  }
  if (topicId.startsWith("motion-")) {
    return topicId.replace("motion-", "");
  }
  // Default: replace hyphens with spaces
  return topicId.replace(/-/g, " ");
}
