/**
 * User Presets Manager - CRUD Operations
 *
 * High-level operations for managing user sequence presets.
 */

import { randomUUID } from "crypto";
import type {
	UserSequencePreset,
	PresetConfig,
	CreatePresetInput,
} from "./types.js";
import { normalizePresetConfig } from "./types.js";
import {
	addPreset as storageAddPreset,
	updatePreset as storageUpdatePreset,
	deletePreset as storageDeletePreset,
	getPreset as storageGetPreset,
	listPresets as storageListPresets,
	loadUserPresets,
	saveUserPresets,
} from "./storage.js";

/**
 * Error thrown when preset validation fails.
 */
export class PresetValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PresetValidationError";
	}
}

/**
 * Error thrown when preset is not found.
 */
export class PresetNotFoundError extends Error {
	constructor(idOrName: string) {
		super(`Preset not found: ${idOrName}`);
		this.name = "PresetNotFoundError";
	}
}

/**
 * Creates a new preset.
 */
export function createPreset(input: CreatePresetInput): UserSequencePreset {
	// Validate name
	if (!input.name || input.name.trim().length === 0) {
		throw new PresetValidationError("Preset name is required");
	}

	// Check for duplicate name
	const existing = storageGetPreset(input.name);
	if (existing) {
		throw new PresetValidationError(`Preset with name "${input.name}" already exists`);
	}

	// Normalize and validate config
	const config = normalizePresetConfig(input);
	if (config === null) {
		throw new PresetValidationError("Invalid configuration values");
	}

	const now = Date.now();
	const preset: UserSequencePreset = {
		id: randomUUID(),
		name: input.name.trim(),
		description: input.description?.trim(),
		icon: input.icon,
		config,
		createdAt: now,
		updatedAt: now,
	};

	storageAddPreset(preset);
	return preset;
}

/**
 * Updates an existing preset.
 */
export function updatePreset(
	idOrName: string,
	updates: Partial<CreatePresetInput>
): UserSequencePreset {
	const existing = storageGetPreset(idOrName);
	if (!existing) {
		throw new PresetNotFoundError(idOrName);
	}

	// If updating name, check for duplicates (unless same preset)
	if (updates.name && updates.name !== existing.name) {
		const duplicate = storageGetPreset(updates.name);
		if (duplicate && duplicate.id !== existing.id) {
			throw new PresetValidationError(`Preset with name "${updates.name}" already exists`);
		}
	}

	// Build updated config by merging
	const configInput: CreatePresetInput = {
		...updates,
		name: updates.name || existing.name,
	};
	const newConfig = normalizePresetConfig(configInput);
	if (newConfig === null) {
		throw new PresetValidationError("Invalid configuration values");
	}

	// Merge with existing config
	const mergedConfig: PresetConfig = {
		...existing.config,
		...newConfig,
	};
	// `conjoined: null` takes the preset back to one grid. Storage merges the
	// config over the saved one again, so the key is set to undefined (dropped
	// when written) rather than deleted, which that merge would bring back.
	if (updates.conjoined === null) mergedConfig.conjoined = undefined;

	const result = storageUpdatePreset(existing.id, {
		name: updates.name?.trim() || existing.name,
		description: updates.description !== undefined ? updates.description?.trim() : existing.description,
		icon: updates.icon !== undefined ? updates.icon : existing.icon,
		config: mergedConfig,
	});

	if (!result) {
		throw new Error("Failed to update preset");
	}

	return result;
}

/**
 * Deletes a preset by ID or name.
 */
export function deletePreset(idOrName: string): void {
	const existing = storageGetPreset(idOrName);
	if (!existing) {
		throw new PresetNotFoundError(idOrName);
	}

	const success = storageDeletePreset(existing.id);
	if (!success) {
		throw new Error("Failed to delete preset");
	}
}

/**
 * Gets a preset by ID or name.
 */
export function getPreset(idOrName: string): UserSequencePreset {
	const preset = storageGetPreset(idOrName);
	if (!preset) {
		throw new PresetNotFoundError(idOrName);
	}
	return preset;
}

/**
 * Lists all presets.
 */
export function listPresets(): UserSequencePreset[] {
	return storageListPresets();
}

/**
 * Formats a preset for display.
 */
export function formatPresetSummary(preset: UserSequencePreset): string {
	const parts: string[] = [];

	if (preset.icon) parts.push(preset.icon);
	parts.push(`**${preset.name}**`);

	const configParts: string[] = [];

	if (preset.config.loopType) {
		let loopStr = preset.config.loopType;
		if (preset.config.period) {
			loopStr += ` (${preset.config.period})`;
		}
		configParts.push(loopStr);
	}

	if (preset.config.loopComponents?.length) {
		configParts.push(preset.config.loopComponents.join("+"));
	}

	if (preset.config.wordLength) {
		configParts.push(`${preset.config.wordLength}-letter word`);
	}

	if (preset.config.constraintPreset) {
		configParts.push(preset.config.constraintPreset);
	}

	if (preset.config.turnIntensity !== undefined) {
		configParts.push(`turn ${preset.config.turnIntensity}`);
	}

	if (preset.config.level) {
		configParts.push(`level ${preset.config.level}`);
	}

	if (preset.config.conjoined) {
		const { toward, steps } = preset.config.conjoined;
		configParts.push(`joined grids (toward ${toward}, steps ${steps})`);
	}

	if (configParts.length > 0) {
		parts.push(`- ${configParts.join(", ")}`);
	}

	if (preset.description) {
		parts.push(`\n  ${preset.description}`);
	}

	return parts.join(" ");
}

/**
 * Seeds default presets for Austen.
 * Only adds presets that don't already exist.
 */
export function seedDefaultPresets(): { added: string[]; skipped: string[] } {
	const defaultPresets: Omit<UserSequencePreset, "createdAt" | "updatedAt">[] = [
		{
			id: "preset-comfy-16",
			name: "Comfy 16",
			description: "Go-to comfortable sequence - 4 letters x quartered = 16 steps",
			icon: "🎯",
			config: {
				loopType: "rotated",
				period: "quartered",
				wordLength: 4,
				constraintPreset: "smooth",
				turnIntensity: 1,
				level: 2,
			},
		},
		{
			id: "preset-mirrored-inverted",
			name: "Mirrored/Inverted",
			description: "Soft spot combo - halved LOOP, can go level 3 with 1.5 turns",
			icon: "🪞",
			config: {
				loopType: "rotated",
				period: "halved",
				loopComponents: ["mirrored", "inverted"],
				constraintPreset: "smooth",
				turnIntensity: 1,
				level: 2,
			},
		},
		{
			id: "preset-rewound-inverted",
			name: "Rewound/Inverted",
			description: "Experimental - time reversal with inversion",
			icon: "🔄",
			config: {
				loopType: "rewound",
				loopComponents: ["inverted"],
				constraintPreset: "smooth",
				level: 2,
			},
		},
	];

	const added: string[] = [];
	const skipped: string[] = [];

	const data = loadUserPresets();

	for (const preset of defaultPresets) {
		const exists = data.presets.some(
			(p) => p.id === preset.id || p.name.toLowerCase() === preset.name.toLowerCase()
		);

		if (exists) {
			skipped.push(preset.name);
		} else {
			const now = Date.now();
			data.presets.push({
				...preset,
				createdAt: now,
				updatedAt: now,
			});
			added.push(preset.name);
		}
	}

	if (added.length > 0) {
		saveUserPresets(data);
	}

	return { added, skipped };
}
