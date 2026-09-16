/**
 * Node.js Pictograph Preparer Factory
 *
 * Creates a PictographPreparer instance with all dependencies configured for Node.js.
 * Uses file system-based loaders instead of browser fetch().
 *
 * This is a simplified version of pictograph-container.ts for CLI usage.
 */

import { NodeArrowSvgLoader } from "./NodeArrowSvgLoader";
import { NodePropSvgLoader } from "./NodePropSvgLoader";
import { NodeJsonCache } from "./NodeJsonCache";

// Import pure logic services (work in both browser and Node.js)
import { ArrowPathResolver } from "../../src/lib/shared/pictograph/arrow/rendering/services/implementations/ArrowPathResolver";
import { ArrowSvgParser } from "../../src/lib/shared/pictograph/arrow/rendering/services/implementations/ArrowSvgParser";
import { ArrowSvgColorTransformer } from "../../src/lib/shared/pictograph/arrow/rendering/services/implementations/ArrowSvgColorTransformer";
import { GridModeDeriver } from "../../src/lib/shared/pictograph/grid/services/implementations/GridModeDeriver";
import { GridPlacementDeriver } from "../../src/lib/shared/pictograph/grid/services/implementations/GridPlacementDeriver";
import { BetaDetector } from "../../src/lib/shared/pictograph/prop/services/beta-detector";
import { OrientationCalculator } from "../../src/lib/shared/pictograph/prop/services/implementations/OrientationCalculator";
import { PropPlacer } from "../../src/lib/shared/pictograph/prop/services/prop-placer";
import { NodePictographPreparer } from "./NodePictographPreparer";

// Import all arrow positioning services
import { ArrowLifecycleManager } from "../../src/lib/shared/pictograph/arrow/orchestration/services/arrow-lifecycle-manager";
import { ArrowAdjustmentProcessor } from "../../src/lib/shared/pictograph/arrow/orchestration/services/implementations/ArrowAdjustmentProcessor";
import { ArrowCoordinateTransformer } from "../../src/lib/shared/pictograph/arrow/orchestration/services/implementations/ArrowCoordinateTransformer";
import { ArrowDataProcessor } from "../../src/lib/shared/pictograph/arrow/orchestration/services/implementations/ArrowDataProcessor";
import { ArrowGridCoordinator } from "../../src/lib/shared/pictograph/arrow/orchestration/services/implementations/ArrowGridCoordinator";
import { ArrowPositioningOrchestrator } from "../../src/lib/shared/pictograph/arrow/orchestration/services/implementations/ArrowPositioningOrchestrator";
import { ArrowQuadrantCalculator } from "../../src/lib/shared/pictograph/arrow/orchestration/services/implementations/ArrowQuadrantCalculator";
import { ArrowAdjustmentCalculator } from "../../src/lib/shared/pictograph/arrow/positioning/calculation/services/arrow-adjustment-calculator";
import { ArrowLocationCalculator } from "../../src/lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator";
import { ArrowLocator } from "../../src/lib/shared/pictograph/arrow/positioning/calculation/services/implementations/ArrowLocator";
import { ArrowRotationCalculator } from "../../src/lib/shared/pictograph/arrow/positioning/calculation/services/arrow-rotation-calculator";
import { DashLocationCalculator } from "../../src/lib/shared/pictograph/arrow/positioning/calculation/services/implementations/DashLocationCalculator";
import { DirectionalTupleCalculator, DirectionalTupleProcessor, QuadrantIndexCalculator } from "../../src/lib/shared/pictograph/arrow/positioning/calculation/services/directional-tuple-processor";
import { HandpathDirectionCalculator } from "../../src/lib/shared/pictograph/arrow/positioning/calculation/services/implementations/HandpathDirectionCalculator";
import { ScreenSpaceAdjustmentTransformer } from "../../src/lib/shared/pictograph/arrow/positioning/calculation/services/screen-space-adjustment-transformer";
import { ArrowPlacementKeyGenerator } from "../../src/lib/shared/pictograph/arrow/positioning/key-generation/services/implementations/ArrowPlacementKeyGenerator";
import { AttributeKeyGenerator } from "../../src/lib/shared/pictograph/arrow/positioning/key-generation/services/implementations/AttributeKeyGenerator";
import { SpecialPlacementOriKeyGenerator } from "../../src/lib/shared/pictograph/arrow/positioning/key-generation/services/implementations/SpecialPlacementOriKeyGenerator";
import { RotationAngleOverrideKeyGenerator } from "../../src/lib/shared/pictograph/arrow/positioning/key-generation/services/implementations/RotationAngleOverrideKeyGenerator";
import { TurnsTupleKeyGenerator } from "../../src/lib/shared/pictograph/arrow/positioning/key-generation/services/implementations/TurnsTupleKeyGenerator";
import { ArrowPlacer } from "../../src/lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer";
import { DefaultPlacer } from "../../src/lib/shared/pictograph/arrow/positioning/placement/services/default-placer";
import { SpecialPlacer } from "../../src/lib/shared/pictograph/arrow/positioning/placement/services/special-placer";
import { SpecialPlacementDataProvider } from "../../src/lib/shared/pictograph/arrow/positioning/placement/services/special-placement-data-provider";
import { LetterClassifier } from "../../src/lib/shared/pictograph/arrow/positioning/placement/services/implementations/LetterClassifier";
import { TurnsTupleGenerator } from "../../src/lib/shared/pictograph/arrow/positioning/placement/services/implementations/TurnsTupleGenerator";
import { SpecialPlacementLookup } from "../../src/lib/shared/pictograph/arrow/positioning/placement/services/special-placement-lookup";
import { RotationOverrideManager } from "../../src/lib/shared/pictograph/arrow/positioning/placement/services/rotation-override-manager";
import { PropType } from "../../src/lib/shared/pictograph/prop/domain/enums/PropType";

import type { ISvgConfig } from "../../src/lib/shared/pictograph/shared/domain/models/svg-models";

// SVG config constant
const SVG_CONFIG: ISvgConfig = {
  SVG_SIZE: 950,
  CENTER_X: 475,
  CENTER_Y: 475,
};

/**
 * Create a fully configured PictographPreparer for Node.js
 * @returns PictographPreparer instance with all dependencies
 */
export function createNodePictographPreparer() {
  // === Layer 1: Leaf services with no dependencies ===
  const gridModeDeriver = new GridModeDeriver();
  const gridPlacementDeriver = new GridPlacementDeriver();
  const betaDetector = new BetaDetector();
  const orientationCalculator = new OrientationCalculator();

  // Arrow key generation services (leaf)
  const attributeKeyGenerator = new AttributeKeyGenerator();
  const specialPlacementOriKeyGenerator = new SpecialPlacementOriKeyGenerator();
  const turnsTupleKeyGenerator = new TurnsTupleKeyGenerator();
  const rotationAngleOverrideKeyGenerator = new RotationAngleOverrideKeyGenerator();

  // Arrow calculation services (need dependencies)
  const arrowRotationCalculator = new ArrowRotationCalculator();
  const handpathDirectionCalculator = new HandpathDirectionCalculator();
  const dashLocationCalculator = new DashLocationCalculator();
  const screenSpaceAdjustmentTransformer = new ScreenSpaceAdjustmentTransformer();

  // === Layer 2: Services with Layer 1 dependencies ===
  const arrowLocationCalculator = new ArrowLocationCalculator(SVG_CONFIG);
  const arrowLocator = new ArrowLocator(arrowLocationCalculator, SVG_CONFIG);

  // ArrowQuadrantCalculator must be created BEFORE QuadrantIndexCalculator
  const arrowQuadrantCalculator = new ArrowQuadrantCalculator();

  const directionalTupleCalculator = new DirectionalTupleCalculator();
  const quadrantIndexCalculator = new QuadrantIndexCalculator(arrowQuadrantCalculator);
  const directionalTupleProcessor = new DirectionalTupleProcessor(
    directionalTupleCalculator,
    quadrantIndexCalculator
  );

  const arrowPlacementKeyGenerator = new ArrowPlacementKeyGenerator(
    attributeKeyGenerator,
    specialPlacementOriKeyGenerator,
    rotationAngleOverrideKeyGenerator,
    turnsTupleKeyGenerator
  );

  // === Layer 3: Services with Layer 2 dependencies ===
  const letterClassifier = new LetterClassifier();
  const specialPlacementLookup = new SpecialPlacementLookup(letterClassifier);

  // Node.js JSON cache for loading special placement data from file system
  const nodeJsonCache = new NodeJsonCache();
  const specialPlacementDataProvider = new SpecialPlacementDataProvider(
    nodeJsonCache
  );

  const turnsTupleGenerator = new TurnsTupleGenerator(
    handpathDirectionCalculator,
    directionalTupleProcessor
  );

  // Create RotationOverrideManager with a stub localStorage for Node.js
  const rotationOverrideManager = new RotationOverrideManager(
    // Stub localStorage for Node.js (no persistence needed)
    {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0
    } as any
  );

  // Pass nodeJsonCache to DefaultPlacer for file system-based JSON loading
  const defaultPlacer = new DefaultPlacer(nodeJsonCache);

  const specialPlacer = new SpecialPlacer(
    specialPlacementDataProvider,
    turnsTupleGenerator,
    specialPlacementLookup,
    gridModeDeriver
  );

  const arrowPlacer = new ArrowPlacer(
    defaultPlacer,
    specialPlacer,
    letterClassifier,
    rotationOverrideManager
  );

  // ArrowAdjustmentCalculator needs all the services above
  const arrowAdjustmentCalculator = new ArrowAdjustmentCalculator(
    gridModeDeriver,
    specialPlacer,
    defaultPlacer,
    specialPlacementOriKeyGenerator,
    arrowPlacementKeyGenerator,
    turnsTupleKeyGenerator,
    attributeKeyGenerator,
    directionalTupleProcessor
  );

  const arrowCoordinateTransformer = new ArrowCoordinateTransformer();
  // arrowQuadrantCalculator is created earlier (before QuadrantIndexCalculator)
  const arrowGridCoordinator = new ArrowGridCoordinator(
    gridPlacementDeriver,
    orientationCalculator
  );

  const arrowAdjustmentProcessor = new ArrowAdjustmentProcessor(
    arrowAdjustmentCalculator,
    dashLocationCalculator,
    screenSpaceAdjustmentTransformer
  );

  const arrowDataProcessor = new ArrowDataProcessor(
    arrowCoordinateTransformer,
    arrowQuadrantCalculator
  );

  const arrowPositioningOrchestrator = new ArrowPositioningOrchestrator(
    arrowLocationCalculator,      // IArrowLocationCalculator
    arrowRotationCalculator,      // IArrowRotationCalculator
    arrowAdjustmentCalculator,    // IArrowAdjustmentCalculator
    arrowGridCoordinator,         // IArrowGridCoordinator
    arrowDataProcessor            // IArrowDataProcessor
  );

  // === Layer 4: SVG loaders (Node.js specific) ===
  const arrowSvgLoader = new NodeArrowSvgLoader(
    new ArrowPathResolver(),
    new ArrowSvgParser(),
    new ArrowSvgColorTransformer()
  );

  const propSvgLoader = new NodePropSvgLoader();

  // === Layer 5: Arrow lifecycle manager ===
  const arrowLifecycleManager = new ArrowLifecycleManager(
    arrowSvgLoader,                // First: IArrowSvgLoader
    arrowPositioningOrchestrator   // Second: IArrowPositioningOrchestrator
  );

  // === Layer 6: Prop placer with default prop types ===
  const propPlacer = new PropPlacer(
    gridModeDeriver,
    betaDetector,
    // Default prop types for Node.js (staff for both hands)
    {
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
    }
  );

  // === Layer 7: PictographPreparer (final assembly) ===
  // Use Node-specific version that doesn't depend on Svelte state
  const pictographPreparer = new NodePictographPreparer(
    arrowLifecycleManager,
    propSvgLoader,
    propPlacer,
    gridModeDeriver
  );

  return {
    pictographPreparer,
    turnsTupleGenerator, // Also return this for turn number rendering
  };
}
