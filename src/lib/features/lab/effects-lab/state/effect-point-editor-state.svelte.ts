import type { TipPointOverrideProvider } from "../services/tip-point-override-provider";
import type { EffectPointsPersister } from "../services/effect-points-persister";
import type { TipPoint } from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import {
	describeTipPointResolution,
	getTipPointsBaseline,
	type TipPointSource,
} from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import type { TrailPointConfig } from "$lib/shared/animation-engine/domain/types/trail-point-types";

const MAX_UNDO_DEPTH = 20;
const SAVE_INDICATOR_DURATION = 1200;

const COMMON_PROP_TYPES = [
	"staff",
	"fan",
	"club",
	"buugeng",
	"triad",
	"minipoi",
	"doublestaff",
	"sword",
];

function deepCopy<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}

interface UndoEntry {
	points: TipPoint[];
	label: string;
}

export class EffectPointEditorState {
	selectedPropType = $state<string>("staff");
	points = $state<TipPoint[]>([]);
	selectedPointIndex = $state<number>(-1);
	isDragging = $state(false);
	saveIndicatorVisible = $state(false);
	actionFeedback = $state<string | null>(null);
	trailConfig = $state<TrailPointConfig | null>(null);
	/** Bumped whenever stored points change so resolution getters re-run. */
	private storeRevision = $state(0);

	private undoStack: UndoEntry[] = [];
	private provider: TipPointOverrideProvider;
	private saveIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
	private actionFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
	private storageKey: string;
	private unsubscribePersister: (() => void) | null = null;

	constructor(
		provider: TipPointOverrideProvider,
		persister?: EffectPointsPersister,
	) {
		this.storageKey = "effects-lab-selected-prop";
		this.provider = provider;
		const saved = this.loadSelectedPropType();
		if (saved) this.selectedPropType = saved;
		this.loadPointsForCurrentProp();

		// Subscribe to persister changes so we reload when Firestore data arrives
		// (fixes race condition where editor reads before async load completes)
		if (persister) {
			this.unsubscribePersister = persister.subscribe(() => {
				// Only reload if we're NOT actively editing (dragging or just saved)
				if (!this.isDragging && !this.saveIndicatorVisible) {
					this.loadPointsForCurrentProp();
				}
			});
		}
	}

	dispose(): void {
		this.unsubscribePersister?.();
		this.unsubscribePersister = null;
	}

	get availablePropTypes(): string[] {
		return COMMON_PROP_TYPES;
	}

	get isUsingOverride(): boolean {
		return this.provider.hasOverride(this.selectedPropType);
	}

	get hasUserDefault(): boolean {
		return this.provider.hasUserDefault(this.selectedPropType);
	}

	/**
	 * Where the animation canvas gets this prop's tips right now. "override"
	 * means the points on screen come from the lab store (or a published
	 * default) instead of the code table in prop-tip-points.ts, and any
	 * later change to that table is invisible until the override is cleared.
	 */
	get tipSource(): TipPointSource {
		void this.storeRevision;
		return describeTipPointResolution(this.selectedPropType).source;
	}

	get isOverridingCodeTable(): boolean {
		return this.tipSource === "override";
	}

	get canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	selectPropType(propType: string): void {
		if (propType === this.selectedPropType) return;
		this.selectedPropType = propType;
		this.selectedPointIndex = -1;
		this.undoStack = [];
		this.loadPointsForCurrentProp();
		try { localStorage.setItem(this.storageKey, propType); } catch { /* ignore */ }
	}

	addPoint(dx: number, dy: number): void {
		this.pushUndo("Add point");
		const newPoint: TipPoint = { dx, dy };
		this.points = [...this.points, newPoint];
		this.selectedPointIndex = this.points.length - 1;
		this.autoSave();
	}

	updatePoint(index: number, updates: Record<string, unknown>): void {
		if (index < 0 || index >= this.points.length) return;
		this.points = this.points.map((p, i) =>
			i === index ? { ...p, ...updates } : p,
		);
		this.autoSave();
	}

	movePoint(index: number, updates: Record<string, unknown>): void {
		if (index < 0 || index >= this.points.length) return;
		this.pushUndo("Move point");
		this.points = this.points.map((p, i) =>
			i === index ? { ...p, ...updates } : p,
		);
		this.autoSave();
	}

	updatePointPosition(index: number, dx: number, dy: number): void {
		if (index < 0 || index >= this.points.length) return;
		this.points = this.points.map((p, i) =>
			i === index ? { ...p, dx, dy } : p,
		);
		this.autoSave();
	}

	deletePoint(index: number): void {
		if (index < 0 || index >= this.points.length) return;
		this.pushUndo("Delete point");
		this.points = this.points.filter((_, i) => i !== index);
		if (this.selectedPointIndex >= this.points.length) {
			this.selectedPointIndex = this.points.length - 1;
		}
		this.autoSave();
	}

	beginDrag(index: number): void {
		this.pushUndo("Move point");
		this.selectedPointIndex = index;
		this.isDragging = true;
	}

	endDrag(): void {
		this.isDragging = false;
	}

	undo(): void {
		const entry = this.undoStack.pop();
		if (!entry) return;
		this.points = entry.points;
		if (this.selectedPointIndex >= this.points.length) {
			this.selectedPointIndex = this.points.length - 1;
		}
		this.autoSave();
	}

	setAsDefault(): void {
		const config = { points: deepCopy(this.points) };
		this.provider.saveUserDefault(this.selectedPropType, config);
		this.showActionFeedback("Default saved");
	}

	resetToUserDefault(): void {
		this.pushUndo("Reset to default");
		const userDefault = this.provider.getUserDefault(this.selectedPropType);
		if (userDefault) {
			this.points = deepCopy(userDefault.points);
			this.showActionFeedback("Reset to your default");
		} else {
			this.points = deepCopy(
				getTipPointsBaseline(this.selectedPropType).points,
			);
			this.showActionFeedback("Reset to system defaults");
		}
		this.selectedPointIndex = -1;
		this.autoSave();
	}

	/**
	 * Drop the stored override and show the code table's points. Unlike
	 * resetToUserDefault this does not write the points back, so the canvas
	 * follows prop-tip-points.ts again from here on. A published default for
	 * the prop still wins over the table; the badge stays lit in that case.
	 */
	useCodeTable(): void {
		this.pushUndo("Use code table");
		this.provider.clearOverride(this.selectedPropType);
		this.points = deepCopy(
			getTipPointsBaseline(this.selectedPropType).points,
		);
		this.selectedPointIndex = -1;
		this.storeRevision++;
		this.showActionFeedback(
			this.isOverridingCodeTable
				? "Published default still applies"
				: "Using code table",
		);
	}

	toJSON(): string {
		const config = { points: this.points };
		return JSON.stringify(config, null, 2);
	}

	importJSON(json: string): string | null {
		try {
			const parsed = JSON.parse(json);
			if (!parsed?.points || !Array.isArray(parsed.points)) {
				return "Invalid format: expected { points: [...] }";
			}
			for (const p of parsed.points) {
				if (typeof p.dx !== "number" || typeof p.dy !== "number") {
					return "Invalid point: each point needs dx, dy (numbers)";
				}
	
			}
			this.pushUndo("Import JSON");
			this.points = parsed.points;
			this.selectedPointIndex = -1;
			this.autoSave();
			return null;
		} catch {
			return "Invalid JSON";
		}
	}

	saveTrailConfig(config: TrailPointConfig): void {
		this.trailConfig = config;
		this.provider.saveTrailAssignment(this.selectedPropType, config);
		this.showSaveIndicator();
	}

	clearTrailConfig(): void {
		this.trailConfig = null;
		this.provider.removeTrailAssignment(this.selectedPropType);
		this.showSaveIndicator();
	}

	getUserDefaultTypes(): string[] {
		return this.provider.getUserDefaultTypes();
	}

	private loadSelectedPropType(): string | null {
		try {
			const raw = localStorage.getItem(this.storageKey);
			if (raw && raw.length > 0) return raw;
		} catch { /* ignore */ }
		return null;
	}

	private loadPointsForCurrentProp(): void {
		const override = this.provider.getOverride(this.selectedPropType);
		if (override) {
			this.points = deepCopy(override.points);
		} else {
			this.points = deepCopy(
				getTipPointsBaseline(this.selectedPropType).points,
			);
		}
		this.storeRevision++;

		// Load trail assignment for this prop
		this.trailConfig = this.provider.getTrailAssignment(this.selectedPropType) ?? null;
	}

	private autoSave(): void {
		const config = { points: deepCopy(this.points) };
		this.provider.saveOverride(this.selectedPropType, config);
		this.storeRevision++;
		this.showSaveIndicator();
	}

	private showSaveIndicator(): void {
		this.saveIndicatorVisible = true;
		if (this.saveIndicatorTimer) {
			clearTimeout(this.saveIndicatorTimer);
		}
		this.saveIndicatorTimer = setTimeout(() => {
			this.saveIndicatorVisible = false;
			this.saveIndicatorTimer = null;
		}, SAVE_INDICATOR_DURATION);
	}

	private showActionFeedback(message: string): void {
		this.actionFeedback = message;
		if (this.actionFeedbackTimer) {
			clearTimeout(this.actionFeedbackTimer);
		}
		this.actionFeedbackTimer = setTimeout(() => {
			this.actionFeedback = null;
			this.actionFeedbackTimer = null;
		}, 2000);
	}

	private pushUndo(label: string): void {
		this.undoStack.push({
			points: deepCopy(this.points),
			label,
		});
		if (this.undoStack.length > MAX_UNDO_DEPTH) {
			this.undoStack.shift();
		}
	}
}
