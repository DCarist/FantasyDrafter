# Fantasy Drafter — Codebase Review & Functionality Report

**Date:** August 22, 2026  
**Project:** Ken's Draft Board (Superflex Dynasty Fantasy Football Drafter)  
**Location:** `d:\Programming\FantasyDrafter`  

---

## 1. Executive Summary

**Fantasy Drafter** is a lightweight, zero-dependency, browser-based draft board and decision-support assistant designed for live fantasy football drafts. It is specifically tailored for **Superflex Dynasty** leagues employing **3rd-Round Reversal (3RR)** or standard snake draft orders.

The application operates completely offline with static files, persisting draft progress to browser `localStorage`, and provides real-time value scoring (blending dynasty and redraft rankings with non-linear valuation curves), positional need tracking, bye-week clash warnings, player news blurbs, and full 18-week team schedules.

---

## 2. Architecture & File Overview

The codebase is organized into four distinct layers: **Data Layer**, **Pure Logic Layer**, **User Interface**, and **ETL/Data Pipeline**.

```
FantasyDrafter/
├── draft-board.html       # Single-page interactive UI (HTML5, CSS3, Vanilla JS)
├── draft-logic.js         # Core draft math, scoring models, name normalization (UMD)
├── test-draft-logic.mjs   # Unit test suite for pick math and scoring (Node.js)
├── players-data.js        # Bundled data (~330+ players, schedules, bye weeks)
├── merge-data.py          # Python ETL: Ingests raw ranking datasets into players-data.js
├── patch-extras.py        # Python ETL: Ingests schedules and news blurbs
└── .claude/
    └── launch.json        # Dev server runner configuration (Python HTTP server)
```

### Component Details

| File | Size / LOC | Language | Purpose & Functionality |
| :--- | :--- | :--- | :--- |
| **`draft-board.html`** | ~25 KB (455 lines) | HTML / CSS / JS | Main draft interface. Renders player table, search/filter bars, draft clock/turn tracker, "My Team" roster with positional counters and bye-week clash alerts, draft history log, and modal popups for player profiles, schedules, and search links. Uses `localStorage` (`kenDraftBoard-v1`) for state persistence. |
| **`draft-logic.js`** | ~3 KB (85 lines) | JavaScript | Pure mathematical and algorithmic functions without DOM dependencies: `overallPick`, `slotForOverall`, `picksForSlot`, `roundIsForward`, `normalizeName`, `compositeScore`, and `rankToScore`. Exported as a CommonJS module for testing and loaded via `<script>` in the browser. |
| **`test-draft-logic.mjs`** | ~3.5 KB (87 lines) | Node.js (ESM) | Unit test suite validating 3RR reversal mathematics against commissioner examples, round reversibility, 10- and 12-team slot mapping, name normalization, and non-linear score calculations. |
| **`players-data.js`** | ~85 KB (3,537 lines) | JavaScript | Data container defining `window.DRAFT_DATA`. Holds structured records for ~330+ players (name, position, NFL team, bye week, age, rookie flag, Dynasty Superflex rank, Dynasty 1QB rank, Redraft rank, ADP, news blurb), 32-team 18-week schedules, and source metadata. |
| **`merge-data.py`** | ~6.5 KB (173 lines) | Python 3 | Consolidates multiple ranking sources (Dynasty SF, Dynasty 1QB, Redraft consensus, ADP, Rookies, Byes) from raw JSON files, handles team code aliases (e.g., `JAC` &rarr; `JAX`, `OAK` &rarr; `LV`), resolves positional conflicts via majority vote, filters out K/DST, and outputs `players-data.js`. |
| **`patch-extras.py`** | ~2.8 KB (79 lines) | Python 3 | Enriches `players-data.js` with 18-week NFL regular season schedules for all 32 teams and per-player news summaries. Cross-validates team bye weeks against schedule gaps. |
| **`.claude/launch.json`** | 225 B (12 lines) | JSON | Configuration for local HTTP server execution on port 8517. |

---

## 3. Current Feature Set & Capabilities

### 3.1 3rd-Round Reversal (3RR) & Snake Draft Math
- **3RR Formula:** Standard snake drafts alternate direction every round (R1 forward, R2 reverse, R3 forward, etc.). 3RR intentionally reverses Round 3 (R1 forward, R2 reverse, R3 **reverse again**, R4 forward, R5 reverse...) to balance the high value of top-3 draft picks in Superflex formats.
- **Clock & On-the-Clock Detection:** Calculates the current round and pick (`fmtPick(overall, teams)` &rarr; `e.g. 1.02`), highlights when the user is on the clock, and displays a countdown to the user's upcoming 5 draft picks.

### 3.2 Dynamic Valuation Engine
- **Non-Linear Drop-off Model:** Computes player scores on a 0–100 scale using the power curve:
  $$\text{Score} = 100 \times \left(1 - \frac{\text{Rank} - 1}{\text{Depth}}\right)^{1.5}$$
  This models fantasy football reality: the gap between Rank 1 and Rank 10 is substantially greater than between Rank 150 and Rank 160.
- **Win-Now vs. Dynasty Blending:** Real-time slider (0% to 100%) dynamically weights redraft consensus vs. dynasty rankings.
- **Tight End Premium Support:** Optional toggle giving Tight Ends an automatic 8% score boost to reflect 1.5 PPR scoring.
- **Visual Tier Breaks:** Dynamically injects visual separator lines and tier markers (`T1`, `T2`, etc.) in the player table when score drops between consecutive players exceed 4.0 points.
- **Value vs. ADP Highlighting:** Flags players who have fallen $\ge 8$ spots past their consensus ADP with a green value tag (`▼X vs ADP`).

### 3.3 Roster Construction & Risk Mitigation
- **Positional Quotas:** Tracks drafted players against Superflex league starter minimums (`QB: 2`, `RB: 4`, `WR: 5`, `TE: 1`).
- **Bye Week Collision Detection:** Automatically scans the user's roster and generates a prominent warning box if two or more drafted starters share the same NFL bye week.
- **Draft Log & State Recovery:**
  - Full pick log recording both user picks and competitor picks.
  - "Pick made by someone — player not on my list" button to record unknown/unranked draft selections without breaking pick sequencing.
  - Undo pick, jump-to-pick, and draft reset capabilities.
  - All state automatically persists to `localStorage`.

### 3.4 Player Intelligence Modal
- Clicking any player name opens a detailed modal with:
  - Consensus ranks (Dyn SF, Dyn 1QB, Redraft, ADP, Age, Bye).
  - Baked-in news summary.
  - 18-week schedule matrix with bye weeks highlighted.
  - Quick outbound search links to Google News, ESPN, and FantasyPros.

---

## 4. Test Verification Results

The test suite in [`test-draft-logic.mjs`](file:///d:/Programming/FantasyDrafter/test-draft-logic.mjs) was executed via Node.js:

```
> node test-draft-logic.mjs

ok   slot 12 R1 = overall 12 (1.12)
ok   slot 12 R2 = overall 13 (2.01)
ok   slot 12 R3 = overall 25 (3.01)
ok   slot 1 R1 = overall 1 (1.01)
ok   slot 1 R2 = overall 24 (2.12)
ok   slot 1 R3 = overall 36 (3.12)
ok   Ken slot 2, 10 teams, first 8 rounds
ok   Ken slot 2, 12 teams, first 6 rounds
ok   slot 2 normal snake, 10 teams
ok   3RR direction: F, R, R, F, R, F, R
ok   slotForOverall inverts overallPick for every pick, 10 and 12 teams
ok   all overall picks 1..N*rounds assigned exactly once
ok   strips Jr.
ok   strips apostrophe + double space
ok   strips III
ok   rank 1 scores 100
ok   missing rank scores null
ok   TE premium boosts TEs
ok   missing redraft falls back to dynasty score

All tests passed
```

**Status:** 19/19 tests passed with 0 failures.

---

## 5. Local Environment Status & Findings

| Environment Tool | Installed Version | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Git** | 2.x | Available | Directory is currently not initialized as a git repository. |
| **Node.js** | v20.9.0 | Ready | Available on PATH; executes unit tests cleanly. |
| **Python** | 3.12.0 (`python`, `py`) | Ready | Available on PATH. |
| **Python3 alias** | N/A | Windows Redirect | On Windows, typing `python3` triggers the Windows Store App execution alias. Commands must use `python` or `py`. |

---

## 6. Recommended Next Steps

### Step 1: Initialize Git Repository
Establish version control for the project with a clean `.gitignore`:

```powershell
# 1. Create .gitignore (excluding OS files, caches, logs)
@"
# Byte-compiled / optimized files
__pycache__/
*.py[cod]
*$py.class

# Operating System Files
Thumbs.db
ehthumbs.db
Desktop.ini
.DS_Store

# Logs & temp files
*.log
"@ | Out-File -FilePath .gitignore -Encoding utf8

# 2. Initialize repository and create initial commit
git init -b main
git add .
git commit -m "feat: initial commit of fantasy draft board and logic"
```

---

### Step 2: Configure Local Execution for Windows
1. **Fix `launch.json`**: Update `"runtimeExecutable": "python3"` to `"python"` in [`.claude/launch.json`](file:///d:/Programming/FantasyDrafter/.claude/launch.json).
2. **Start Local Development Server**:
   ```powershell
   python -m http.server 8517 --bind 127.0.0.1
   ```
3. **Open in Browser**: Navigate to [http://127.0.0.1:8517/draft-board.html](http://127.0.0.1:8517/draft-board.html) (or open `draft-board.html` directly via file path).

---

### Step 3: Add `package.json` for Standardized Script Tooling
Adding a minimal `package.json` enables standard npm commands like `npm test` and `npm start`:

```json
{
  "name": "fantasy-drafter",
  "version": "1.0.0",
  "description": "Superflex dynasty fantasy football draft board",
  "main": "draft-logic.js",
  "type": "module",
  "scripts": {
    "test": "node test-draft-logic.mjs",
    "start": "python -m http.server 8517 --bind 127.0.0.1"
  },
  "author": "",
  "license": "MIT"
}
```

---

### Step 4: Suggested Feature & Quality-of-Life Enhancements

1. **Draft State Export / Import (JSON / CSV):**
   - Add a button to export the current draft log and team roster as a JSON file or copy to clipboard, allowing backups and sharing before clearing cache.
2. **Draft Pick Trading Support:**
   - In dynasty leagues, startup pick trading is common. Allow manual re-assignment of specific draft picks to different slots.
3. **Queue / Target List:**
   - Add a "Starred / Queue" tab so the user can flag players they want to target in upcoming rounds without constantly searching.
4. **Automated Data Fetcher:**
   - Currently, `merge-data.py` expects a pre-compiled JSON file. Providing a unified script to fetch live consensus rankings directly (e.g. from FantasyPros or Sleeper API) would streamline preseason data updates.

