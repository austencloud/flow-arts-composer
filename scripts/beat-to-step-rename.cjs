/**
 * Beat to Step Rename Script
 *
 * This script performs bulk renaming of "beat" → "step" terminology
 * throughout the codebase, preserving "beat" in musical contexts.
 */

const fs = require('fs');
const path = require('path');

// Directories to process
const SRC_DIR = path.join(__dirname, '..', 'src');

// File extensions to process
const EXTENSIONS = ['.ts', '.svelte', '.js'];

// Patterns to replace (order matters - longer patterns first)
const REPLACEMENTS = [

  // Index patterns (must come before simple 'beatIndex')
  ['currentBeatIndex', 'currentStepIndex'],
  ['selectedBeatIndex', 'selectedStepIndex'],
  ['activeBeatIndex', 'activeStepIndex'],
  ['previousBeatIndex', 'previousStepIndex'],
  ['nextBeatIndex', 'nextStepIndex'],
  ['startBeatIndex', 'startStepIndex'],
  ['endBeatIndex', 'endStepIndex'],
  ['lastBeatIndex', 'lastStepIndex'],
  ['firstBeatIndex', 'firstStepIndex'],
  ['targetBeatIndex', 'targetStepIndex'],
  ['sourceBeatIndex', 'sourceStepIndex'],
  ['removingBeatIndex', 'removingStepIndex'],
  ['hoveredBeatIndex', 'hoveredStepIndex'],
  ['focusedBeatIndex', 'focusedStepIndex'],
  ['draggedBeatIndex', 'draggedStepIndex'],
  ['droppedBeatIndex', 'droppedStepIndex'],

  // Number patterns
  ['currentBeatNumber', 'currentStepNumber'],
  ['selectedBeatNumber', 'selectedStepNumber'],
  ['activeBeatNumber', 'activeStepNumber'],
  ['previousBeatNumber', 'previousStepNumber'],
  ['nextBeatNumber', 'nextStepNumber'],
  ['displayedBeatNumber', 'displayedStepNumber'],
  ['fadingOutBeatNumber', 'fadingOutStepNumber'],
  ['practiceBeatNumber', 'practiceStepNumber'],
  ['totalBeatNumber', 'totalStepNumber'],
  ['maxBeatNumber', 'maxStepNumber'],
  ['minBeatNumber', 'minStepNumber'],

  // Click/Event handlers (compound)
  ['onBeatClick', 'onStepClick'],
  ['onBeatSelect', 'onStepSelect'],
  ['onBeatChange', 'onStepChange'],
  ['onBeatAdd', 'onStepAdd'],
  ['onBeatRemove', 'onStepRemove'],
  ['onBeatDelete', 'onStepDelete'],
  ['onBeatUpdate', 'onStepUpdate'],
  ['onBeatHover', 'onStepHover'],
  ['onBeatDrag', 'onStepDrag'],
  ['onBeatDrop', 'onStepDrop'],
  ['handleBeatClick', 'handleStepClick'],
  ['handleBeatSelect', 'handleStepSelect'],
  ['handleBeatChange', 'handleStepChange'],
  ['handleBeatAdd', 'handleStepAdd'],
  ['handleBeatRemove', 'handleStepRemove'],
  ['handleBeatDelete', 'handleStepDelete'],
  ['handleBeatUpdate', 'handleStepUpdate'],
  ['handleBeatHover', 'handleStepHover'],
  ['handleBeatDrag', 'handleStepDrag'],
  ['handleBeatDrop', 'handleStepDrop'],

  // Data patterns
  ['beatDataList', 'stepDataList'],
  ['beatDataArray', 'stepDataArray'],
  ['beatDataMap', 'stepDataMap'],
  ['beatDataCache', 'stepDataCache'],

  // Selection patterns
  ['selectedBeatNumbers', 'selectedStepNumbers'],
  ['selectedBeatIndices', 'selectedStepIndices'],
  ['selectedBeatIds', 'selectedStepIds'],
  ['removingBeatIndices', 'removingStepIndices'],

  // Navigation patterns
  ['navigateToBeat', 'navigateToStep'],
  ['goToBeat', 'goToStep'],
  ['jumpToBeat', 'jumpToStep'],
  ['scrollToBeat', 'scrollToStep'],

  // Rendering patterns
  ['renderBeat', 'renderStep'],
  ['displayBeat', 'displayStep'],
  ['showBeat', 'showStep'],
  ['hideBeat', 'hideStep'],

  // ===== INTERFACE/TYPE NAMES (PascalCase) =====
  ['BeatData', 'StepData'],
  ['BeatGrid', 'StepGrid'],
  ['BeatCell', 'StepCell'],
  ['BeatPair', 'StepPair'],
  ['BeatState', 'StepState'],
  ['BeatInfo', 'StepInfo'],
  ['BeatConfig', 'StepConfig'],
  ['BeatOperator', 'StepOperator'],
  ['BeatCalculator', 'StepCalculator'],
  ['BeatConverter', 'StepConverter'],
  ['BeatAnalyzer', 'StepAnalyzer'],
  ['BeatGenerator', 'StepGenerator'],
  ['BeatRemoval', 'StepRemoval'],
  ['BeatMotion', 'StepMotion'],
  ['BeatEditor', 'StepEditor'],
  ['BeatDisplay', 'StepDisplay'],
  ['BeatList', 'StepList'],
  ['BeatItem', 'StepItem'],
  ['BeatRow', 'StepRow'],
  ['BeatColumn', 'StepColumn'],
  ['BeatContainer', 'StepContainer'],
  ['BeatWrapper', 'StepWrapper'],
  ['BeatPanel', 'StepPanel'],
  ['BeatView', 'StepView'],
  ['BeatRenderer', 'StepRenderer'],
  ['BeatManager', 'StepManager'],
  ['BeatHandler', 'StepHandler'],
  ['BeatController', 'StepController'],
  ['BeatService', 'StepService'],
  ['BeatFactory', 'StepFactory'],
  ['BeatBuilder', 'StepBuilder'],
  ['BeatContext', 'StepContext'],
  ['BeatProvider', 'StepProvider'],
  ['BeatConsumer', 'StepConsumer'],
  ['BeatProps', 'StepProps'],
  ['BeatOptions', 'StepOptions'],
  ['BeatParams', 'StepParams'],
  ['BeatResult', 'StepResult'],
  ['BeatResponse', 'StepResponse'],
  ['BeatRequest', 'StepRequest'],
  ['BeatError', 'StepError'],
  ['BeatEvent', 'StepEvent'],
  ['BeatAction', 'StepAction'],
  ['BeatType', 'StepType'],
  ['BeatModel', 'StepModel'],
  ['BeatEntity', 'StepEntity'],
  ['BeatRecord', 'StepRecord'],
  ['BeatEntry', 'StepEntry'],
  ['BeatSelection', 'StepSelection'],
  ['BeatHighlight', 'StepHighlight'],
  ['BeatIndicator', 'StepIndicator'],
  ['BeatMarkerData', 'StepMarkerData'],  // Not BeatMarker (audio)
  ['BeatAnimation', 'StepAnimation'],
  ['BeatTransition', 'StepTransition'],
  ['BeatDuration', 'StepDuration'],
  ['BeatTiming', 'StepTiming'],
  ['BeatSequence', 'StepSequence'],
  ['BeatPosition', 'StepPosition'],
  ['BeatLocation', 'StepLocation'],
  ['BeatCoord', 'StepCoord'],
  ['BeatCoordinate', 'StepCoordinate'],
  ['BeatSnapshot', 'StepSnapshot'],
  ['BeatHistory', 'StepHistory'],
  ['BeatUndo', 'StepUndo'],
  ['BeatRedo', 'StepRedo'],
  ['BeatClipboard', 'StepClipboard'],
  ['BeatCache', 'StepCache'],
  ['BeatStore', 'StepStore'],
  ['BeatRepository', 'StepRepository'],
  ['IBeat', 'IStep'],

  // ===== PROPERTY/VARIABLE NAMES (camelCase) =====
  ['beatData', 'stepData'],
  ['beatNumber', 'stepNumber'],
  ['beatIndex', 'stepIndex'],
  ['beatCount', 'stepCount'],
  ['beatProgress', 'stepProgress'],
  ['beatState', 'stepState'],
  ['beatConfig', 'stepConfig'],
  ['beatPair', 'stepPair'],
  ['beatInfo', 'stepInfo'],
  ['currentBeat', 'currentStep'],
  ['selectedBeat', 'selectedStep'],
  ['activeBeat', 'activeStep'],
  ['hoveredBeat', 'hoveredStep'],
  ['focusedBeat', 'focusedStep'],
  ['highlightedBeat', 'highlightedStep'],
  ['nextBeat', 'nextStep'],
  ['prevBeat', 'prevStep'],
  ['previousBeat', 'previousStep'],
  ['firstBeat', 'firstStep'],
  ['lastBeat', 'lastStep'],
  ['newBeat', 'newStep'],
  ['oldBeat', 'oldStep'],
  ['sourceBeat', 'sourceStep'],
  ['targetBeat', 'targetStep'],
  ['draggedBeat', 'draggedStep'],
  ['droppedBeat', 'droppedStep'],
  ['startBeat', 'startStep'],
  ['endBeat', 'endStep'],
  ['originalBeat', 'originalStep'],
  ['modifiedBeat', 'modifiedStep'],
  ['copiedBeat', 'copiedStep'],
  ['pastedBeat', 'pastedStep'],
  ['clonedBeat', 'clonedStep'],
  ['addBeat', 'addStep'],
  ['removeBeat', 'removeStep'],
  ['deleteBeat', 'deleteStep'],
  ['insertBeat', 'insertStep'],
  ['updateBeat', 'updateStep'],
  ['getBeat', 'getStep'],
  ['setBeat', 'setStep'],
  ['createBeat', 'createStep'],
  ['cloneBeat', 'cloneStep'],
  ['copyBeat', 'copyStep'],
  ['moveBeat', 'moveStep'],
  ['swapBeat', 'swapStep'],
  ['loadBeat', 'loadStep'],
  ['saveBeat', 'saveStep'],
  ['parseBeat', 'parseStep'],
  ['validateBeat', 'validateStep'],
  ['isBeat', 'isStep'],
  ['hasBeat', 'hasStep'],
  ['canBeat', 'canStep'],
  ['shouldBeat', 'shouldStep'],
  ['willBeat', 'willStep'],
  ['didBeat', 'didStep'],
  ['beatOf', 'stepOf'],
  ['beatAt', 'stepAt'],
  ['beatFor', 'stepFor'],
  ['beatFrom', 'stepFrom'],
  ['beatTo', 'stepTo'],
  ['beatIn', 'stepIn'],
  ['beatWith', 'stepWith'],
  ['beatBy', 'stepBy'],
  ['allBeats', 'allSteps'],
  ['someBeats', 'someSteps'],
  ['noBeats', 'noSteps'],
  ['anyBeat', 'anyStep'],
  ['everyBeat', 'everyStep'],
  ['eachBeat', 'eachStep'],
  ['thisBeat', 'thisStep'],
  ['thatBeat', 'thatStep'],
  ['sameBeat', 'sameStep'],
  ['otherBeat', 'otherStep'],
  ['lastAddedBeat', 'lastAddedStep'],
  ['recentBeat', 'recentStep'],
  ['latestBeat', 'latestStep'],
  ['defaultBeat', 'defaultStep'],
  ['emptyBeat', 'emptyStep'],
  ['nullBeat', 'nullStep'],
  ['minBeat', 'minStep'],
  ['maxBeat', 'maxStep'],
  ['totalBeats', 'totalSteps'],
  ['numBeats', 'numSteps'],
  ['beatSize', 'stepSize'],
  ['beatWidth', 'stepWidth'],
  ['beatHeight', 'stepHeight'],
  ['beatLength', 'stepLength'],
  ['beatScale', 'stepScale'],
  ['beatDuration', 'stepDuration'],
  ['beatTime', 'stepTime'],
  ['beatDelay', 'stepDelay'],
  ['beatInterval', 'stepInterval'],
  ['beatOffset', 'stepOffset'],
  ['beatSpacing', 'stepSpacing'],
  ['beatGap', 'stepGap'],
  ['beatMargin', 'stepMargin'],
  ['beatPadding', 'stepPadding'],
  ['beatBorder', 'stepBorder'],
  ['beatColor', 'stepColor'],
  ['beatOpacity', 'stepOpacity'],
  ['beatVisible', 'stepVisible'],
  ['beatHidden', 'stepHidden'],
  ['beatEnabled', 'stepEnabled'],
  ['beatDisabled', 'stepDisabled'],
  ['beatActive', 'stepActive'],
  ['beatInactive', 'stepInactive'],
  ['beatSelected', 'stepSelected'],
  ['beatFocused', 'stepFocused'],
  ['beatHovered', 'stepHovered'],
  ['beatPressed', 'stepPressed'],
  ['beatDragging', 'stepDragging'],
  ['beatDropping', 'stepDropping'],
  ['beatLoading', 'stepLoading'],
  ['beatLoaded', 'stepLoaded'],
  ['beatReady', 'stepReady'],
  ['beatError', 'stepError'],
  ['beatValid', 'stepValid'],
  ['beatInvalid', 'stepInvalid'],
  ['beatEmpty', 'stepEmpty'],
  ['beatFull', 'stepFull'],
  ['beatComplete', 'stepComplete'],
  ['beatIncomplete', 'stepIncomplete'],
  ['beatChanged', 'stepChanged'],
  ['beatUpdated', 'stepUpdated'],
  ['beatModified', 'stepModified'],
  ['beatAdded', 'stepAdded'],
  ['beatRemoved', 'stepRemoved'],
  ['beatDeleted', 'stepDeleted'],
  ['beatInserted', 'stepInserted'],
  ['beatMoved', 'stepMoved'],
  ['beatCopied', 'stepCopied'],
  ['beatPasted', 'stepPasted'],
  ['beatCloned', 'stepCloned'],
  ['beatSwapped', 'stepSwapped'],
  ['beatReplaced', 'stepReplaced'],
  ['beatRestored', 'stepRestored'],
  ['beatSaved', 'stepSaved'],
  ['beatExported', 'stepExported'],
  ['beatImported', 'stepImported'],

  // Arrays
  ['beats', 'steps'],
  ['Beats', 'Steps'],

  // Specific codebase patterns
  ['startingPlacementBeat', 'startingPlacement'],
  ['addBeatToSequence', 'addStepToSequence'],
  ['removeBeatFromSequence', 'removeStepFromSequence'],
  ['updateBeatInSequence', 'updateStepInSequence'],
  ['getBeatFromSequence', 'getStepFromSequence'],
  ['findBeatInSequence', 'findStepInSequence'],
  ['beatAtIndex', 'stepAtIndex'],
  ['beatAtPosition', 'stepAtPosition'],
  ['beatSequenceState', 'stepSequenceState'],
  ['visibleBeats', 'visibleSteps'],
  ['hiddenBeats', 'hiddenSteps'],
  ['filteredBeats', 'filteredSteps'],
  ['sortedBeats', 'sortedSteps'],
  ['orderedBeats', 'orderedSteps'],
  ['reversedBeats', 'reversedSteps'],
  ['uniqueBeats', 'uniqueSteps'],
  ['duplicateBeats', 'duplicateSteps'],
  ['validBeats', 'validSteps'],
  ['invalidBeats', 'invalidSteps'],
  ['selectedBeats', 'selectedSteps'],
  ['unselectedBeats', 'unselectedSteps'],
  ['checkedBeats', 'checkedSteps'],
  ['uncheckedBeats', 'uncheckedSteps'],
  ['enabledBeats', 'enabledSteps'],
  ['disabledBeats', 'disabledSteps'],
  ['activeBeats', 'activeSteps'],
  ['inactiveBeats', 'inactiveSteps'],
  ['completedBeats', 'completedSteps'],
  ['pendingBeats', 'pendingSteps'],
  ['loadedBeats', 'loadedSteps'],
  ['cachedBeats', 'cachedSteps'],
  ['newBeats', 'newSteps'],
  ['oldBeats', 'oldSteps'],
  ['changedBeats', 'changedSteps'],
  ['unchangedBeats', 'unchangedSteps'],
  ['modifiedBeats', 'modifiedSteps'],
  ['unmodifiedBeats', 'unmodifiedSteps'],
  ['addedBeats', 'addedSteps'],
  ['removedBeats', 'removedSteps'],
  ['insertedBeats', 'insertedSteps'],
  ['deletedBeats', 'deletedSteps'],
  ['movedBeats', 'movedSteps'],
  ['copiedBeats', 'copiedSteps'],
  ['pastedBeats', 'pastedSteps'],
  ['importedBeats', 'importedSteps'],
  ['exportedBeats', 'exportedSteps'],


  // Previous/matching patterns (LOOP executors)
  ['previousMatchingBeat', 'previousMatchingStep'],
  ['matchingBeatNumber', 'matchingStepNumber'],
  ['matchingBeat', 'matchingStep'],

  // Internal types
  ['InternalBeatPair', 'InternalStepPair'],
  ['BeatPairRelationship', 'StepPairRelationship'],

  // Generated steps
  ['generatedBeat', 'generatedStep'],
  ['generatedBeats', 'generatedSteps'],
  ['beatsToGenerate', 'stepsToGenerate'],

  // Specific step positions
  ['secondBeat', 'secondStep'],
  ['thirdBeat', 'thirdStep'],
  ['fourthBeat', 'fourthStep'],
  ['masterBeat', 'masterStep'],
  ['keyBeat', 'keyStep'],
  ['anchorBeat', 'anchorStep'],

  // UI visibility
  ['beatNumbersVisible', 'stepNumbersVisible'],
  ['showBeatNumbers', 'showStepNumbers'],
  ['showBeatNumber', 'showStepNumber'],
  ['hideBeatNumbers', 'hideStepNumbers'],
  ['beatVisible', 'stepVisible'],

  // Operators and converters
  ['IBeatOperator', 'IStepOperator'],
  ['IBeatConverter', 'IStepConverter'],
  ['IBeatDataConverter', 'IStepDataConverter'],
  ['IBeatCalculator', 'IStepCalculator'],
  ['IBeatAnalyzer', 'IStepAnalyzer'],
  ['IBeatValidator', 'IStepValidator'],
  ['IBeatTransformer', 'IStepTransformer'],
  ['IBeatNormalizer', 'IStepNormalizer'],
  ['IBeatHandler', 'IStepHandler'],
  ['IBeatManager', 'IStepManager'],
  ['IBeatRenderer', 'IStepRenderer'],
  ['IBeatFactory', 'IStepFactory'],
  ['IBeatBuilder', 'IStepBuilder'],

  // Data types and configs
  ['BeatMotionConfigs', 'StepMotionConfigs'],
  ['beatMotionConfigs', 'stepMotionConfigs'],
  ['BeatDataList', 'StepDataList'],
  ['beatDataList', 'stepDataList'],
  ['beatConfigs', 'stepConfigs'],

  // Animating patterns
  ['animatingBeatNumber', 'animatingStepNumber'],
  ['animatingBeat', 'animatingStep'],

  // Duration/timing
  ['beatDurationMs', 'stepDurationMs'],
  ['beatDuration', 'stepDuration'],
  ['beatTiming', 'stepTiming'],
  ['beatDelay', 'stepDelay'],

  // Selection state
  ['selectBeat', 'selectStep'],
  ['deselectBeat', 'deselectStep'],
  ['setCurrentBeat', 'setCurrentStep'],
  ['getCurrentBeat', 'getCurrentStep'],

  // Pair operations
  ['beatPairState', 'stepPairState'],
  ['beatPairGroups', 'stepPairGroups'],
  ['halvedBeatPairs', 'halvedStepPairs'],
  ['quarteredBeatPairs', 'quarteredStepPairs'],

  // Additional internal patterns
  ['beatWithStartOri', 'stepWithStartOri'],
  ['beatWithEndOri', 'stepWithEndOri'],
  ['targetBeatNumber', 'targetStepNumber'],
  ['targetBeatIndex', 'targetStepIndex'],
  ['sourceBeatNumber', 'sourceStepNumber'],
  ['sourceBeatIndex', 'sourceStepIndex'],

  // Numeric references
  ['beatNum', 'stepNum'],
  ['beatIdx', 'stepIdx'],
  ['beatId', 'stepId'],
  ['beatIds', 'stepIds'],

  // Component naming
  ['BeatNavigator', 'StepNavigator'],
  ['BeatSelector', 'StepSelector'],
  ['BeatViewer', 'StepViewer'],
  ['BeatPreview', 'StepPreview'],

  // Create operations
  ['createBeatData', 'createStepData'],
  ['makeBeatData', 'makeStepData'],
  ['buildBeatData', 'buildStepData'],
  ['initBeatData', 'initStepData'],

  // Update operations
  ['updateBeatData', 'updateStepData'],
  ['modifyBeatData', 'modifyStepData'],
  ['editBeatData', 'editStepData'],
  ['changeBeatData', 'changeStepData'],

  // Delete operations
  ['deleteBeatData', 'deleteStepData'],
  ['removeBeatData', 'removeStepData'],
  ['clearBeatData', 'clearStepData'],

  // Get operations
  ['getBeatData', 'getStepData'],
  ['fetchBeatData', 'fetchStepData'],
  ['loadBeatData', 'loadStepData'],
  ['readBeatData', 'readStepData'],

  // Miscellaneous
  ['rawBeat', 'rawStep'],
  ['tempBeat', 'tempStep'],
  ['dummyBeat', 'dummyStep'],
  ['placeholderBeat', 'placeholderStep'],
  ['sampleBeat', 'sampleStep'],
  ['mockBeat', 'mockStep'],
  ['testBeat', 'testStep'],


  // Data patterns
  ['currentBeatData', 'currentStepData'],
  ['selectedBeatData', 'selectedStepData'],
  ['updatedBeatData', 'updatedStepData'],
  ['finalBeat', 'finalStep'],
  ['updatedBeat', 'updatedStep'],
  ['ExtractedBeat', 'ExtractedStep'],
  ['extractedBeat', 'extractedStep'],

  // Number patterns
  ['addBeatNumbers', 'addStepNumbers'],
  ['beatNumbers', 'stepNumbers'],
  ['BeatNumber', 'StepNumber'],

  // Pair patterns (duplicate check)
  ['beatPairs', 'stepPairs'],
  ['BeatPairs', 'StepPairs'],
  ['beatPair', 'stepPair'],

  // Beat marker (non-musical - internal)
  ['beatMarkers', 'stepMarkers'],
  ['BeatMarkers', 'StepMarkers'],

  // Additional patterns from scan
  ['beatsToAnimate', 'stepsToAnimate'],
  ['onBeatLongPress', 'onStepLongPress'],
  ['snapToBeats', 'snapToSteps'],
  ['updateVisibilityFromBeat', 'updateVisibilityFromStep'],
  ['displayedBeatData', 'displayedStepData'],
  ['getBeatDataFromState', 'getStepDataFromState'],
  ['startPlacementBeat', 'startPlacementStep'],
  ['BeatPairGroups', 'StepPairGroups'],

  // More codebase patterns
  ['currentBeatCount', 'currentStepCount'],
  ['beatConverter', 'stepConverter'],
  ['BeatConverter', 'StepConverter'],


  // Pair patterns (case variations)
  ['beatpair', 'steppair'],
  ['Beatpair', 'Steppair'],

  // Action patterns
  ['beatsToRemove', 'stepsToRemove'],
  ['animBeat', 'animStep'],
  ['actualBeats', 'actualSteps'],
  ['correspondingBeat', 'correspondingStep'],
  ['clampedBeat', 'clampedStep'],
  ['lastClickedBeat', 'lastClickedStep'],
  ['isPracticeBeat', 'isPracticeStep'],
  ['highlightedBeats', 'highlightedSteps'],
  ['savedBeatPairs', 'savedStepPairs'],
  ['previousBeatCount', 'previousStepCount'],
  ['toggleBeatNumbers', 'toggleStepNumbers'],
  ['showBeatGrid', 'showStepGrid'],
  ['shouldAnimateAllBeats', 'shouldAnimateAllSteps'],
  ['isBeatEditorPanelOpen', 'isStepEditorPanelOpen'],
  ['propagatedBeats', 'propagatedSteps'],
  ['parsedBeats', 'parsedSteps'],
  ['convertToBeat', 'convertToStep'],
  ['minBeats', 'minSteps'],
  ['lastTotalBeats', 'lastTotalSteps'],
  ['drawBeatNumber', 'drawStepNumber'],
  ['beatRecords', 'stepRecords'],
  ['beatAnimFrameId', 'stepAnimFrameId'],

  // Video/Canvas patterns
  ['onVideoBeatChange', 'onVideoStepChange'],
  ['videoBeat', 'videoStep'],

  // Editor patterns
  ['BeatEditorPanel', 'StepEditorPanel'],
  ['beatEditorPanel', 'stepEditorPanel'],
  ['BeatEditor', 'StepEditor'],
  ['beatEditor', 'stepEditor'],

  // Grid patterns
  ['BeatGridComponent', 'StepGridComponent'],
  ['beatGridComponent', 'stepGridComponent'],

  // More specific patterns
  ['fullBeatRange', 'fullStepRange'],
  ['beatOperations', 'stepOperations'],
  ['BeatOperations', 'StepOperations'],
  ['samplesPerBeat', 'samplesPerStep'],
  ['minBeat', 'minStep'],
  ['maxBeat', 'maxStep'],


  // Data patterns
  ['RawBeatData', 'RawStepData'],
  ['rawBeatData', 'rawStepData'],
  ['beatsData', 'stepsData'],
  ['beatResults', 'stepResults'],
  ['BeatResults', 'StepResults'],
  ['filledBeats', 'filledSteps'],
  ['existingBeats', 'existingSteps'],
  ['beatViolations', 'stepViolations'],

  // Update patterns
  ['updatedBeats', 'updatedSteps'],
  ['separateBeatsFromStartPlacement', 'separateStepsFromStartPlacement'],

  // Generation patterns
  ['BeatGenerationOptions', 'StepGenerationOptions'],
  ['beatGenerationOptions', 'stepGenerationOptions'],
  ['generateStepTimestamps', 'generateStepTimestamps'],
  ['getTemplatesForBeatCount', 'getTemplatesForStepCount'],

  // Grid patterns
  ['gridBeatSize', 'gridStepSize'],
  ['beatgrid', 'stepgrid'],
  ['beatGrid', 'stepGrid'],
  ['BeatGrid', 'StepGrid'],

  // Sync patterns
  ['syncCurrentBeat', 'syncCurrentStep'],
  ['beatSyncInterval', 'stepSyncInterval'],

  // Count patterns
  ['turnBeatCount', 'turnStepCount'],
  ['sequenceBeatCount', 'sequenceStepCount'],
  ['newBeatNumber', 'newStepNumber'],
  ['practiceBeatIndex', 'practiceStepIndex'],

  // Pair patterns
  ['halvedBeatPairGroups', 'halvedStepPairGroups'],
  ['beatPairDesignations', 'stepPairDesignations'],

  // Position patterns
  ['beatPos', 'stepPos'],
  ['beatPosition', 'stepPosition'],

  // Removed/Added
  ['beatsRemoved', 'stepsRemoved'],
  ['beatsAdded', 'stepsAdded'],

  // Row/layout
  ['beatsPerRow', 'stepsPerRow'],

  // Check patterns
  ['beatToCheck', 'stepToCheck'],

  // Starting position
  ['startingPlacementBeat', 'startingPlacementStep'],
  ['updatedStartingPlacementBeat', 'updatedStartingPlacementStep'],


  // Interface patterns
  ['IBeatPairAnalyzer', 'IStepPairAnalyzer'],
  ['IBeatNumberRenderer', 'IStepNumberRenderer'],
  ['IFirstBeatAnalyzer', 'IFirstStepAnalyzer'],
  ['IBeatComparisonOrchestrator', 'IStepComparisonOrchestrator'],
  ['IBeatGenerationOrchestrator', 'IStepGenerationOrchestrator'],

  // Coordinator/Editor patterns
  ['BeatEditorCoordinator', 'StepEditorCoordinator'],
  ['BeatCalculationResult', 'StepCalculationResult'],

  // Propagated/calculated
  ['calculatePropagatedBeats', 'calculatePropagatedSteps'],
  ['propagatedBeats', 'propagatedSteps'],

  // Animation/Callback
  ['beatAnimationFrameId', 'stepAnimationFrameId'],
  ['beatChangeCallback', 'stepChangeCallback'],
  ['animatingBeatNumber', 'animatingStepNumber'],
  ['setAnimatingBeatNumber', 'setAnimatingStepNumber'],

  // Edit panel
  ['editPanelBeatData', 'editPanelStepData'],
  ['editPanelBeatsData', 'editPanelStepsData'],
  ['editPanelBeatIndex', 'editPanelStepIndex'],

  // Reversal
  ['redReversalBeats', 'redReversalSteps'],
  ['blueReversalBeats', 'blueReversalSteps'],

  // Preview/sequence
  ['previewBeats', 'previewSteps'],
  ['sequenceBeats', 'sequenceSteps'],

  // Navigation
  ['onPrevBeat', 'onPrevStep'],
  ['onNextBeat', 'onNextStep'],

  // Update operations
  ['updateBeatTurns', 'updateStepTurns'],
  ['updateBeatOrientation', 'updateStepOrientation'],

  // Beat removal
  ['toRemoveBeatPairDesignation', 'toRemoveStepPairDesignation'],

  // More specific patterns
  ['primaryBeatData', 'primaryStepData'],
  ['newlyAddedBeat', 'newlyAddedStep'],
  ['lastMasterBeat', 'lastMasterStep'],
  ['isBeatData', 'isStepData'],
  ['getBeatOperator', 'getStepOperator'],
  ['latestNextBeat', 'latestNextStep'],
  ['pendingBeatNumber', 'pendingStepNumber'],
  ['startingBeatNumber', 'startingStepNumber'],
  ['getKeyframeBeat', 'getKeyframeStep'],

  // Remaining beat patterns
  ['previousBeatsRef', 'previousStepsRef'],
  ['ggBeatIndex', 'ggStepIndex'],

  ['newlyAddedBeatIndex', 'newlyAddedStepIndex'],
  ['firstBeatAnalyzer', 'firstStepAnalyzer'],
  ['emptyBeats', 'emptySteps'],
  ['onBeatDataUpdate', 'onStepDataUpdate'],
  ['formatSectionBeats', 'formatSectionSteps'],
  ['dataWithBeatContext', 'dataWithStepContext'],
  ['currentBeatProgress', 'currentStepProgress'],
  ['createStartPlacementFromBeatEnd', 'createStartPlacementFromStepEnd'],
  ['existingStartPlacementBeat', 'existingStartPlacementStep'],
  ['pendingShiftBeatNumber', 'pendingShiftStepNumber'],
  ['clipBeatPosition', 'clipStepPosition'],
  ['toPublicBeatPairs', 'toPublicStepPairs'],


  // Converters
  ['BeatDataConverter', 'StepDataConverter'],
  ['beatDataConverter', 'stepDataConverter'],
  ['BroadcastBeatData', 'BroadcastStepData'],
  ['broadcastBeatData', 'broadcastStepData'],
  ['CondensedBeatData', 'CondensedStepData'],
  ['condensedBeatData', 'condensedStepData'],
  ['ValidatedBeatData', 'ValidatedStepData'],
  ['BeatDataSchema', 'StepDataSchema'],

  // File path patterns (for imports)
  ['beat-operations', 'step-operations'],
  ['beat-pair', 'step-pair'],
  ['BeatData', 'StepData'],
  ['IBeatOperator', 'IStepOperator'],
  ['IFirstBeatAnalyzer', 'IFirstStepAnalyzer'],
  ['BeatOperator', 'StepOperator'],
  ['FirstBeatAnalyzer', 'FirstStepAnalyzer'],
  ['IBeatConverter', 'IStepConverter'],
  ['IBeatGenerationOrchestrator', 'IStepGenerationOrchestrator'],
  ['BeatConverter', 'StepConverter'],
  ['BeatGenerationOrchestrator', 'StepGenerationOrchestrator'],
  ['BeatEditorCoordinator', 'StepEditorCoordinator'],
  ['BeatEditorHelpModal', 'StepEditorHelpModal'],
  ['BeatEditorPanel', 'StepEditorPanel'],
  ['BeatGridSection', 'StepGridSection'],
  ['FirstBeatConfirmDialog', 'FirstStepConfirmDialog'],
  ['SequenceBeatOperations', 'SequenceStepOperations'],
  ['beat-frame-layouts', 'step-frame-layouts'],
  ['beat-grid-display-models', 'step-grid-display-models'],
  ['beat-grid-models', 'step-grid-models'],
  ['beat-grid-display-state', 'step-grid-display-state'],
  ['RemoveBeatButton', 'RemoveStepButton'],
  ['BeatEditPanel', 'StepEditPanel'],
  ['WordBeatNavigation', 'WordStepNavigation'],
  ['BeatPairSelectionStatus', 'StepPairSelectionStatus'],
  ['SavedBeatPairsList', 'SavedStepPairsList'],
  ['BeatPairModePanel', 'StepPairModePanel'],
  ['BeatPairAnalysisDisplay', 'StepPairAnalysisDisplay'],
  ['beatpair-models', 'steppair-models'],
  ['internal-beat-models', 'internal-step-models'],
  ['beatpair-mode-state', 'steppair-mode-state'],
  ['IBeatComparisonOrchestrator', 'IStepComparisonOrchestrator'],
  ['IBeatDataConverter', 'IStepDataConverter'],
  ['IBeatPairAnalyzer', 'IStepPairAnalyzer'],
  ['BeatDataConverter', 'StepDataConverter'],
  ['BeatPairAnalyzer', 'StepPairAnalyzer'],
  ['BeatComparisonOrchestrator', 'StepComparisonOrchestrator'],
  ['AnimationBeatGrid', 'AnimationStepGrid'],
  ['IBeatNumberRenderer', 'IStepNumberRenderer'],
  ['BeatNumberRenderer', 'StepNumberRenderer'],
  ['beat-data-helpers', 'step-data-helpers'],
  ['BeatRemovalHandler', 'StepRemovalHandler'],
  ['beat-transforms', 'step-transforms'],
  ['MobilePlaybackBeatGrid', 'MobilePlaybackStepGrid'],
  ['beat-debug-exporter', 'step-debug-exporter'],
  ['beat-pictograph-conversion', 'step-pictograph-conversion'],

  // More method/property patterns
  ['prevBeatData', 'prevStepData'],
  ['extractBeatData', 'extractStepData'],
  ['getSelectedBeatData', 'getSelectedStepData'],
  ['hasFullBeatData', 'hasFullStepData'],
  ['exampleBeatData', 'exampleStepData'],
  ['pictographDataToBeatData', 'pictographDataToStepData'],
  ['workingBeatData', 'workingStepData'],
  ['getBeatDataForSequence', 'getStepDataForSequence'],

  ['onRemoveBeatPairDesignation', 'onRemoveStepPairDesignation'],
  ['beatTrackingFrameId', 'stepTrackingFrameId'],
  ['beatsGenerated', 'stepsGenerated'],
  ['beatEndPlacement', 'stepEndPlacement'],
  ['beatCalculationService', 'stepCalculationService'],
  ['animationEndBeat', 'animationEndStep'],
  ['animateToBeat', 'animateToStep'],
  ['updateForBeat', 'updateForStep'],
  ['updateBeatDuration', 'updateStepDuration'],
  ['toggleBeatInMultiSelect', 'toggleStepInMultiSelect'],
  ['syncFollowerBeat', 'syncFollowerStep'],
  ['showAllBeats', 'showAllSteps'],
  ['setTotalBeats', 'setTotalSteps'],
  ['requiredBeatCount', 'requiredStepCount'],
  ['renumberedBeats', 'renumberedSteps'],
  ['prevMasterBeat', 'prevMasterStep'],
  ['previousBeats', 'previousSteps'],
  ['pngBeats', 'pngSteps'],
  ['originalBeats', 'originalSteps'],
  ['ggggBeatIndex', 'ggggStepIndex'],
  ['ccccBeatIndex', 'ccccStepIndex'],
  ['getKeyframeBeatTime', 'getKeyframeStepTime'],
  ['generateStepTimestamps', 'generateStepTimestamps'],
  ['beatConverter', 'stepConverter'],


  // Count patterns
  ['maxBeatCount', 'maxStepCount'],
  ['incomingBeatCount', 'incomingStepCount'],
  ['getBeatCount', 'getStepCount'],
  ['existingBeatCount', 'existingStepCount'],
  ['updateBeatCount', 'updateStepCount'],
  ['restoredBeatCount', 'restoredStepCount'],
  ['BeatCount', 'StepCount'],
  ['beatCount', 'stepCount'],

  // Grid display state
  ['BeatGridDisplayState', 'StepGridDisplayState'],
  ['createBeatGridDisplayState', 'createStepGridDisplayState'],
  ['beatGridDisplayState', 'stepGridDisplayState'],

  // Frame layout
  ['BeatFrameLayout', 'StepFrameLayout'],
  ['beatFrameLayout', 'stepFrameLayout'],
  ['BeatFrameLayouts', 'StepFrameLayouts'],
  ['beatFrameLayouts', 'stepFrameLayouts'],
  ['BEAT_FRAME_LAYOUTS', 'STEP_FRAME_LAYOUTS'],

  // Pair transformation
  ['analyzeBeatPairTransformation', 'analyzeStepPairTransformation'],
  ['BeatPairTransformation', 'StepPairTransformation'],
  ['beatPairTransformation', 'stepPairTransformation'],

  // Visibility
  ['BeatNumbersVisibility', 'StepNumbersVisibility'],
  ['beatNumbersVisibility', 'stepNumbersVisibility'],

  // Timer/Tracking
  ['BeatTimer', 'StepTimer'],
  ['beatTimer', 'stepTimer'],
  ['BeatTracking', 'StepTracking'],
  ['beatTracking', 'stepTracking'],

  // Editor effect
  ['BeatEditorEffect', 'StepEditorEffect'],
  ['beatEditorEffect', 'stepEditorEffect'],

  // Addition
  ['BeatAddition', 'StepAddition'],
  ['beatAddition', 'stepAddition'],

  // Adjustments
  ['BeatWithAdjustments', 'StepWithAdjustments'],
  ['beatWithAdjustments', 'stepWithAdjustments'],

  // With letters
  ['beatsWithLetters', 'stepsWithLetters'],
  ['beatsWithLetter', 'stepsWithLetter'],
  ['BeatWithLetter', 'StepWithLetter'],
  ['beatWithLetter', 'stepWithLetter'],

  // Size value
  ['beatSizeValue', 'stepSizeValue'],
  ['BeatSizeValue', 'StepSizeValue'],

  // Prop type
  ['BeatPropType', 'StepPropType'],
  ['beatPropType', 'stepPropType'],

  // Multi select
  ['BeatMultiSelect', 'StepMultiSelect'],
  ['beatMultiSelect', 'stepMultiSelect'],

  // Lookup
  ['BeatLookup', 'StepLookup'],
  ['beatLookup', 'stepLookup'],

  // Has valid motions
  ['BeatHasValidMotions', 'StepHasValidMotions'],
  ['beatHasValidMotions', 'stepHasValidMotions'],

  // Event callback
  ['BeatEventCallback', 'StepEventCallback'],
  ['beatEventCallback', 'stepEventCallback'],

  // Index change
  ['BeatIndexChange', 'StepIndexChange'],
  ['beatIndexChange', 'stepIndexChange'],

  // Debug data
  ['BeatDebugData', 'StepDebugData'],
  ['beatDebugData', 'stepDebugData'],

  // Context
  ['BeatContext', 'StepContext'],
  ['beatContext', 'stepContext'],
  ['hasBeatContext', 'hasStepContext'],
  ['dataWithStepContext', 'dataWithStepContext'],

  // Grid position
  ['BeatGridPlacement', 'StepGridPlacement'],
  ['beatGridPlacement', 'stepGridPlacement'],

  // Selected
  ['BeatSelected', 'StepSelected'],

  // Timestamps
  ['BeatTimestamps', 'StepTimestamps'],
  ['beatTimestamps', 'stepTimestamps'],

  // Properties
  ['BeatProperties', 'StepProperties'],
  ['beatProperties', 'stepProperties'],
  ['BEAT_PROPERTIES', 'STEP_PROPERTIES'],

  // Indices
  ['BeatIndices', 'StepIndices'],
  ['beatIndices', 'stepIndices'],

  // Constants
  ['BEAT_SIZE', 'STEP_SIZE'],
  ['BEAT_NUMBER_X', 'STEP_NUMBER_X'],
  ['BEAT_NUMBER_Y', 'STEP_NUMBER_Y'],
  ['BEAT_NUMBER', 'STEP_NUMBER'],
  ['BEAT', 'STEP'],
  ['BEATS', 'STEPS'],

  // Numeric beat references (beat0, beat1, beat2)
  ['beat0', 'step0'],
  ['beat1', 'step1'],
  ['beat2', 'step2'],
  ['beat3', 'step3'],

  // Change
  ['BeatChange', 'StepChange'],
  ['beatChange', 'stepChange'],

  // Open/close panel
  ['openBeatEditorPanel', 'openStepEditorPanel'],
  ['closeBeatEditorPanel', 'closeStepEditorPanel'],

  // More specific patterns from analysis
  ['BeatNumber', 'StepNumber'],
  ['stepNumberRenderer', 'stepNumberRenderer'],
  ['drawStepNumber', 'drawStepNumber'],


  // Expected/get number patterns
  ['expectedBeatNumber', 'expectedStepNumber'],
  ['getBeatNumber', 'getStepNumber'],
  ['getBeatNumbers', 'getStepNumbers'],
  ['renderBeatNumberToCanvas', 'renderStepNumberToCanvas'],
  ['selectedBeatNumberRef', 'selectedStepNumberRef'],

  // Step-related in video/canvas contexts
  ['getBeatNumberForFrame', 'getStepNumberForFrame'],

  // More index patterns
  ['beatIndexRef', 'stepIndexRef'],
  ['BeatIdx', 'StepIdx'],
  ['getBeatIndex', 'getStepIndex'],

  // More data patterns
  ['beatDataRef', 'stepDataRef'],
  ['updatedBeatRef', 'updatedStepRef'],

  // Animation/position patterns
  ['currentBeatPosition', 'currentStepPosition'],
  ['animationBeat', 'animationStep'],

  // Navigation controls
  ['onHalfBeatBackward', 'onHalfStepBackward'],
  ['onHalfBeatForward', 'onHalfStepForward'],
  ['onFullBeatBackward', 'onFullStepBackward'],
  ['onFullBeatForward', 'onFullStepForward'],

  // More count patterns
  ['lastBeatCount', 'lastStepCount'],
  ['prevBeatCount', 'prevStepCount'],

  // More pair patterns
  ['BeatPairMode', 'StepPairMode'],
  ['beatPairMode', 'stepPairMode'],

  // Canvas patterns
  ['canvasBeat', 'canvasStep'],
  ['renderBeat', 'renderStep'],


  // Selection patterns with BeatNumber
  ['initialBeatNumber', 'initialStepNumber'],
  ['removedBeatNumber', 'removedStepNumber'],
  ['insertedBeatNumber', 'insertedStepNumber'],
  ['localSelectedBeatNumber', 'localSelectedStepNumber'],
  ['adjustSelectionForRemovedBeat', 'adjustSelectionForRemovedStep'],
  ['adjustSelectionForInsertedBeat', 'adjustSelectionForInsertedStep'],
  ['getSelectedBeatNumber', 'getSelectedStepNumber'],
  ['getShowBeatNumbers', 'getShowStepNumbers'],
  ['setShowBeatNumbers', 'setShowStepNumbers'],

  // More selection patterns
  ['enterMultiSelectMode', 'enterMultiSelectMode'],

  // Constants
  ['BEAT_NUMBER_X', 'STEP_NUMBER_X'],
  ['BEAT_NUMBER_Y', 'STEP_NUMBER_Y'],

  // Position patterns
  ['BeatPosition', 'StepPosition'],
  ['beatPosition', 'stepPosition'],

  // Size patterns
  ['BeatSize', 'StepSize'],

  // Pair mode state
  ['BeatPairModeState', 'StepPairModeState'],
  ['beatPairModeState', 'stepPairModeState'],

  // More compound patterns
  ['currentBeatData', 'currentStepData'],
  ['nextBeatData', 'nextStepData'],
  ['prevBeatData', 'prevStepData'],

  // Reversal patterns
  ['beatReversals', 'stepReversals'],
  ['BeatReversals', 'StepReversals'],


  // Index methods
  ['getCurrentBeatIndex', 'getCurrentStepIndex'],
  ['setCurrentBeatIndex', 'setCurrentStepIndex'],
  ['getSelectedBeatIndex', 'getSelectedStepIndex'],
  ['getRemovingBeatIndex', 'getRemovingStepIndex'],
  ['isValidBeatIndex', 'isValidStepIndex'],
  ['adjustedBeatIndex', 'adjustedStepIndex'],

  // Event callbacks
  ['onBeatIndexChange', 'onStepIndexChange'],
  ['onPracticeBeatIndexChange', 'onPracticeStepIndexChange'],
  ['setPracticeBeatIndex', 'setPracticeStepIndex'],

  // Derived state
  ['beatDataWithSelection', 'stepDataWithSelection'],
  ['aabbBeatIndex', 'aabbStepIndex'],

  // More patterns
  ['practiceBeatIndex', 'practiceStepIndex'],
  ['removingBeatIndex', 'removingStepIndex'],
  ['currentBeatIdx', 'currentStepIdx'],
];

// Patterns to SKIP (keep as "beat" - musical context)
const SKIP_PATTERNS = [
  'BeatMarker',      // Audio beat markers
  'BeatTapper',      // Manual beat tapping
  'downbeat',        // Musical term
  'offbeat',         // Musical term
  'upbeat',          // Musical term
  'heartbeat',       // Not related
  'BPM',             // Beats per minute
  'beatsPerMinute',
  'beat_per_minute',
];

// Files/directories to skip
const SKIP_PATHS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.svelte-kit',
];

function shouldSkipFile(filePath) {
  return SKIP_PATHS.some(skip => filePath.includes(skip));
}

function shouldSkipReplacement(line, pattern) {
  return SKIP_PATTERNS.some(skip => {
    const lowerLine = line.toLowerCase();
    const lowerSkip = skip.toLowerCase();
    // Check if the skip pattern is in the line
    return lowerLine.includes(lowerSkip);
  });
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  for (const [from, to] of REPLACEMENTS) {
    // Create regex that matches whole words only
    const regex = new RegExp(`\\b${from}\\b`, 'g');

    if (regex.test(content)) {
      // Check each match to see if we should skip it
      const newContent = content.replace(regex, (match, offset) => {
        // Get the line containing this match
        const lineStart = content.lastIndexOf('\n', offset) + 1;
        const lineEnd = content.indexOf('\n', offset);
        const line = content.substring(lineStart, lineEnd === -1 ? content.length : lineEnd);

        // Check if this line contains a skip pattern
        if (shouldSkipReplacement(line, from)) {
          return match; // Keep original
        }

        return to;
      });

      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }

  return false;
}

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (!SKIP_PATHS.includes(file)) {
        walkDir(filePath, callback);
      }
    } else {
      const ext = path.extname(file);
      if (EXTENSIONS.includes(ext)) {
        callback(filePath);
      }
    }
  }
}

function main() {
  console.log('Starting beat → step rename...\n');

  let modifiedCount = 0;
  let totalFiles = 0;

  walkDir(SRC_DIR, (filePath) => {
    if (shouldSkipFile(filePath)) return;

    totalFiles++;
    const modified = processFile(filePath);
    if (modified) {
      modifiedCount++;
      console.log(`Modified: ${filePath}`);
    }
  });

  console.log(`\nComplete! Modified ${modifiedCount} of ${totalFiles} files.`);
}

main();
