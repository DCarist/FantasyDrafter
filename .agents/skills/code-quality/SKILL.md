---
name: code-quality
description: >-
  Standards, runbook, and procedures for running, fixing, and verifying code quality tools
  (Biome for JS/HTML/CSS, Ruff and Ty for Python) in FantasyDrafter prior to any commits.
---

# Code Quality Skill for FantasyDrafter

This skill defines the quality enforcement procedures for **FantasyDrafter**. Whenever you write, modify, or refactor code in this project, follow this runbook to ensure code adheres to all linting, formatting, and typing standards.

---

## 1. Golden Rules

1. **Zero Errors Prior to Commit:**
   - Prior to committing any code, all quality tools must pass with 0 errors (`100% clean`).
   - Never commit code that breaks tests or produces lint/type errors.

2. **Always Use Standard Commands:**
   - Avoid ad-hoc command variants to prevent user permission fatigue.
   - Use the designated npm scripts or `scripts/check-quality.mjs`.

---

## 2. Tool Overview & Fixed Commands

| Target Languages | Tool | Primary Command | Fix Command |
| :--- | :--- | :--- | :--- |
| **JS, HTML, CSS** | Biome | `npm run check:biome` | `npm run format:biome` |
| **Python** | Ruff (Lint) | `npm run check:ruff` | `npm run format:ruff:fix` |
| **Python** | Ruff (Format) | `npm run format:ruff` | `npm run format:ruff:fix` |
| **Python** | Ty (Type Check) | `npm run check:ty` | N/A |
| **Python All** | Ruff + Ty | `npm run check:py` | `npm run format:ruff:fix` |
| **All Code + Tests** | All Tools | `npm run check` | `npm run check -- --fix` |

---

## 3. Step-by-Step Quality Workflow

### Step 1: Incremental Verification During Development
As you edit files:
- **If modifying JavaScript, HTML, or CSS:**
  Run `npm run check:biome` to inspect lint and formatting diagnostics.
- **If modifying Python:**
  Run `npm run check:py` to verify Ruff linting, formatting, and Ty typing.

### Step 2: Auto-Fixing
When formatting or simple autofixable lints are detected:
- Run `npm run format:biome` for web assets.
- Run `npm run format:ruff:fix` for Python files.
- Or run `npm run check -- --fix` for repository-wide autofixing.

### Step 3: Resolving Complex Diagnostics
- **Biome Accessibility (`useButtonType`):** Always specify explicit `type="button"` on non-submit `<button>` tags.
- **Biome Form Controls (`noLabelWithoutControl`):** Ensure `<label>` elements enclose or reference an `<input>`, `<select>`, or `<textarea>`. Use `<span>` or `<div>` for non-control display tags.
- **Ruff Exception Handling:** Avoid unhandled blind catches where possible; use specific exception classes.
- **Ty Typing:** Explicitly type dictionaries or cast variables when passing to typed standard library functions like `urllib.request.Request`.

### Step 4: Pre-Commit Gate
Before committing or marking a task complete, run the full quality check:
```powershell
npm run check
```
Verify that all tools (Biome, Ruff Format, Ruff Lint, Ty, and Test Runner) report `[PASS]` with exit code `0`.

