/**
 * Fire Defaults Loader - Firestore Implementation
 *
 * Loads admin-published fire defaults (fire points + physics) from
 * Firestore at `config/fireDefaults`.
 *
 * All users read these as the baseline fire configuration. Admin tunes
 * fire in Flame Lab, publishes via FireDefaultsPublisher, and this
 * loader picks up the changes in real time via onSnapshot.
 *
 * Storage structure:
 *   config/fireDefaults {
 *     firePoints: Record<string, PropTipConfig>,
 *     propPhysics: Record<string, FirePhysicsParams>,
 *     globalPhysics: FirePhysicsParams,
 *     updatedAt: Timestamp,
 *     updatedBy: string (uid)
 *   }
 *
 * Offline resilience:
 *   - localStorage is used as a write-through cache
 *   - On load, Firestore is tried first; localStorage is the fallback
 *   - On snapshot updates, localStorage is kept in sync
 */

import {
	doc,
	getDoc,
	onSnapshot,
	type Unsubscribe,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import type { FirePhysicsParams } from "../domain/types/fire-types";
import type { PropTipConfig, TipPoint } from "../domain/types/prop-tip-points";
const LOG_PREFIX = "[FireDefaultsLoader]";
const FIRESTORE_DOC_PATH = "config/fireDefaults";
const LOCAL_CACHE_KEY = "tka-fire-defaults-cache";

function isPermissionError(error: unknown): boolean {
	return error instanceof Error && error.message.includes("Missing or insufficient permissions");
}

export class FireDefaultsLoader {
	private unsubscribe: Unsubscribe | null = null;
	private loaded = false;
	private firePoints: Record<string, PropTipConfig> = {};
	private propPhysics: Record<string, FirePhysicsParams> = {};
	private globalPhysicsValue: FirePhysicsParams | null = null;
	private observers: Array<() => void> = [];

	// Firestore document reference

	private async getDocRef() {
		const firestore = await getFirestoreInstance();
		return doc(firestore, FIRESTORE_DOC_PATH);
	}

	// load()

	async load(): Promise<void> {
		try {
			const docRef = await this.getDocRef();
			const snap = await getDoc(docRef);

			if (snap.exists()) {
				const data = snap.data();
				this.applyFirestoreData(data);

				// Write through to localStorage so offline loads have fresh data
				this.writeLocalStorage();

				this.loaded = true;
				return;
			}

			// Firestore doc doesn't exist yet -- try localStorage cache
			this.readLocalStorage();
			this.loaded = true;
		} catch (error) {
			// Permission errors are expected before auth completes - fall back silently
			if (!isPermissionError(error)) {
				console.warn(`${LOG_PREFIX} Firestore load failed, falling back to localStorage:`, error);
			}
			this.readLocalStorage();
			this.loaded = true;
		}
	}

	// ------------------------------------------------------------------
	// isLoaded()
	// ------------------------------------------------------------------

	isLoaded(): boolean {
		return this.loaded;
	}

	// ------------------------------------------------------------------
	// getFirePoints()
	// ------------------------------------------------------------------

	getFirePoints(propType: string): PropTipConfig | null {
		const key = propType.toLowerCase();
		return this.firePoints[key] ?? null;
	}

	// ------------------------------------------------------------------
	// getAllFirePoints()
	// ------------------------------------------------------------------

	getAllFirePoints(): Record<string, PropTipConfig> {
		return { ...this.firePoints };
	}

	// ------------------------------------------------------------------
	// getPhysics()
	// ------------------------------------------------------------------

	getPhysics(propType: string): FirePhysicsParams | null {
		const key = propType.toLowerCase();
		return this.propPhysics[key] ?? this.globalPhysicsValue ?? null;
	}

	// ------------------------------------------------------------------
	// getGlobalPhysics()
	// ------------------------------------------------------------------

	getGlobalPhysics(): FirePhysicsParams | null {
		return this.globalPhysicsValue;
	}

	// ------------------------------------------------------------------
	// subscribe()
	// ------------------------------------------------------------------

	subscribe(callback: () => void): void {
		this.observers.push(callback);

		// Set up Firestore listener on first subscriber (idempotent)
		if (!this.unsubscribe) {
			this.startSnapshotListener();
		}
	}

	// ------------------------------------------------------------------
	// dispose()
	// ------------------------------------------------------------------

	dispose(): void {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		this.observers = [];
	}

	// ------------------------------------------------------------------
	// Private: Firestore snapshot listener
	// ------------------------------------------------------------------

	private startSnapshotListener(): void {
		this.getDocRef()
			.then((docRef) => {
				this.unsubscribe = onSnapshot(
					docRef,
					(snap) => {
						if (snap.exists()) {
							const data = snap.data();
							this.applyFirestoreData(data);

							// Keep localStorage in sync
							this.writeLocalStorage();

							this.loaded = true;
							this.notifyObservers();
						}
					},
					(error) => {
						// Permission errors are expected before auth completes
						if (!isPermissionError(error)) {
							console.error(`${LOG_PREFIX} Snapshot listener error:`, error);
						}
					}
				);
			})
			.catch((error) => {
				if (!isPermissionError(error)) {
					console.error(`${LOG_PREFIX} Failed to set up snapshot listener:`, error);
				}
			});
	}

	// ------------------------------------------------------------------
	// Private: Apply Firestore document data
	// ------------------------------------------------------------------

	private applyFirestoreData(data: Record<string, unknown>): void {
		this.firePoints = this.parseFirePoints(data.firePoints);
		this.propPhysics = this.parsePropPhysics(data.propPhysics);
		this.globalPhysicsValue = this.parsePhysicsParams(data.globalPhysics);
	}

	// ------------------------------------------------------------------
	// Private: Parse fire points from Firestore
	// ------------------------------------------------------------------

	private parseFirePoints(raw: unknown): Record<string, PropTipConfig> {
		const result: Record<string, PropTipConfig> = {};

		if (typeof raw !== "object" || raw === null) return result;

		for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
			const config = this.parseFirePointConfig(value);
			if (config) {
				result[key.toLowerCase()] = config;
			}
		}

		return result;
	}

	private parseFirePointConfig(raw: unknown): PropTipConfig | null {
		if (typeof raw !== "object" || raw === null) return null;

		const obj = raw as Record<string, unknown>;
		if (!Array.isArray(obj.points)) return null;

		const validPoints: TipPoint[] = [];
		for (const point of obj.points) {
			if (this.isValidTipPoint(point)) {
				// Only extract dx and dy - strip legacy flameScale if present in stored data
				validPoints.push({
					dx: point.dx,
					dy: point.dy,
				});
			}
		}

		if (validPoints.length === 0) return null;

		return { points: validPoints };
	}

	private isValidTipPoint(raw: unknown): raw is { dx: number; dy: number } {
		if (typeof raw !== "object" || raw === null) return false;
		const obj = raw as Record<string, unknown>;
		return typeof obj.dx === "number" && typeof obj.dy === "number";
	}

	// ------------------------------------------------------------------
	// Private: Parse physics params from Firestore
	// ------------------------------------------------------------------

	private parsePropPhysics(raw: unknown): Record<string, FirePhysicsParams> {
		const result: Record<string, FirePhysicsParams> = {};

		if (typeof raw !== "object" || raw === null) return result;

		for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
			const params = this.parsePhysicsParams(value);
			if (params) {
				result[key.toLowerCase()] = params;
			}
		}

		return result;
	}

	private parsePhysicsParams(raw: unknown): FirePhysicsParams | null {
		if (typeof raw !== "object" || raw === null) return null;

		const obj = raw as Record<string, unknown>;

		// All 14 fields must be present and numeric
		const fields: Array<keyof FirePhysicsParams> = [
			"splatRadius",
			"fuelAmount",
			"velocityInjectScale",
			"velocityDissipation",
			"temperatureDissipation",
			"fuelDissipation",
			"vorticityStrength",
			"buoyancyStrength",
			"burnRate",
			"fuelEfficiency",
			"coolingRate",
			"pressureDissipation",
			"temperatureInjection",
			"upwardBias",
		];

		for (const field of fields) {
			if (typeof obj[field] !== "number") return null;
		}

		return {
			splatRadius: obj.splatRadius as number,
			fuelAmount: obj.fuelAmount as number,
			velocityInjectScale: obj.velocityInjectScale as number,
			velocityDissipation: obj.velocityDissipation as number,
			temperatureDissipation: obj.temperatureDissipation as number,
			fuelDissipation: obj.fuelDissipation as number,
			vorticityStrength: obj.vorticityStrength as number,
			buoyancyStrength: obj.buoyancyStrength as number,
			burnRate: obj.burnRate as number,
			fuelEfficiency: obj.fuelEfficiency as number,
			coolingRate: obj.coolingRate as number,
			pressureDissipation: obj.pressureDissipation as number,
			temperatureInjection: obj.temperatureInjection as number,
			upwardBias: obj.upwardBias as number,
			gravity: (obj.gravity as number) ?? 0,
		};
	}

	// ------------------------------------------------------------------
	// Private: Notify observers
	// ------------------------------------------------------------------

	private notifyObservers(): void {
		for (const callback of this.observers) {
			try {
				callback();
			} catch (error) {
				console.error(`${LOG_PREFIX} Observer callback error:`, error);
			}
		}
	}

	// ------------------------------------------------------------------
	// Private: localStorage read/write (cache layer)
	// ------------------------------------------------------------------

	private readLocalStorage(): void {
		try {
			const raw = localStorage.getItem(LOCAL_CACHE_KEY);
			if (!raw) return;

			const parsed = JSON.parse(raw);
			if (typeof parsed !== "object" || parsed === null) return;

			this.firePoints = this.parseFirePoints(parsed.firePoints);
			this.propPhysics = this.parsePropPhysics(parsed.propPhysics);
			this.globalPhysicsValue = this.parsePhysicsParams(parsed.globalPhysics);
		} catch {
			// Ignore parse errors -- cache is best-effort
		}
	}

	private writeLocalStorage(): void {
		try {
			const cache = {
				firePoints: this.firePoints,
				propPhysics: this.propPhysics,
				globalPhysics: this.globalPhysicsValue,
			};
			localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cache));
		} catch {
			// localStorage might be full or unavailable
		}
	}
}
