# TKA Web App - Test Suite

## 🎯 Overview

This directory contains all tests for the TKA Web Application, organized in a clean, maintainable structure that separates different types of tests by purpose and scope.

## 📁 Directory Structure

```
tests/
├── unit/                    # Fast, isolated unit tests (12 files, 301 tests)
│   ├── build/              # Build module tests
│   ├── device/             # Device detection tests
│   ├── foundation/         # Foundation service tests
│   ├── inversify/          # DI container tests
│   ├── pictograph/         # Pictograph engine tests
│   ├── render/             # Rendering service tests
│   ├── state/              # State management tests
│   └── workbench/          # Workbench utility tests
├── integration/            # Integration tests
│   └── services/           # Service integration tests
├── e2e/                    # End-to-end tests (Playwright)
│   ├── navigation-*.spec.ts # Navigation tests
│   ├── background-settings.spec.ts # Settings tests
│   └── clear-sequence-navigation.spec.ts # Clear sequence navigation
├── helpers/                # Test helper utilities
├── mocks/                  # Mock data and services
├── setup/                  # Test configuration and setup
└── README.md               # This file
```

**Note**: Debug and manual test directories have been removed as they provided no automated testing value.

## 🚀 Running Tests

### All Tests

```bash
npm run test                # Run all Vitest tests (unit + integration)
```

### By Category

```bash
npm run test:unit          # Run only unit tests
npm run test:integration   # Run only integration tests
```

### End-to-End Tests

```bash
npm run test:seo           # Run SEO integration tests
npm run test:seo:headed    # Run SEO tests with browser UI
npm run test:seo:debug     # Run SEO tests in debug mode
```

## 📋 Test Categories

### Unit Tests (`tests/unit/`)

- **Purpose**: Fast, isolated tests for individual components and services
- **Scope**: Single component or service in isolation
- **Speed**: < 1 second per test (total suite: ~11 seconds)
- **Dependencies**: Mocked or stubbed
- **Count**: 13 test files, 309 tests (all passing ✅)

**Key Test Files:**

- `GridPlacementDeriver.test.ts` - Core domain logic (37 tests)
- `DimensionCalculationService.test.ts` - Rendering calculations (64 tests)
- `BeatNumberingService.test.ts` - Data integrity (15 tests)
- `container.test.ts` - DI container (22 tests)
- `DeviceDetector.test.ts` - Device detection (46 tests)

### Integration Tests (`tests/integration/`)

- **Purpose**: Test interactions between multiple components/services
- **Scope**: Multiple components working together
- **Speed**: < 5 seconds per test
- **Dependencies**: Real services, mocked external APIs

### E2E Tests (`tests/e2e/`)

- **Purpose**: Full user workflow testing
- **Scope**: Complete user journeys
- **Speed**: 10+ seconds per test
- **Dependencies**: Real browser, real services

**Key Test Files:**

- `navigation-layout-visual.spec.ts` - Visual regression tests
- `navigation-landscape-mobile.spec.ts` - Mobile navigation
- `navigation-dropdown.spec.ts` - Dropdown interactions
- `background-settings.spec.ts` - Settings functionality

## 🔧 Config

### Vitest Config

- **Config File**: `vitest.config.ts`
- **Setup File**: `tests/setup/vitest-setup.ts`
- **Environment**: jsdom
- **Aliases**: `$lib` and `$app` for imports

### Playwright Config

- **Config File**: `playwright.config.ts`
- **Test Directory**: `tests/e2e/`
- **Browsers**: Chrome, Firefox, Safari

## 📝 Writing Tests

### Import Patterns

Use the configured aliases for clean imports:

```typescript
// ✅ Good - Use aliases
import { MyService } from "$lib/services/MyService";
import { MyComponent } from "$components/MyComponent.svelte";

// ❌ Avoid - Relative paths
import { MyService } from "../../../src/lib/services/MyService";
```

### Test File Naming

- Unit tests: `ComponentName.test.ts`
- Integration tests: `feature-integration.test.ts`
- Debug tests: `debug-scenario.test.ts`
- E2E tests: `workflow-name.spec.ts`

## 🧹 Maintenance & Cleanup History

### Recent Cleanup (2025-01-XX)

Removed zero-value tests that provided no automated testing benefit:

**Deleted:**

- `tests/debug/` - Debug scripts (not automated tests)
- `tests/manual/` - Manual test scripts (not in test suite)
- Standalone test files (cap-minimal-test.mjs, test-cap-simple.ts, etc.)
- Investigation E2E tests (investigate-types456-layout.spec.ts, navigation-layout-debug.spec.ts)

**Impact:**

- Removed 8-10 files
- Zero loss of test coverage
- Cleaner, more maintainable test suite
- All 309 tests still passing ✅

### Test Structure Benefits

This test structure provides:

- **Browseability**: Easy to find relevant tests
- **Maintainability**: Clear separation of concerns
- **Performance**: Fast test execution (~11 seconds for 309 tests)
- **CI/CD**: Better pipeline organization
- **Quality**: High-value tests focused on critical business logic

## 🔍 Migration Notes

Tests were moved from these locations:

- `src/tests/` → `tests/unit/`, `tests/integration/`
- Component `__tests__/` directories → `tests/unit/components/`
- Service `__tests__/` directories → `tests/unit/services/`
- Root-level test files → Appropriate category directories
- `src/lib/test/setup.ts` → `tests/setup/vitest-setup.ts`

All import paths have been updated to use `$lib` and `$app` aliases for consistency.

## 📊 Test Value Analysis

For detailed analysis of test value and recommendations, see:

- **TEST_SUITE_VALUE_ANALYSIS.md** - Comprehensive analysis of all tests
- **TEST_SUITE_QUICK_REFERENCE.md** - Quick reference tables and rankings
- **MEDIUM_VALUE_TESTS_REVIEW.md** - Review of medium-value tests
