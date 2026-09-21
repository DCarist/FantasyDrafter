---
name: git-commit-workflow
description: >-
  Standard procedure and style guidelines for creating clean, verified git commits
  upon completion or acceptance of a feature, bug fix, or documentation update in FantasyDrafter.
---

# Git Commit Workflow & Style Guidelines

This skill defines the standard procedure for committing code changes in **FantasyDrafter** following feature acceptance, bug fixes, or refactoring.

---

## 1. Pre-Commit Quality Checklist

Before running any git commit commands:

1. **Verify Automated Tests:**
   * Run the full test runner to ensure 100% test pass rate:
     ```powershell
     node test-runner.mjs
     # or: npm test
     ```
   * Never commit code if any unit test or schema integrity check is failing.

2. **Inspect Working Tree & Git Status:**
   * Run `git status` to inspect all staged, unstaged, and untracked files.
   * Verify that temporary downloads, local CSV snapshots in `data/`, scratch scripts, and editor files are properly ignored.

3. **Stage Intentional Files Explicitly:**
   * Prefer staging explicit files over blind `git add .`:
     ```powershell
     git add draft-board.html draft-logic.js tests/my-feature.test.mjs
     ```

---

## 2. Commit Message Guidelines & Style

FantasyDrafter uses concise, descriptive commit messages matching standard conventional types:

### A. Format & Types:
* `feat: <description>` — New features, UI panels, draft calculations, or ranking tools.
  * *Example:* `feat: add permanent left roster panel and live on-clock team inspector`
  * *Example:* `feat: enhance unlisted picks with position selector, custom name, and team roster tracking`
  * *Example:* `feat: add automated rankings updater script and live consensus sync`
* `fix: <description>` — Bug fixes, layout corrections, calculation repairs.
  * *Example:* `fix: restore opening script tag in draft-board.html`
  * *Example:* `fix: correct 3RR pick calculation for round 3 reversal boundary`
* `docs: <description>` — Documentation updates, review files, walk-throughs.
  * *Example:* `docs: update PROJECT_REVIEW.md with full feature set, test metrics, and architecture`
* `chore: <description>` — Test runner setup, dependency sync, workspace configuration.
  * *Example:* `chore: sync test suite and workspace files`
  * *Example:* `chore: clean working tree and sync test configurations`

### B. Message Rules:
* **Concise & Specific:** State clearly what changed and why (e.g. mention specific components, models, or views).
* **Multi-item Commits:** Separate multiple related updates with commas or short sentences.
* **Imperative / Active Mood:** e.g., `feat: add ...`, `fix: correct ...`, `docs: update ...`.

---

## 3. Step-by-Step Execution Workflow

When committing after user acceptance:

```powershell
# Step 1: Run and verify all test suites
node test-runner.mjs

# Step 2: Check status and untracked files
git status

# Step 3: Stage intended files
git add <files>

# Step 4: Create commit
git commit -m "<type>: <concise description of changes>"

# Step 5: Verify commit recorded cleanly
git log -1 --oneline
```

