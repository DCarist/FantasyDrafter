---
name: feature-testing
description: >-
  Standards, runbook, and patterns for adding automated tests when implementing new features,
  draft calculations, UI state changes, or data pipelines in FantasyDrafter without modifying existing tests.
---

# Feature Testing Skill for FantasyDrafter

This skill defines the testing standards and procedures for extending **FantasyDrafter**. Whenever you add new features, scoring models, UI state transitions, or data pipeline tools to this project, follow this runbook to ensure comprehensive test coverage while strictly preserving existing test suites.

---

## 1. Core Principles & Golden Rules

1. **Preserve Existing Tests:**
   * **Do NOT modify or remove existing test suites** (such as [`test-draft-logic.mjs`](file:///d:/Programming/FantasyDrafter/test-draft-logic.mjs)) unless explicitly instructed by the user.
   * New functionality must be tested in dedicated test files inside the `tests/` directory.

2. **Modular Test Architecture:**
   * Place all new test suites in `tests/<feature-name>.test.mjs`.
   * Test files matching `tests/*.test.mjs` are automatically discovered and executed by [`test-runner.mjs`](file:///d:/Programming/FantasyDrafter/test-runner.mjs).

3. **Zero External Test Dependencies:**
   * Tests run directly in Node.js ESM format without requiring bulky test runners (like Jest/Mocha).
   * Use the shared helper functions in [`tests/test-helper.mjs`](file:///d:/Programming/FantasyDrafter/tests/test-helper.mjs).

---

## 2. Test Helper Utilities

Import testing primitives from [`tests/test-helper.mjs`](file:///d:/Programming/FantasyDrafter/tests/test-helper.mjs):

```javascript
import { eq, assert, assertThrows, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';
```

### Available Helper Functions:
* `eq(actual, expected, label)`: Deep JSON equality comparison with descriptive error logging.
* `assert(condition, label)`: Truthy boolean check.
* `assertThrows(fn, label)`: Asserts that executing `fn()` throws an error.
* `printSuiteHeader(suiteName)`: Prints a formatted banner for test output.
* `finishSuite(suiteName)`: Evaluates failures, prints completion status, and returns a boolean (`true` if passed, `false` if failed).

---

## 3. Step-by-Step TDD Workflow for New Features

When implementing a new feature in this repository:

### Step 1: Create a New Test Suite
Create a new file in `tests/<feature>.test.mjs` using the template below:

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
Ensure both the legacy baseline suite (`test-draft-logic.mjs`) and your new test suite (`tests/<feature>.test.mjs`) pass with 0 failures before committing.

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
