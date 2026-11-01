/**
 * Arrow Adjustment Calculator - Consolidated Service
 *
 * Consolidated service that combines ArrowAdjustmentCalculator and ArrowAdjustmentLookup
 * to eliminate pure delegation layer. Maintains exact same interface and behavior.
 *
 * CONSOLIDATION BENEFITS:
 * - Removes unnecessary delegation layer
 * - Maintains identical logic and results
 * - Preserves all existing interfaces and test compatibility
 * - Better TypeScript organization
 */

import type { HandSide, MotionType } from "../../../../shared/domain/enums/pictograph-enums";
import type { GridLocation } from "../../../../grid/domain/enums/grid-enums";
import type { PictographData } from "../../../../shared/domain/models/pictograph-data";
import type { MotionData } from "../../../../shared/domain/models/motion-data";
import type { DefaultPlacer } from "../../placement/services/default-placer";
import type { DirectionalTupleProcessor } from "./directional-tuple-processor";
import { deriveGridMode as _deriveGridMode } from "../../../../grid/services/grid-mode-deriver";
import type { SpecialPlacer } from "../../placement/services/special-placer";
import {
  generateOrientationKey,
  resolveEffectiveOriKey,
  mapToLegacyBucket,
} from "../../key-generation/services/special-placement-ori-key-generator";
import { generatePlacementKey } from "../../key-generation/services/arrow-placement-key-generator";
import { generateTurnsTuple } from "../../key-generation/services/turns-tuple-key-generator";
import { getKeyFromArrow } from "../../key-generation/services/attribute-key-generator";
import { GridMode } from "../../../../grid/domain/enums/grid-enums";
import { Point } from "#lib/shared/pictograph/arrow/orchestration/domain/point.js";
import { derivePropGeometryKey } from "../../prop-geometry/domain/prop-geometry-key-deriver";
import type {
  PipelineDiagnostics,
  GlobalTierInfo,
  SpecialJsonTierInfo,
} from "../domain/pipeline-diagnostics";
import {
  getSpecialOverrideResolver,
  getGlobalAdjustmentResolver,
  getPropGeometryResolver,
} from "../../placement/services/override-resolvers";
import {
  generateSpecialOverrideKey,
  extractOriFolderFromPath,
} from "../../special-override/domain/special-arrow-placement";
import { computeSpecialOverrideKey } from "../../special-override/services/special-override-key";
import {
  createCanonicalPlacementContext,
  rotatePlacementVectorToDisplayed,
} from "./canonical-placement-frame";
import { placementFrameForGridMode } from "../../placement/domain/placement-frame";

export class ArrowAdjustmentCalculator {
  /**
   * Consolidated service combining lookup and calculation logic.
   * Eliminates the pure delegation layer while maintaining identical behavior.
   */

  constructor(
    private SpecialPlacer: SpecialPlacer,
    private DefaultPlacer: DefaultPlacer,
    private tupleProcessor: DirectionalTupleProcessor
  ) {}

  async calculateAdjustment(
    pictographData: PictographData,
    motionData: MotionData,
    letter: string,
    location: GridLocation,
    arrowColor?: HandSide,
    soloMode?: boolean
  ): Promise<Point> {
    try {
      if (soloMode) {
        const defaultAdjustment = await this.calculateDefaultAdjustment(
          motionData,
          pictographData
        );
        return this.tupleProcessor.processDirectionalTuples(
          defaultAdjustment,
          motionData,
          location
        );
      }
      return await this.calculateAdjustmentResult(
        pictographData,
        motionData,
        letter,
        location,
        arrowColor
      );
    } catch (error) {
      console.error(`Adjustment calculation failed: ${error}`);
      return new Point(0, 0);
    }
  }

  /**
   * Get the base adjustment (before directional tuple transformation).
   * This is useful for the WASD adjustment panel to get the same base value
   * that the rendering pipeline uses.
   */
  async getBaseAdjustmentPublic(
    pictographData: PictographData,
    motionData: MotionData,
    letter: string,
    arrowColor?: HandSide
  ): Promise<Point> {
    try {
      const placementFrame = createCanonicalPlacementContext(
        pictographData,
        motionData
      );
      return await this.getBaseAdjustment(
        placementFrame.pictographData,
        placementFrame.motionData,
        letter,
        arrowColor
      );
    } catch (error) {
      console.error(`Base adjustment lookup failed: ${error}`);
      return new Point(0, 0);
    }
  }

  async calculateAdjustmentResult(
    pictographData: PictographData,
    motionData: MotionData,
    letter: string,
    location: GridLocation,
    arrowColor?: HandSide
  ): Promise<Point> {
    /**
     * Calculate arrow position adjustment with proper error handling.
     * IDENTICAL logic to original ArrowAdjustmentCalculator.
     */
    try {
      // STEP 1: Look up base adjustment (special → default)
      const baseAdjustment = await this.getBaseAdjustment(
        pictographData,
        motionData,
        letter,
        arrowColor
      );

      // STEP 2: Process directional tuples for ALL motion types
      // JSON values are reference adjustments for a specific location (e.g., North)
      // They must be rotated via directional tuple matrices for each quadrant
      // This applies to ALL arrow types: PRO/ANTI/FLOAT/STATIC/DASH
      const finalAdjustment = this.tupleProcessor.processDirectionalTuples(
        baseAdjustment,
        motionData,
        location
      );

      // TEMP DIAGNOSTIC — set `window.__DBG_ARROW = true` in the console, then
      // nudge an arrow with WASD. Shows base (pre-tuple) vs final (post-tuple)
      // per arrow, so we can see whether the directional tuple is actually
      // rotating the shared base per-quadrant at runtime. Remove once resolved.
      if (
        typeof globalThis !== "undefined" &&
        (globalThis as { __DBG_ARROW?: boolean }).__DBG_ARROW
      ) {
        console.log(
          `[ARROW-ADJ] ${arrowColor ?? motionData.hand} ${letter}` +
            ` mt=${motionData.motionType} rot=${motionData.rotationDirection} loc=${location}` +
            ` | base=(${baseAdjustment.x},${baseAdjustment.y})` +
            ` final=(${finalAdjustment.x},${finalAdjustment.y})`
        );
      }

      return new Point(finalAdjustment.x, finalAdjustment.y);
    } catch (error) {
      console.error(
        `Adjustment calculation failed for letter ${letter}: ${error}`
      );
      throw new Error(`Arrow adjustment calculation failed: ${error}`);
    }
  }

  /**
   * Probe all 4 tiers of the arrow positioning pipeline without short-circuiting.
   *
   * Unlike getBaseAdjustment (which returns on first match), this method checks
   * every tier independently and records the result at each one. This lets the
   * WASD adjustment panel show the full pipeline state - which tier is active,
   * what value each tier holds, and what the final rotated adjustment comes out to.
   *
   * Tier priority (mirrors getBaseAdjustment):
   *   global > specialJson > propGeometry > default
   */
  async getDiagnostics(
    pictographData: PictographData,
    motionData: MotionData,
    letter: string,
    location: GridLocation,
    arrowColor?: HandSide
  ): Promise<PipelineDiagnostics> {
    const placementFrame = createCanonicalPlacementContext(
      pictographData,
      motionData,
      location
    );
    const diagnostics = await this.getCanonicalDiagnostics(
      placementFrame.pictographData,
      placementFrame.motionData,
      letter,
      placementFrame.location ?? location,
      arrowColor
    );
    diagnostics.finalAdjustment = rotatePlacementVectorToDisplayed(
      diagnostics.finalAdjustment,
      placementFrame.rotationDegrees
    );
    return diagnostics;
  }

  private async getCanonicalDiagnostics(
    pictographData: PictographData,
    motionData: MotionData,
    letter: string,
    location: GridLocation,
    arrowColor?: HandSide
  ): Promise<PipelineDiagnostics> {
    const diagnostics: PipelineDiagnostics = {
      activeTier: "default",
      global: null,
      specialJson: null,
      propGeometry: null,
      default: null,
      baseAdjustment: { x: 0, y: 0 },
      finalAdjustment: { x: 0, y: 0 },
    };

    // --- Tier 1: Global (Firestore override) ---
    // Requires a letter to build a meaningful key. Same constraint as special placement.
    if (letter) {
      try {
        const globalResolver = getGlobalAdjustmentResolver();
        if (globalResolver) {
          const arrowKey = arrowColor || motionData.hand || "left";
          const thisPropType = motionData.propType?.toLowerCase() || "staff";
          const otherColor = arrowKey === "left" ? "right" : "left";
          const otherMotion = pictographData.motions?.[otherColor];
          const otherPropType = otherMotion?.propType?.toLowerCase() || "staff";

          const rawOriKey = generateOrientationKey(motionData, pictographData);
          const oriKey = resolveEffectiveOriKey(rawOriKey, pictographData);
          const gridMode =
            motionData.gridMode ||
            (pictographData.motions.left && pictographData.motions.right
              ? _deriveGridMode(
                  pictographData.motions.left,
                  pictographData.motions.right
                )
              : GridMode.DIAMOND);

          // The global key's turnsTuple must match the format SpecialPlacer uses when
          // writing global overrides. We recover that string by asking the SpecialPlacer
          // for the JSON-only result (which exposes its own turnsTupleKey). If that
          // returns null (no JSON data for this letter), we fall back to the raw
          // number-array joined form from turnsTupleService - it still lets the repo
          // attempt the lookup with a consistent key.
          let turnsTupleString: string;
          try {
            const [, , attrKey] = this.generateLookupKeys(
              pictographData,
              motionData
            );
            const jsonResult =
              await this.SpecialPlacer.getSpecialJsonAdjustmentOnly(
                motionData,
                pictographData,
                arrowColor,
                attrKey
              );
            turnsTupleString = jsonResult?.turnsTupleKey
              ? String(jsonResult.turnsTupleKey)
              : generateTurnsTuple(pictographData).join(",");
          } catch {
            turnsTupleString = generateTurnsTuple(pictographData).join(",");
          }

          const legacyOriKey = mapToLegacyBucket(rawOriKey);
          const baseKey = {
            placementFrame: placementFrameForGridMode(gridMode),
            oriKey,
            letter: pictographData.letter || "",
            turnsTuple: turnsTupleString,
            arrowKey,
          };

          const cascadingResult = globalResolver(
            baseKey,
            thisPropType,
            otherPropType,
            legacyOriKey
          );
          if (cascadingResult) {
            const globalInfo: GlobalTierInfo = {
              value: {
                x: cascadingResult.adjustment.x,
                y: cascadingResult.adjustment.y,
              },
              layer: cascadingResult.layer,
            };
            diagnostics.global = globalInfo;
          }
        }
      } catch (error) {
        console.warn("[getDiagnostics] Global tier probe failed:", error);
      }
    }

    // --- Tier 2: Special JSON (static per-letter files + Firestore overrides) ---
    // A suppressed key still REPORTS its static value (the editor shows the row
    // struck through, so the state is visible and reversible) but is excluded
    // from the active-tier race below — matching what lookupSpecialPlacement does.
    const specialSuppressed = (() => {
      const r = getSpecialOverrideResolver();
      if (!r || !pictographData.letter) return false;
      const key = computeSpecialOverrideKey(
        pictographData,
        motionData,
        arrowColor ?? motionData.hand
      );
      return r.getFullOverride(key)?.suppressed === true;
    })();

    if (letter) {
      try {
        const [, , attrKey] = this.generateLookupKeys(
          pictographData,
          motionData
        );
        const jsonResult =
          await this.SpecialPlacer.getSpecialJsonAdjustmentOnly(
            motionData,
            pictographData,
            arrowColor,
            attrKey
          );

        if (jsonResult) {
          const specialJsonInfo: SpecialJsonTierInfo = {
            value: { x: jsonResult.adjustment.x, y: jsonResult.adjustment.y },
            filePath: jsonResult.filePath,
            turnsTupleKey: String(jsonResult.turnsTupleKey),
            firestoreOverride: null,
            suppressed: specialSuppressed,
          };

          const specialResolver = getSpecialOverrideResolver();
          if (specialResolver) {
            const oriFolder = extractOriFolderFromPath(jsonResult.filePath);
            const gridMode =
              motionData.gridMode ||
              (pictographData.motions.left && pictographData.motions.right
                ? _deriveGridMode(
                    pictographData.motions.left,
                    pictographData.motions.right
                  )
                : GridMode.DIAMOND);
            const overrideKey = generateSpecialOverrideKey({
              placementFrame: placementFrameForGridMode(gridMode),
              oriFolder,
              letter: pictographData.letter || "",
              turnsTuple: String(jsonResult.turnsTupleKey),
              motionType: motionData.motionType?.toLowerCase() || "",
              attributeKey: attrKey || "",
              propType: motionData.propType?.toLowerCase() || "staff",
            });
            const fullOverride = specialResolver.getFullOverride(overrideKey);
            // A tombstone is not an override — reporting it as one would show
            // the row's value as (0,0) instead of the static value it hides.
            if (fullOverride && !fullOverride.suppressed) {
              specialJsonInfo.firestoreOverride = {
                value: {
                  x: fullOverride.adjustmentX,
                  y: fullOverride.adjustmentY,
                },
                original: {
                  x: jsonResult.adjustment.x,
                  y: jsonResult.adjustment.y,
                },
                updatedBy: fullOverride.updatedBy,
              };
              specialJsonInfo.value = {
                x: fullOverride.adjustmentX,
                y: fullOverride.adjustmentY,
              };
            }
          }

          diagnostics.specialJson = specialJsonInfo;
        } else {
          // No static JSON entry — check for Firestore-only override
          const specialResolver = getSpecialOverrideResolver();
          if (specialResolver && pictographData.letter) {
            const rawOriKey = generateOrientationKey(
              motionData,
              pictographData
            );
            const oriKey = resolveEffectiveOriKey(rawOriKey, pictographData);
            const gridMode =
              motionData.gridMode ||
              (pictographData.motions.left && pictographData.motions.right
                ? _deriveGridMode(
                    pictographData.motions.left,
                    pictographData.motions.right
                  )
                : GridMode.DIAMOND);
            const turnsTupleArr = generateTurnsTuple(pictographData);
            const [, , attrKeyForOverride] = this.generateLookupKeys(
              pictographData,
              motionData
            );

            for (const folder of [oriKey, mapToLegacyBucket(oriKey)]) {
              const overrideKey = generateSpecialOverrideKey({
                placementFrame: placementFrameForGridMode(gridMode),
                oriFolder: folder,
                letter: pictographData.letter,
                turnsTuple: turnsTupleArr.join(","),
                motionType: motionData.motionType?.toLowerCase() || "",
                attributeKey: attrKeyForOverride || "",
                propType: motionData.propType?.toLowerCase() || "staff",
              });
              const fullOverride = specialResolver.getFullOverride(overrideKey);
              if (fullOverride && !fullOverride.suppressed) {
                diagnostics.specialJson = {
                  value: {
                    x: fullOverride.adjustmentX,
                    y: fullOverride.adjustmentY,
                  },
                  filePath: `special/${folder}/${pictographData.letter}_placements.json`,
                  turnsTupleKey: turnsTupleArr.join(","),
                  firestoreOverride: {
                    value: {
                      x: fullOverride.adjustmentX,
                      y: fullOverride.adjustmentY,
                    },
                    original: null,
                    updatedBy: fullOverride.updatedBy,
                  },
                  suppressed: false,
                };
                break;
              }
            }
          }
        }
      } catch (error) {
        console.warn("[getDiagnostics] Special JSON tier probe failed:", error);
      }
    }

    // --- Tier 3: Prop Geometry (letter-free, prop-aware) ---
    try {
      const propGeoResult = this.lookupPropGeometryAdjustment(
        pictographData,
        motionData,
        arrowColor
      );
      if (propGeoResult) {
        diagnostics.propGeometry = {
          value: { x: propGeoResult.x, y: propGeoResult.y },
        };
      }
    } catch (error) {
      console.warn("[getDiagnostics] Prop geometry tier probe failed:", error);
    }

    // --- Tier 4: Default (motion-type only) ---
    try {
      const identity = await this.resolveDefaultLookupIdentity(
        motionData,
        pictographData
      );
      const defaultResult = await this.calculateDefaultAdjustment(
        motionData,
        pictographData
      );
      diagnostics.default = {
        value: { x: defaultResult.x, y: defaultResult.y },
        placementFrame: identity.placementFrame,
        propType: identity.propType,
        motionType: identity.motionType as unknown as string,
        placementKey: identity.placementKey,
        turns: identity.turns,
      };
    } catch (error) {
      console.warn("[getDiagnostics] Default tier probe failed:", error);
    }

    // --- Determine active tier (same priority as getBaseAdjustment) ---
    let basePoint: Point;
    if (diagnostics.global) {
      diagnostics.activeTier = "global";
      basePoint = new Point(
        diagnostics.global.value.x,
        diagnostics.global.value.y
      );
    } else if (diagnostics.specialJson && !diagnostics.specialJson.suppressed) {
      diagnostics.activeTier = "special-json";
      basePoint = new Point(
        diagnostics.specialJson.value.x,
        diagnostics.specialJson.value.y
      );
    } else if (diagnostics.propGeometry) {
      diagnostics.activeTier = "prop-geometry";
      basePoint = new Point(
        diagnostics.propGeometry.value.x,
        diagnostics.propGeometry.value.y
      );
    } else if (diagnostics.default) {
      diagnostics.activeTier = "default";
      basePoint = new Point(
        diagnostics.default.value.x,
        diagnostics.default.value.y
      );
    } else {
      // Nothing found anywhere - use zero point so the panel can still render
      basePoint = new Point(0, 0);
    }

    diagnostics.baseAdjustment = { x: basePoint.x, y: basePoint.y };

    // --- Apply directional tuple rotation to produce finalAdjustment ---
    try {
      const finalPoint = this.tupleProcessor.processDirectionalTuples(
        basePoint,
        motionData,
        location
      );
      diagnostics.finalAdjustment = { x: finalPoint.x, y: finalPoint.y };
    } catch (error) {
      console.warn(
        "[getDiagnostics] Directional tuple processing failed:",
        error
      );
      diagnostics.finalAdjustment = { x: basePoint.x, y: basePoint.y };
    }

    return diagnostics;
  }

  // === PRIVATE METHODS - Consolidated from ArrowAdjustmentLookup ===

  private async getBaseAdjustment(
    pictographData: PictographData,
    motionData: MotionData,
    letter: string,
    arrowColor?: HandSide
  ): Promise<Point> {
    /**
     * Get base adjustment using streamlined lookup logic.
     * IDENTICAL to ArrowAdjustmentLookup.getBaseAdjustment()
     */
    if (!motionData) {
      throw new Error("Missing motion data for adjustment lookup");
    }

    try {
      // Special placement lookup requires a letter for key generation.
      // Some beats (e.g., the starting position) have no letter assigned,
      // so we skip special placement and go straight to prop geometry / default.
      if (letter) {
        // Generate required keys for special placement lookup
        const [, , attrKey] = this.generateLookupKeys(
          pictographData,
          motionData
        );

        try {
          const specialAdjustment = await this.lookupSpecialPlacement(
            motionData,
            pictographData,
            arrowColor,
            attrKey
          );

          if (specialAdjustment) {
            return specialAdjustment;
          }
        } catch (error) {
          console.warn(
            `Error in special placement lookup for ${letter}:`,
            error
          );
        }
      }

      // Prop geometry tier: letter-free, prop-aware adjustments.
      // When a prop's physical shape (triad arms, fan spread) extends into
      // the arrow's default position, this tier provides a better default
      // than the motion-type-only default placement.
      const propGeometryAdjustment = this.lookupPropGeometryAdjustment(
        pictographData,
        motionData,
        arrowColor
      );
      if (propGeometryAdjustment) {
        return new Point(propGeometryAdjustment.x, propGeometryAdjustment.y);
      }

      // Fall back to default calculation
      const defaultAdjustment = await this.calculateDefaultAdjustment(
        motionData,
        pictographData
      );
      return defaultAdjustment;
    } catch (error) {
      console.error("Error in base adjustment lookup:", error);
      throw new Error(`Arrow adjustment lookup failed: ${error}`);
    }
  }

  private generateLookupKeys(
    pictographData: PictographData,
    motionData: MotionData
  ): [string, string, string] {
    /**Generate all required keys for special placement lookup.*/
    try {
      const oriKey = generateOrientationKey(motionData, pictographData);
      const turnsTuple = generateTurnsTuple(pictographData);

      const color = motionData.hand;
      const tempArrow = {
        id: "temp",
        arrowLocation: null,
        positionX: 0,
        positionY: 0,
        rotationAngle: 0,
        coordinates: { x: 0, y: 0 },
        svgCenter: { x: 0, y: 0 },
        svgMirrored: false,
        isVisible: true,
        isSelected: false,
      };

      const attrKey = getKeyFromArrow(tempArrow, pictographData, color);

      return [oriKey, turnsTuple.join(","), attrKey];
    } catch (error) {
      console.error("Failed to generate lookup keys:", error);
      throw new Error(`Key generation failed: ${error}`);
    }
  }

  private async lookupSpecialPlacement(
    motionData: MotionData,
    pictographData: PictographData,
    arrowColor?: HandSide,
    attributeKey?: string
  ): Promise<Point | null> {
    try {
      // Prop-scoped special override, checked regardless of static-JSON presence.
      const specialResolver = getSpecialOverrideResolver();

      // Tombstone gate, ahead of every other Special read: a suppressed key drops
      // the WHOLE tier — Firestore override AND the shipped static JSON — so the
      // pipeline falls through to Prop Geometry -> Default. Without this the
      // static entry is unremovable and Default is unreachable for any letter
      // that has one.
      if (specialResolver && pictographData.letter) {
        const canonicalKey = computeSpecialOverrideKey(
          pictographData,
          motionData,
          arrowColor ?? motionData.hand
        );
        if (specialResolver.getFullOverride(canonicalKey)?.suppressed)
          return null;
      }

      if (specialResolver && pictographData.letter) {
        const override = specialResolver.getOverride(
          computeSpecialOverrideKey(
            pictographData,
            motionData,
            arrowColor ?? motionData.hand
          )
        );
        if (override) return new Point(override.x, override.y);
      }

      // Check Firestore special overrides first
      if (specialResolver && pictographData.letter) {
        const jsonResult =
          await this.SpecialPlacer.getSpecialJsonAdjustmentOnly(
            motionData,
            pictographData,
            arrowColor,
            attributeKey
          );

        if (jsonResult) {
          const oriFolder = extractOriFolderFromPath(jsonResult.filePath);
          const gridMode =
            motionData.gridMode ||
            (pictographData.motions.left && pictographData.motions.right
              ? _deriveGridMode(
                  pictographData.motions.left,
                  pictographData.motions.right
                )
              : GridMode.DIAMOND);
          const overrideKey = generateSpecialOverrideKey({
            placementFrame: placementFrameForGridMode(gridMode),
            oriFolder,
            letter: pictographData.letter,
            turnsTuple: String(jsonResult.turnsTupleKey),
            motionType: motionData.motionType?.toLowerCase() || "",
            attributeKey: attributeKey || "",
            propType: motionData.propType?.toLowerCase() || "staff",
          });

          const override = specialResolver.getOverride(overrideKey);
          if (override) {
            return new Point(override.x, override.y);
          }
        }
      }

      // Fall through to static JSON + global override
      const adjustment = await this.SpecialPlacer.getSpecialAdjustment(
        motionData,
        pictographData,
        arrowColor,
        attributeKey
      );

      if (adjustment) {
        return new Point(adjustment.x, adjustment.y);
      }

      return null;
    } catch (error) {
      console.error("Error in special placement lookup:", error);
      return null;
    }
  }

  /**
   * Look up a prop geometry adjustment for the current scenario.
   *
   * Derives the key dimensions from the pictograph and motion data:
   * - gridMode, propType, otherPropType, positionType
   * - endOrientation of both hands, motionType, turns, arrowColor
   *
   * Returns null if no prop geometry adjustment is registered for
   * this scenario, letting the pipeline fall through to the default.
   */
  private lookupPropGeometryAdjustment(
    pictographData: PictographData,
    motionData: MotionData,
    arrowColor?: HandSide
  ): { x: number; y: number } | null {
    const propGeometryResolver = getPropGeometryResolver();
    if (!propGeometryResolver) return null;

    const propGeometryKey = derivePropGeometryKey(
      pictographData,
      motionData,
      arrowColor
    );
    if (!propGeometryKey) return null;

    const result = propGeometryResolver(propGeometryKey);
    return result ? result.adjustment : null;
  }

  /**
   * Resolve the Default-tier lookup identity (placement frame, motion type, placement key,
   * turns) for a motion. Shared by calculateDefaultAdjustment and getDiagnostics
   * so the editor can address the exact Firestore default field.
   *
   * The turns formatting mirrors ArrowPlacer.formatTurnsForLookup: a string passes
   * through, a whole number drops its fractional part, otherwise it stringifies. This
   * keeps calculateDefaultAdjustment behavior-identical to the prior inline version,
   * since the data service normalizes turns the same way during lookup.
   */
  private async resolveDefaultLookupIdentity(
    motionData: MotionData,
    pictographData: PictographData
  ): Promise<{
    placementFrame: string;
    displayGridMode: GridMode;
    motionType: MotionType;
    placementKey: string;
    turns: string;
    propType: string;
  }> {
    // Use gridMode from motion data if available, otherwise derive from locations
    const displayGridMode = (motionData.gridMode ||
      (pictographData.motions.left && pictographData.motions.right
        ? _deriveGridMode(
            pictographData.motions.left,
            pictographData.motions.right
          )
        : GridMode.DIAMOND)) as GridMode;

    const keys = await this.DefaultPlacer.getAvailablePlacementKeys(
      motionData.motionType as MotionType,
      displayGridMode
    );
    const defaultPlacements: Record<string, unknown> = Object.fromEntries(
      (keys || []).map((k: string) => [k, true])
    );

    const availableKeys = Object.keys(defaultPlacements || []);

    const placementKey = generatePlacementKey(
      motionData,
      pictographData,
      availableKeys
    );

    const rawTurns = motionData.turns || 0;
    const turns =
      typeof rawTurns === "string"
        ? rawTurns
        : rawTurns === Math.floor(rawTurns)
          ? Math.floor(rawTurns).toString()
          : rawTurns.toString();

    return {
      placementFrame: placementFrameForGridMode(displayGridMode),
      displayGridMode,
      motionType: motionData.motionType as MotionType,
      placementKey,
      turns,
      propType: motionData.propType?.toLowerCase() || "staff",
    };
  }

  private async calculateDefaultAdjustment(
    motionData: MotionData,
    pictographData: PictographData
  ): Promise<Point> {
    /**
     * Calculate default adjustment - IDENTICAL to ArrowAdjustmentLookup.
     */
    try {
      const { displayGridMode, motionType, placementKey, turns, propType } =
        await this.resolveDefaultLookupIdentity(motionData, pictographData);

      const adjustmentPoint = await this.DefaultPlacer.getDefaultAdjustment(
        placementKey,
        turns,
        motionType,
        displayGridMode,
        propType
      );

      return new Point(adjustmentPoint.x, adjustmentPoint.y);
    } catch (error) {
      console.error("Error calculating default adjustment:", error);
      throw new Error(`Default adjustment calculation failed: ${error}`);
    }
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
// Use this instead of arrowAdjustmentCalculator to avoid DI container rebuilds.
// ============================================================================

import { specialPlacer } from "../../placement/services/special-placer";
import { defaultPlacer } from "../../placement/services/default-placer";
import { directionalTupleProcessor } from "./directional-tuple-processor";

export const arrowAdjustmentCalculator = new ArrowAdjustmentCalculator(
  specialPlacer,
  defaultPlacer,
  directionalTupleProcessor
);
