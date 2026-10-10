/**
 * CommandPalette Implementation
 *
 * Manages the command palette (Cmd+K) functionality.
 * Provides command registration, fuzzy search, and execution.
 *
 * Domain: Keyboard Shortcuts - Command Palette
 */

import type { CommandPaletteItem } from "../domain/types/keyboard-types";
import {
  selectOftenUsedDestinationIds,
  selectRecentDestinationIds,
} from "#lib/shared/navigation/domain/navigation-visit-ranking.js";
import type { INavigationVisitPersister } from "#lib/shared/navigation/services/contracts/INavigationVisitPersister.js";

export class CommandPalette {
  private commands: Map<string, CommandPaletteItem> = new Map();

  constructor(
    private readonly visitPersister: INavigationVisitPersister | null = null
  ) {}

  registerCommand(command: CommandPaletteItem): void {
    this.commands.set(command.id, command);
  }

  unregisterCommand(id: string): void {
    this.commands.delete(id);
  }

  getAllCommands(): CommandPaletteItem[] {
    return Array.from(this.commands.values());
  }

  getAvailableCommands(): CommandPaletteItem[] {
    return this.getAllCommands()
      .map((command) => this.resolveCommand(command))
      .filter((command) => command.available === true);
  }

  search(query: string, currentDestinationId?: string): CommandPaletteItem[] {
    if (!query.trim()) {
      return this.getSuggestions(currentDestinationId);
    }

    const normalizedQuery = query.toLowerCase().trim();
    const results: CommandPaletteItem[] = [];

    for (const storedCommand of this.commands.values()) {
      const command = this.resolveCommand(storedCommand);
      // Only search available commands
      if (command.available !== true) continue;

      const score = this.calculateRelevance(command, normalizedQuery);

      if (score > 0) {
        results.push({
          ...command,
          category: command.kind === "destination" ? "Places" : "Actions",
          score,
        });
      }
    }

    // Sort by score (highest first)
    return results.sort(
      (left, right) =>
        Number(right.kind === "destination") -
          Number(left.kind === "destination") ||
        (right.score ?? 0) - (left.score ?? 0) ||
        left.label.localeCompare(right.label)
    );
  }

  async executeCommand(id: string): Promise<void> {
    const command = this.commands.get(id);

    if (!command) {
      throw new Error(`Command with ID "${id}" not found`);
    }

    if (!this.isAvailable(command)) {
      throw new Error(`Command "${id}" is not available in current context`);
    }

    // Execute the command
    await command.action();
  }

  private getSuggestions(
    currentDestinationId: string | undefined
  ): CommandPaletteItem[] {
    const available = this.getAvailableCommands();
    const destinations = available.filter(
      (command) => command.kind === "destination" && command.destinationId
    );
    const byDestinationId = new Map(
      destinations.map((command) => [command.destinationId!, command])
    );
    const availableDestinationIds = new Set(byDestinationId.keys());
    const visits = this.visitPersister?.getVisits() ?? [];
    const recentIds = selectRecentDestinationIds(
      visits,
      availableDestinationIds,
      currentDestinationId
    );
    const excludedIds = new Set(recentIds);
    if (currentDestinationId) excludedIds.add(currentDestinationId);
    const oftenUsedIds = selectOftenUsedDestinationIds(
      visits,
      availableDestinationIds,
      excludedIds
    );
    const recent = recentIds.flatMap((id) => {
      const command = byDestinationId.get(id);
      return command ? [{ ...command, category: "Recent" }] : [];
    });
    const oftenUsed = oftenUsedIds.flatMap((id) => {
      const command = byDestinationId.get(id);
      return command ? [{ ...command, category: "Often used" }] : [];
    });
    const actions = available
      .filter((command) => command.kind !== "destination")
      .slice(0, 3)
      .map((command) => ({ ...command, category: "Actions here" }));

    return [...recent, ...oftenUsed, ...actions];
  }

  private isAvailable(command: CommandPaletteItem): boolean {
    return typeof command.available === "function"
      ? command.available()
      : command.available;
  }

  private resolveCommand(command: CommandPaletteItem): CommandPaletteItem {
    return {
      ...command,
      ...command.resolvePresentation?.(),
      available: this.isAvailable(command),
    };
  }

  /**
   * Calculate relevance score for fuzzy search
   * Higher score = better match
   */
  private calculateRelevance(
    command: CommandPaletteItem,
    query: string
  ): number {
    let score = 0;

    // Exact label match (highest priority)
    if (command.label.toLowerCase() === query) {
      score += 1000;
    }

    // Label starts with query
    if (command.label.toLowerCase().startsWith(query)) {
      score += 500;
    }

    // Label contains query
    if (command.label.toLowerCase().includes(query)) {
      score += 100;
    }

    // Description contains query
    if (command.description?.toLowerCase().includes(query)) {
      score += 50;
    }

    if (command.parentLabel?.toLowerCase() === query) {
      score += 350;
    } else if (command.parentLabel?.toLowerCase().startsWith(query)) {
      score += 175;
    } else if (command.parentLabel?.toLowerCase().includes(query)) {
      score += 75;
    }

    // Keywords match
    for (const keyword of command.keywords) {
      if (keyword.toLowerCase() === query) {
        score += 200;
      } else if (keyword.toLowerCase().startsWith(query)) {
        score += 100;
      } else if (keyword.toLowerCase().includes(query)) {
        score += 50;
      }
    }

    // Fuzzy match bonus (characters in order)
    if (this.fuzzyMatch(command.label.toLowerCase(), query)) {
      score += 25;
    }

    return score;
  }

  /**
   * Check if query characters appear in order in the target string
   * Example: "crt" matches "Create"
   */
  private fuzzyMatch(target: string, query: string): boolean {
    let queryIndex = 0;

    for (const char of target) {
      if (char === query[queryIndex]) {
        queryIndex++;
        if (queryIndex === query.length) {
          return true;
        }
      }
    }

    return queryIndex === query.length;
  }
}
