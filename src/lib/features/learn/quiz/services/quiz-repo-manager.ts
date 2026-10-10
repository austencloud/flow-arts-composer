/**
 * Lesson Repo Implementation
 *
 * Service implementation for lesson configuration management and retrieval.
 * Handles lesson types, configurations, and category management.
 */

import type { LetterCategory } from "../../codex/domain/types/codex-types";
import type { QuizConfig } from "../domain/models/quiz-models";
import {
  QuizAnswerFormat,
  QuizQuestionFormat,
  QuizType,
} from "../domain/enums/quiz-enums";
import type { CodexLetterMappingRepo } from "#lib/shared/learn/services/codex-letter-mapping-repo.js";

export class QuizRepoManager {
  private configurations: Map<string, QuizConfig> = new Map();
  private initialized = false;

  constructor(private letterMappingRepo: CodexLetterMappingRepo) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize letter mapping repository first
      if (this.letterMappingRepo.initialize) {
        await this.letterMappingRepo.initialize();
      }

      // Load lesson configurations
      await this.loadQuizConfigs();

      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize QuizRepoManager:", error);
      throw error;
    }
  }

  getQuizConfig(lessonType: string): QuizConfig | null {
    if (!this.initialized) {
      console.warn("QuizRepoManager not initialized. Call initialize() first.");
      return null;
    }

    return this.configurations.get(lessonType) || null;
  }

  getAllQuizTypes(): string[] {
    if (!this.initialized) {
      console.warn("QuizRepoManager not initialized. Call initialize() first.");
      return [];
    }

    return Array.from(this.configurations.keys());
  }

  getLettersForLesson(lessonType: string): string[] {
    const config = this.getQuizConfig(lessonType);
    if (!config) {
      return [];
    }

    // Extract letters from lesson configuration
    return config.includedLetters || [];
  }

  getLessonCategories(lessonType: string): LetterCategory[] {
    const config = this.getQuizConfig(lessonType);
    if (!config) {
      return [];
    }

    // Extract categories from lesson configuration
    return config.categories || [];
  }

  private async loadQuizConfigs(): Promise<void> {
    try {
      // TODO: Load from actual lesson configuration files
      // For now, create some default configurations
      const defaultLessons: QuizConfig[] = [
        {
          id: "basic-letters",
          type: "basic-letters",
          name: "Basic Letters",
          description: "Learn the basic letter formations",
          includedCategories: ["basic" as LetterCategory],
          letters: ["A", "B", "C", "D", "E"],
          categories: ["basic" as LetterCategory],
          difficulty: 1,
          lessonType: QuizType.PICTOGRAPH_TO_LETTER,
          questionFormat: QuizQuestionFormat.PICTOGRAPH,
          answerFormat: QuizAnswerFormat.BUTTON,
          quizDescription: "",
          questionPrompt: "",
        },
        {
          id: "advanced-letters",
          type: "advanced-letters",
          name: "Advanced Letters",
          description: "Master advanced letter combinations",
          includedCategories: ["extended" as LetterCategory],
          letters: ["F", "G", "H", "I", "J"],
          categories: ["extended" as LetterCategory],
          difficulty: 2,
          lessonType: QuizType.PICTOGRAPH_TO_LETTER,
          questionFormat: QuizQuestionFormat.PICTOGRAPH,
          answerFormat: QuizAnswerFormat.BUTTON,
          quizDescription: "",
          questionPrompt: "",
        },
      ];

      // Store configurations
      for (const lesson of defaultLessons) {
        if (lesson.id) {
          this.configurations.set(lesson.id, lesson);
        }
      }
    } catch (error) {
      console.error("Failed to load lesson configurations:", error);
      throw error;
    }
  }
}
