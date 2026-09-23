---
name: feature-testing
description: >-
  Standards and patterns for deterministic, behavior-focused automated tests when implementing
  features, draft calculations, UI state changes, or data pipelines in FantasyDrafter.
---

# Feature Testing Skill for FantasyDrafter

Use this runbook when adding or updating tests for features, scoring models, UI transitions, or data pipelines. Keep related coverage together and verify behavior through the same entry points consumers use.

---

## 1. Core Principles & Golden Rules

1. **Extend the Closest Suite:**
   * Modify or extend an existing `tests/<feature>.test.mjs` when it already covers the behavior. Move related regressions into that suite rather than creating a one-case module.
   * Create a new `tests/<feature>.test.mjs` only for a distinct feature area with a cohesive set of contracts. Remove obsolete suites after migrating their meaningful assertions; keep `test-draft-logic.mjs` as the baseline.
   * Test files matching `tests/*.test.mjs` are automatically discovered by `test-runner.mjs`.

2. **Test Observable Behavior:**
   * Assert results, rendered UI, state transitions, persisted values, requests, errors, and boundaries through real production APIs. Do not assert source text, internal names, incidental wording, arbitrary nonempty results, or copied test-side implementations.
   * Each assertion must fail for a plausible regression. Keep distinct contract coverage when refactoring; delete tautological or implementation-pinning checks rather than rewording them.

3. **Make Tests Deterministic and Isolated:**
   * Use fixed fixtures and mocked external transports instead of live APIs, current data, or timing assumptions. Preserve success and failure paths that consumers observe.
   * Use unique temporary files/databases for mutable fixtures and clean up with `finally`. Suites must pass when run concurrently or repeatedly.
   * Tests run directly in Node.js ESM without an external test framework; use the shared `tests/test-helper.mjs` assertions.

---

## 2. Test Helper Utilities

Import testing primitives from [`tests/test-helper.mjs`](file:///d:/Programming/FantasyDrafter/tests/test-helper.mjs):

```javascript
import { eq, assert, assertThrows, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';
```

### Available Helper Functions:
* `eq(actual, expected, label)`: Deep equality, including cross-realm cloneable values, with descriptive failure logging.
* `assert(condition, label)`: Truthy boolean check.
* `assertThrows(fn, label)`: Asserts that executing `fn()` throws an error.
* `printSuiteHeader(suiteName)`: Prints a formatted banner for test output.
* `finishSuite(suiteName)`: Evaluates failures, prints completion status, and returns a boolean (`true` if passed, `false` if failed).

---

## 3. Step-by-Step TDD Workflow for New Features

When implementing a new feature in this repository:

### Step 1: Extend a Related Suite or Create a New One
Add the contract to the existing feature suite when possible. Otherwise create `tests/<feature>.test.mjs` using this template:
```javascript
// Test suite for <Feature Name>
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('<Feature Name>');

// --- Test Cases ---
// 1. Happy path
eq(L.myNewFunction('input'), 'expected', 'myNewFunction handles standard input');

// 2. Edge cases (null, boundaries, empty arrays)
eq(L.myNewFunction(null), null, 'myNewFunction handles null gracefully');

const success = finishSuite('<Feature Name>');
if (!success) {
  process.exit(1);
}
```

### Step 2: Implement the Feature Logic
* Add pure functions / calculations to [`draft-logic.js`](file:///d:/Programming/FantasyDrafter/draft-logic.js) and export them in `module.exports`.
* Integrate into [`draft-board.html`](file:///d:/Programming/FantasyDrafter/draft-board.html) or relevant scripts.

### Step 3: Run the Test Runner
Execute the full test suite from the terminal:

```powershell
npm test
# or: node test-runner.mjs
```

### Step 4: Verify All Suites Pass
Ensure the baseline suite (`test-draft-logic.mjs`) and every affected feature suite pass before committing.

### Step 5: Verify Code Quality Checks Pass 100%
Prior to committing any code, run the code quality checks for your modified code types and ensure 100% compliance:

```powershell
# For JS, HTML, or CSS changes:
npm run check:biome

# For Python changes:
npm run check:py

# Full pre-commit check (all tools + tests):
npm run check
```
If formatting adjustments are needed, run `npm run format:biome` or `npm run format:ruff:fix`.

---

## 4. Testing Specific Feature Areas

### A. Draft Math & Pick Reversals
* Always test both `3rr` (3rd-Round Reversal) and `snake` modes across varying league sizes (8, 10, 12, 14, 16).
* Verify bi-directional consistency: `L.slotForOverall(L.overallPick(r, s, teams, mode), teams, mode)` must return `{ round: r, slot: s }`.
* Verify pick uniqueness: simulate all picks for all slots and assert zero duplicate pick numbers and zero missing picks.

### B. Scoring Models & Ranking Blends
* Test power curve bounds: Rank 1 should score 100, Rank $N$ should score $> 0$, missing ranks should return `null`.
* Test blend slider weights: `blend = 0.0` (pure redraft), `blend = 1.0` (pure dynasty), `blend = 0.5` (equal weighting).
* Test TE Premium multiplier (1.08x boost for TE position).

### C. Data Integrity & Schema Validation
* If modifying `update-rankings.py` or `merge-data.py`, write tests in `tests/data-integrity.test.mjs` verifying:
  - Required player fields: `name`, `pos`, `team`, `bye`, `rookie`.
  - Ranking bounds and validity.
  - Team bye map coverage (32 NFL teams).

