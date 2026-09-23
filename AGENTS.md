# Agent Guidelines & Quality Rules for FantasyDrafter

This repository enforces strict code quality and testing standards. All agents working on FantasyDrafter must follow these guidelines.

---

## 1. Zero-Defect Code Quality Standards

Prior to committing any code, **100% of relevant code quality checks and automated tests must pass**.
Never commit code with failing tests, lint errors, syntax issues, or unresolved type diagnostics.

---

## 2. Standard Tool Commands (Use Fixed Commands Only)

To prevent command-line variation and permission prompt fatigue, **always use the established npm scripts or standard runner script**. Do not invoke ad-hoc CLI variants.

### Unified Quality Runner
Runs all quality tools across all languages and executes the test suite:
- **Run all checks**: `npm run check` (or `node scripts/check-quality.mjs`)
- **Auto-fix formatting & safe lints**: `npm run check -- --fix` (or `node scripts/check-quality.mjs --fix`)
- **PowerShell equivalent**: `.\scripts\check-quality.ps1` (or `.\scripts\check-quality.ps1 -Fix`)

### Language-Specific Checks
During development, invoke the relevant tool incrementally:

#### JavaScript, HTML, & CSS (Biome)
- Check format & lint: `npm run check:biome`
- Check lint rules only: `npm run lint:biome`
- Auto-format: `npm run format:biome`

#### Python (Ruff & Ty via uv)
- Run all Python checks (Ruff + Ty): `npm run check:py`
- Ruff lint check: `npm run check:ruff`
- Ruff format check: `npm run format:ruff`
- Ruff auto-format: `npm run format:ruff:fix`
- Ty type check: `npm run check:ty`

#### Automated Tests
- Full test suite: `npm test` (or `node test-runner.mjs`)
- Extend an existing feature suite when it covers the behavior; create a new suite only for a distinct feature area. Preserve meaningful coverage when consolidating suites.

---

## 3. Mandatory Development Workflow

When implementing any feature, bug fix, or refactor:

1. **Develop incrementally**: Add deterministic, behavior-focused assertions to the relevant existing suite (or `tests/<feature>.test.mjs` for a distinct feature), following the `feature-testing` skill.
2. **Run Domain Quality Checks**:
   - If editing JS/HTML/CSS: run `npm run check:biome`.
   - If editing Python: run `npm run check:py`.
3. **Auto-Fix Formatting**: If styling or layout issues arise, run `npm run format:biome` or `npm run format:ruff:fix`.
4. **Pre-Commit Verification**: Run the consolidated check before declaring completion or committing:
   ```bash
   npm run check
   ```
   Ensure all checks report `[PASS]` with exit code `0`.

