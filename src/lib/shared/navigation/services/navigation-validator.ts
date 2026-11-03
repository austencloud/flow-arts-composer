/**
 * Navigation Validator
 *
 * Provides validation and lookup methods for navigation elements.
 */

import type { ModuleDefinition, ModuleId, Section } from "../domain/types";
import {
  MODULE_DEFINITIONS,
  normalizeSectionId,
} from "../config/module-definitions";

export function isValidModule(moduleId: string): moduleId is ModuleId {
  return MODULE_DEFINITIONS.some((m) => m.id === moduleId);
}

/** A renamed or folded tab's old id counts: it still opens where it went. */
export function isValidTabForModule(moduleId: ModuleId, tabId: string): boolean {
  const moduleDef = getModuleDefinition(moduleId);
  if (!moduleDef) return false;
  const id = normalizeSectionId(moduleId, tabId) ?? tabId;
  return moduleDef.sections.some((tab) => tab.id === id);
}

export function isValidTab(tabs: Section[], tabId: string): boolean {
  return tabs.some((t) => t.id === tabId);
}

export function getModuleDefinition(moduleId: ModuleId): ModuleDefinition | undefined {
  return MODULE_DEFINITIONS.find((m) => m.id === moduleId);
}

export function getAllModuleDefinitions(): ModuleDefinition[] {
  return MODULE_DEFINITIONS;
}

export function getTabsForModule(moduleId: ModuleId): Section[] {
  const moduleDef = getModuleDefinition(moduleId);
  return moduleDef?.sections ?? [];
}

export function getDefaultTabForModule(moduleId: ModuleId): string | null {
  const tabs = getTabsForModule(moduleId);
  return tabs.length > 0 ? (tabs[0]?.id ?? null) : null;
}

export function findTab(moduleId: ModuleId, tabId: string): Section | undefined {
  const moduleDef = getModuleDefinition(moduleId);
  return moduleDef?.sections.find((tab) => tab.id === tabId);
}
