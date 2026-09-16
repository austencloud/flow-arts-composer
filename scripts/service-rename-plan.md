# Service Rename Plan

Drop the "Service" suffix in favor of names that describe what the class actually does.

## Naming Patterns

| Pattern          | Old Suffix               | New Suffix      | Example                                                       |
| ---------------- | ------------------------ | --------------- | ------------------------------------------------------------- |
| CRUD/Data Access | `*Service`               | `*Repository`   | `FeedbackService` → `FeedbackRepository`                      |
| Queries          | `*QueryService`          | `*Querier`      | `FeedbackQueryService` → `FeedbackQuerier`                    |
| Filtering        | `*FilterService`         | `*Filter`       | `BrowseFilterService` → `BrowseFilter`                    |
| Transformation   | `*TransformationService` | `*Transformer`  | `SequenceTransformationService` → `SequenceTransformer`       |
| Conversion       | `*ConversionService`     | `*Converter`    | `BeatConverterService` → `BeatConverter`                      |
| Rendering        | `*RenderingService`      | `*Renderer`     | `GridRenderingService` → `GridRenderer`                       |
| Detection        | `*DetectionService`      | `*Detector`     | `LOOPDetectionService` → `LOOPDetector`                       |
| Analysis         | `*AnalysisService`       | `*Analyzer`     | `SequenceAnalysisService` → `SequenceAnalyzer`                |
| Calculation      | `*CalculationService`    | `*Calculator`   | `DimensionCalculationService` → `DimensionCalculator`         |
| Export           | `*ExportService`         | `*Exporter`     | `VideoExporter` → `VideoExporter`                             |
| Import           | `*ImportService`         | `*Importer`     | `SequenceImportService` → `SequenceImporter`                  |
| Playback         | `*PlaybackService`       | `*Player`       | `VideoPlaybackService` → `VideoPlayer`                        |
| Persistence      | `*PersistenceService`    | `*Persister`    | `SettingsPersistenceService` → `SettingsPersister`            |
| Loading          | `*LoadingService`        | `*Loader`       | `SequenceLoadingService` → `SequenceLoader`                   |
| Initialization   | `*InitializationService` | `*Initializer`  | `PersistenceInitializationService` → `PersistenceInitializer` |
| Validation       | `*ValidationService`     | `*Validator`    | `SequenceValidationService` → `SequenceValidator`             |
| Notification     | `*NotificationService`   | `*Notifier`     | `NotificationService` → `Notifier`                            |
| Caching          | `*CacheService`          | `*Cache`        | `SequenceCacheService` → `SequenceCache`                      |
| Sorting          | `*SortingService`        | `*Sorter`       | `FeedbackSortingService` → `FeedbackSorter`                   |
| Formatting       | `*FormattingService`     | `*Formatter`    | `FeedbackFormattingService` → `FeedbackFormatter`             |
| Storage          | `*StorageService`        | `*Storage`      | `AnimationStorageService` → `AnimationStorage`                |
| Orchestration    | `*OrchestrationService`  | `*Orchestrator` | `GenerationOrchestrationService` → `GenerationOrchestrator`   |
| Comparison       | `*ComparisonService`     | `*Comparator`   | `ReflectionComparisonService` → `ReflectionComparator`        |
| Generation       | `*GeneratorService`      | `*Generator`    | `GradientGeneratorService` → `GradientGenerator`              |
| Management       | `*ManagementService`     | `*Manager`      | `CanvasManagementService` → `CanvasManager`                   |
| Coordination     | `*CoordinationService`   | `*Coordinator`  | `SequenceCoordinationService` → `SequenceCoordinator`         |
| Configuration    | `*ConfigurationService`  | `*Configurator` | `BackgroundConfigurationService` → `BackgroundConfigurator`   |
| Tracking         | `*TrackingService`       | `*Tracker`      | `SessionTrackingService` → `SessionTracker`                   |
| Syncing          | `*SyncService`           | `*Syncer`       | `NavigationSyncService` → `NavigationSyncer`                  |
| Subscription     | `*SubscriptionService`   | `*Subscriber`   | `FeedbackSubscriptionService` → `FeedbackSubscriber`          |

---

## Complete Rename List (370+ services)

### Admin Feature

| Current                    | Proposed                |
| -------------------------- | ----------------------- |
| `AdminChallengeService`    | `AdminChallengeManager` |
| `AdminNotificationService` | `AdminNotifier`         |
| `AnalyticsDataService`     | `AnalyticsDataProvider` |
| `AnnouncementService`      | `AnnouncementManager`   |
| `AuditLogService`          | `AuditLogger`           |
| `SystemStateService`       | `SystemStateManager`    |
| `UserActivityService`      | `UserActivityTracker`   |

### LOOP Labeler Feature

| Current                         | Proposed                 |
| ------------------------------- | ------------------------ |
| `BeatDataConversionService`     | `BeatDataConverter`      |
| `BeatPairAnalysisService`       | `BeatPairAnalyzer`       |
| `CandidateFormattingService`    | `CandidateFormatter`     |
| `LOOPDesignationService`        | `LOOPDesignator`         |
| `LOOPDetectionService`          | `LOOPDetector`           |
| `LOOPLabelsFirebaseService`     | `LOOPLabelsRepository`   |
| `LayeredPathDetectionService`   | `LayeredPathDetector`    |
| `NavigationService`             | `Navigator`              |
| `PolyrhythmicDetectionService`  | `PolyrhythmicDetector`   |
| `ReflectionComparisonService`   | `ReflectionComparator`   |
| `RotationComparisonService`     | `RotationComparator`     |
| `SequenceLoadingService`        | `SequenceLoader`         |
| `SwapInvertComparisonService`   | `SwapInvertComparator`   |
| `TransformationAnalysisService` | `TransformationAnalyzer` |

### Compose Feature

| Current                   | Proposed             |
| ------------------------- | -------------------- |
| `AudioLibraryService`     | `AudioLibrary`       |
| `AudioStorageService`     | `AudioStorage`       |
| `AnimationLoopService`    | `AnimationLooper`    |
| `AnimationStorageService` | `AnimationStorage`   |
| `SequenceNormalizer`      | `SequenceNormalizer` |
| `TrailCaptureService`     | `TrailCapturer`      |
| `VideoExporter`           | `VideoExporter`      |
| `VideoPlaybackService`    | `VideoPlayer`        |
| `VideoPreRenderService`   | `VideoPreRenderer`   |
| `TimelinePlaybackService` | `TimelinePlayer`     |
| `TimelineSnapService`     | `TimelineSnapper`    |
| `SnapService`             | `Snapper`            |

### Create Feature

| Current                             | Proposed                          |
| ----------------------------------- | --------------------------------- |
| `SwipeDetectionService`             | `SwipeDetector`                   |
| `FilterPersistenceService`          | `FilterPersister`                 |
| `LayoutDetectionService`            | `LayoutDetector`                  |
| `PictographPreparerService`         | `PictographPreparer`              |
| `StartPlacementService`              | `StartPlacementManager`            |
| `TurnControlService`                | `TurnController`                  |
| `LOOPDetectionService`              | `LOOPDetector`                    |
| `BeatConverterService`              | `BeatConverter`                   |
| `LOOPTypeService`                   | `LOOPTypeResolver`                |
| `CardConfigurationService`          | `CardConfigurator`                |
| `GenerationOrchestrationService`    | `GenerationOrchestrator`          |
| `PictographFilterService`           | `PictographFilter`                |
| `ResponsiveTypographyService`       | `ResponsiveTypographer`           |
| `SequenceMetadataService`           | `SequenceMetadataManager`         |
| `TurnManagementService`             | `TurnManager`                     |
| `MetronomeService`                  | `Metronome`                       |
| `CreateModuleLayoutService`         | `CreateModuleLayoutManager`       |
| `AutosaveService`                   | `Autosaver`                       |
| `AutocompleteService`               | `Autocompleter`                   |
| `BeatOperationsService`             | `BeatOperator`                    |
| `CreateModuleEventService`          | `CreateModuleEventBus`            |
| `CreateModuleInitializationService` | `CreateModuleInitializer`         |
| `CreateModuleService`               | `CreateModuleCoordinator`         |
| `CreateModuleTransitionService`     | `CreateModuleTransitioner`        |
| `CreationMethodPersistenceService`  | `CreationMethodPersister`         |
| `DeepLinkSequenceService`           | `DeepLinkSequenceHandler`         |
| `KeyboardArrowAdjustmentService`    | `KeyboardArrowAdjuster`           |
| `NavigationSyncService`             | `NavigationSyncer`                |
| `PanelPersistenceService`           | `PanelPersister`                  |
| `ResponsiveLayoutService`           | `ResponsiveLayoutManager`         |
| `ReversalDetectionService`          | `ReversalDetector`                |
| `RotationDirectionPatternService`   | `RotationDirectionPatternManager` |
| `SequenceAnalysisService`           | `SequenceAnalyzer`                |
| `SequenceDomainService`             | `SequenceDomainManager`           |
| `SequenceExportService`             | `SequenceExporter`                |
| `SequenceImportService`             | `SequenceImporter`                |
| `SequenceIndexService`              | `SequenceIndexer`                 |
| `SequencePersistenceService`        | `SequencePersister`               |
| `SequenceService`                   | `SequenceRepository`              |
| `SequenceStatisticsService`         | `SequenceStatistician`            |
| `SequenceTransformationService`     | `SequenceTransformer`             |
| `SequenceValidationService`         | `SequenceValidator`               |
| `TurnPatternService`                | `TurnPatternManager`              |
| `UndoService`                       | `UndoManager`                     |
| `WorkbenchService`                  | `Workbench`                       |

### Dashboard Feature

| Current                | Proposed                |
| ---------------------- | ----------------------- |
| `FollowingFeedService` | `FollowingFeedProvider` |

### Browse Feature

| Current                         | Proposed                    |
| ------------------------------- | --------------------------- |
| `BrowseCacheService`          | `BrowseCache`             |
| `BrowseDeleteService`         | `BrowseDeleter`           |
| `BrowseEventHandlerService`   | `BrowseEventHandler`      |
| `BrowseFilterService`         | `BrowseFilter`            |
| `BrowsePersistenceService`    | `BrowsePersister`         |
| `BrowseScrollBehaviorService` | `BrowseScrollBehavior`    |
| `BrowseSectionService`        | `BrowseSectionManager`    |
| `BrowseSortService`           | `BrowseSorter`            |
| `BrowseThumbnailService`      | `BrowseThumbnailProvider` |
| `NavigationService`             | `Navigator`                 |
| `SpotlightService`              | `SpotlightManager`          |
| `FavoritesService`              | `FavoritesManager`          |
| `OptimizedBrowseService`      | `OptimizedBrowseer`       |
| `SectionService`                | `SectionManager`            |

### Feedback Feature

| Current                          | Proposed                         |
| -------------------------------- | -------------------------------- |
| `FeedbackEditingService`         | `FeedbackEditor`                 |
| `FeedbackFormattingService`      | `FeedbackFormatter`              |
| `FeedbackQueryService`           | `FeedbackQuerier`                |
| `FeedbackService`                | `FeedbackRepository`             |
| `FeedbackSortingService`         | `FeedbackSorter`                 |
| `FeedbackStatusService`          | `FeedbackStatusManager`          |
| `FeedbackSubmissionService`      | `FeedbackSubmitter`              |
| `FeedbackSubscriptionService`    | `FeedbackSubscriber`             |
| `FeedbackSubtaskService`         | `FeedbackSubtaskManager`         |
| `FeedbackTesterWorkflowService`  | `FeedbackTesterWorkflow`         |
| `NotificationPreferencesService` | `NotificationPreferencesManager` |
| `NotificationService`            | `Notifier`                       |
| `NotificationTriggerService`     | `NotificationTrigger`            |
| `VersionService`                 | `VersionManager`                 |

### Learn Feature

| Current                  | Proposed                 |
| ------------------------ | ------------------------ |
| `CodexService`           | `Codex`                  |
| `QuizSessionService`     | `QuizSession`            |
| `AnswerCheckerService`   | `AnswerChecker`          |
| `ConceptProgressService` | `ConceptProgressTracker` |

### Library Feature

| Current                   | Proposed               |
| ------------------------- | ---------------------- |
| `CollectionService`       | `CollectionRepository` |
| `ForkService`             | `Forker`               |
| `LibraryActService`       | `LibraryActManager`    |
| `LibraryMigrationService` | `LibraryMigrator`      |
| `LibraryService`          | `LibraryRepository`    |
| `TagService`              | `TagRepository`        |

### Train Feature

| Current                       | Proposed                    |
| ----------------------------- | --------------------------- |
| `CocoExportService`           | `CocoExporter`              |
| `DataCaptureService`          | `DataCapturer`              |
| `FirebaseMLStorageService`    | `FirebaseMLStorage`         |
| `MLTrainingStorageService`    | `MLTrainingStorage`         |
| `CameraService`               | `Camera`                    |
| `HandAssignmentService`       | `HandAssigner`              |
| `HandLandmarkerService`       | `HandLandmarker`            |
| `PerformanceHistoryService`   | `PerformanceHistoryManager` |
| `PerformanceRecordingService` | `PerformanceRecorder`       |
| `PerformanceScoringService`   | `PerformanceScorer`         |
| `PositionDetectionService`    | `PositionDetector`          |
| `TrainChallengeService`       | `TrainChallengeManager`     |
| `VoiceCommandService`         | `VoiceCommandHandler`       |
| `MediaPipeDetectionService`   | `MediaPipeDetector`         |

### Choreo Card Feature

| Current                            | Proposed                    |
| ---------------------------------- | --------------------------- |
| `PrintablePageLayoutService`       | `PrintablePageLayouter`     |
| `WordCardExportIntegrationService` | `WordCardExportIntegrator`  |
| `PageFactoryService`               | `PageFactory`               |
| `PageImageExportService`           | `PageImageExporter`         |
| `WordCardBatchProcessingService`   | `WordCardBatchProcessor`    |
| `WordCardCacheService`             | `WordCardCache`             |
| `WordCardImageConversionService`   | `WordCardImageConverter`    |
| `WordCardImageGenerationService`   | `WordCardImageGenerator`    |
| `WordCardMetadataOverlayService`   | `WordCardMetadataOverlayer` |
| `WordCardSVGCompositionService`    | `WordCardSVGComposer`       |

### Write Feature

| Current              | Proposed      |
| -------------------- | ------------- |
| `ActService`         | `ActManager`  |
| `MusicPlayerService` | `MusicPlayer` |

### Shared - 3D Animation

| Current                         | Proposed                |
| ------------------------------- | ----------------------- |
| `Animation3DPersistenceService` | `Animation3DPersister`  |
| `AvatarAnimationService`        | `AvatarAnimator`        |
| `AvatarCustomizationService`    | `AvatarCustomizer`      |
| `AvatarSkeletonService`         | `AvatarSkeletonBuilder` |
| `IKSolverService`               | `IKSolver`              |

### Shared - Analytics

| Current              | Proposed         |
| -------------------- | ---------------- |
| `ActivityLogService` | `ActivityLogger` |

### Shared - Animation Engine

| Current                          | Proposed                    |
| -------------------------------- | --------------------------- |
| `AnimationPrecomputationService` | `AnimationPrecomputer`      |
| `AnimationRenderLoopService`     | `AnimationRenderLoop`       |
| `AnimationService`               | `AnimationController`       |
| `AnimationVisibilitySyncService` | `AnimationVisibilitySyncer` |
| `AnimatorServiceLoader`          | `AnimatorLoader`            |
| `GlyphCacheService`              | `GlyphCache`                |
| `GlyphTextureService`            | `GlyphTextureLoader`        |
| `GlyphTransitionService`         | `GlyphTransitioner`         |
| `PropTextureService`             | `PropTextureLoader`         |
| `PropStateInterpolatorService`   | `PropStateInterpolator`     |
| `PropPlacementService`           | `PropPlacer`                |
| `PropRenderingService`           | `PropRenderer`              |
| `PropRotationStateService`       | `PropRotationStateManager`  |
| `PropTypeChangeService`          | `PropTypeChanger`           |
| `PropTypeConfigurationService`   | `PropTypeConfigurator`      |

### Shared - Auth

| Current                 | Proposed                |
| ----------------------- | ----------------------- |
| `AuthService`           | `Authenticator`         |
| `ImpersonationService`  | `Impersonator`          |
| `ProfilePictureService` | `ProfilePictureManager` |
| `UserDocumentService`   | `UserDocumentManager`   |
| `FeatureFlagService`    | `FeatureFlagManager`    |

### Shared - Background

| Current                          | Proposed                 |
| -------------------------------- | ------------------------ |
| `BackgroundConfigurationService` | `BackgroundConfigurator` |
| `BackgroundRenderingService`     | `BackgroundRenderer`     |
| `NightSkyCalculationService`     | `NightSkyCalculator`     |

### Shared - Community

| Current              | Proposed         |
| -------------------- | ---------------- |
| `LeaderboardService` | `Leaderboard`    |
| `UserService`        | `UserRepository` |

### Shared - Device

| Current                 | Proposed                 |
| ----------------------- | ------------------------ |
| `HapticFeedbackService` | `HapticFeedbackProvider` |

### Shared - Error

| Current                | Proposed       |
| ---------------------- | -------------- |
| `ErrorHandlingService` | `ErrorHandler` |

### Shared - Foundation

| Current                     | Proposed               |
| --------------------------- | ---------------------- |
| `DataTransformationService` | `DataTransformer`      |
| `DeepLinkService`           | `DeepLinkHandler`      |
| `DexiePersistenceService`   | `DexiePersister`       |
| `FileDownloadService`       | `FileDownloader`       |
| `GestureService`            | `GestureHandler`       |
| `RippleEffectService`       | `RippleEffectProvider` |
| `StorageService`            | `Storage`              |

### Shared - Gamification

| Current                   | Proposed                  |
| ------------------------- | ------------------------- |
| `AchievementService`      | `AchievementManager`      |
| `DailyChallengeService`   | `DailyChallengeManager`   |
| `NotificationService`     | `Notifier`                |
| `SkillProgressionService` | `SkillProgressionTracker` |
| `StreakService`           | `StreakTracker`           |
| `WeeklyChallengeService`  | `WeeklyChallengeManager`  |

### Shared - Keyboard

| Current                        | Proposed                  |
| ------------------------------ | ------------------------- |
| `CommandPaletteService`        | `CommandPalette`          |
| `KeyboardNavigationService`    | `KeyboardNavigator`       |
| `KeyboardShortcutService`      | `KeyboardShortcutManager` |
| `ShortcutCustomizationService` | `ShortcutCustomizer`      |
| `ShortcutRegistryService`      | `ShortcutRegistry`        |

### Shared - Messaging

| Current               | Proposed                 |
| --------------------- | ------------------------ |
| `ConversationService` | `ConversationRepository` |
| `MessagingService`    | `Messenger`              |
| `PresenceService`     | `PresenceTracker`        |

### Shared - Mobile

| Current                      | Proposed                     |
| ---------------------------- | ---------------------------- |
| `MobileFullscreenService`    | `MobileFullscreenManager`    |
| `PWAEngagementService`       | `PWAEngagementTracker`       |
| `PWAInstallDismissalService` | `PWAInstallDismissalManager` |

### Shared - Navigation

| Current                        | Proposed              |
| ------------------------------ | --------------------- |
| `ModuleSelectionService`       | `ModuleSelector`      |
| `NavigationPersistenceService` | `NavigationPersister` |
| `NavigationValidationService`  | `NavigationValidator` |
| `SequenceEncoder`              | `SequenceEncoder`     |

### Shared - Onboarding

| Current                        | Proposed              |
| ------------------------------ | --------------------- |
| `OnboardingPersistenceService` | `OnboardingPersister` |

### Shared - Pictograph

| Current                         | Proposed                       |
| ------------------------------- | ------------------------------ |
| `ArrowGridCoordinateService`    | `ArrowGridCoordinator`         |
| `ArrowLocationService`          | `ArrowLocator`                 |
| `ArrowPlacementKeyService`      | `ArrowPlacementKeyGenerator`   |
| `ArrowPlacementService`         | `ArrowPlacer`                  |
| `BetaDetectionService`          | `BetaDetector`                 |
| `DefaultPlacementService`       | `DefaultPlacer`                |
| `DirectionalTupleService`       | `DirectionalTupleBuilder`      |
| `AngleMathService`              | `AngleCalculator`              |
| `GridRenderingService`          | `GridRenderer`                 |
| `LetterClassificationService`   | `LetterClassifier`             |
| `LetterDeriver`                 | `LetterDeriver`                |
| `MotionCalculatorService`       | `MotionCalculator`             |
| `OrientationService`            | `OrientationResolver`          |
| `PositionDeriverService`        | `PositionDeriver`              |
| `SpecialPlacementDataService`   | `SpecialPlacementDataProvider` |
| `SpecialPlacementLookupService` | `SpecialPlacementLookup`       |
| `SpecialPlacementService`       | `SpecialPlacer`                |
| `TurnsTupleGeneratorService`    | `TurnsTupleGenerator`          |

### Shared - Render

| Current                       | Proposed               |
| ----------------------------- | ---------------------- |
| `CanvasManagementService`     | `CanvasManager`        |
| `CanvasResizer`               | `CanvasResizer`        |
| `ComponentManagementService`  | `ComponentManager`     |
| `DimensionCalculationService` | `DimensionCalculator`  |
| `FilenameGeneratorService`    | `FilenameGenerator`    |
| `ImageCompositionService`     | `ImageComposer`        |
| `ImageFormatConverterService` | `ImageFormatConverter` |
| `LayoutCalculationService`    | `LayoutCalculator`     |
| `PictographRenderingService`  | `PictographRenderer`   |
| `SequenceRenderService`       | `SequenceRenderer`     |
| `SvgImageService`             | `SvgImageLoader`       |
| `SvgPreloadService`           | `SvgPreloader`         |
| `SVGToCanvasConverterService` | `SVGToCanvasConverter` |
| `TextRenderingService`        | `TextRenderer`         |

### Shared - SEO

| Current      | Proposed     |
| ------------ | ------------ |
| `SeoService` | `SeoManager` |

### Shared - Settings

| Current                              | Proposed                    |
| ------------------------------------ | --------------------------- |
| `FirebaseSettingsPersistenceService` | `FirebaseSettingsPersister` |
| `ThemeService`                       | `ThemeManager`              |

### Shared - Share

| Current                 | Proposed                |
| ----------------------- | ----------------------- |
| `FirebaseVideoUploader` | `FirebaseVideoUploader` |
| `InstagramLinkService`  | `InstagramLinker`       |
| `MediaBundlerService`   | `MediaBundler`          |
| `ShareService`          | `Sharer`                |
| `SheetRouterService`    | `SheetRouter`           |

### Shared - Video Collaboration

| Current                     | Proposed                    |
| --------------------------- | --------------------------- |
| `CollaborativeVideoService` | `CollaborativeVideoManager` |
| `SubscriptionService`       | `Subscriber`                |

### Shared - Video Record

| Current                       | Proposed             |
| ----------------------------- | -------------------- |
| `RecordingPersistenceService` | `RecordingPersister` |
| `VideoRecordService`          | `VideoRecorder`      |

### Shared - Misc

| Current                    | Proposed              |
| -------------------------- | --------------------- |
| `PlatformDetectionService` | `PlatformDetector`    |
| `SessionTrackingService`   | `SessionTracker`      |
| `SequenceCacheService`     | `SequenceCache`       |
| `SequenceConverterService` | `SequenceConverter`   |
| `SequenceViewerService`    | `SequenceViewer`      |
| `URLSyncService`           | `URLSyncer`           |
| `ViewportService`          | `ViewportManager`     |
| `TrailSettingsSyncService` | `TrailSettingsSyncer` |
| `PreviewCacheService`      | `PreviewCache`        |

---

## Implementation Strategy

1. **Phase 1**: Rename interfaces (I*Service.ts → I*[NewName].ts)
2. **Phase 2**: Rename implementations (_Service.ts → _[NewName].ts)
3. **Phase 3**: Update DI container bindings
4. **Phase 4**: Update all imports across codebase
5. **Phase 5**: Update inversify types.ts symbols

Each phase should be a separate commit for easy rollback.

## Files to Update Per Service

For each service rename, update:

1. Interface file (contracts/I\*Service.ts)
2. Implementation file (implementations/\*Service.ts)
3. Interface name inside the file
4. Class name inside the file
5. Symbol in types.ts (e.g., `TYPES.IFeedbackService` → `TYPES.IFeedbackRepository`)
6. Module bindings (\*.module.ts)
7. All files that import the interface/class
8. All files that use the DI symbol

## Estimated Scope

- **493 files** to rename
- **~200 unique services** (contract + implementation pairs)
- **~1000+ import statements** to update
- **~50 module binding files** to update
- **~10 types.ts files** to update
