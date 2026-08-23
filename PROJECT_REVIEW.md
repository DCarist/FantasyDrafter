# Fantasy Drafter — Codebase Review & Functionality Report

**Date:** August 22, 2026  
**Project:** Ken's Draft Board (Superflex Dynasty Fantasy Football Drafter)  
**Repository:** `d:\Programming\FantasyDrafter`  
**Git Branch:** `main` (clean working tree)  

---

## 1. Executive Summary

**Fantasy Drafter** is a high-performance, zero-dependency, browser-based draft board and decision-support assistant designed for live fantasy football drafts. It is specifically tailored for **Superflex Dynasty** and **Redraft** leagues employing **3rd-Round Reversal (3RR)** or standard snake draft orders.

The application operates completely offline with static files, persisting draft state to browser `localStorage`, and provides real-time value scoring (blending dynasty and redraft rankings with non-linear valuation curves), a 3-column dashboard layout (permanent user roster on left, player rankings in center, live on-the-clock / opponent inspector & draft log on right), custom league configuration, and an automated live consensus rankings pipeline.

---

## 2. Architecture & File Structure

The codebase is organized into modular layers: **Pure Logic Layer**, **Modular Testing Infrastructure**, **User Interface Layer**, and **Automated Data Pipelines**.

```
FantasyDrafter/
├── draft-board.html            # 3-column interactive UI (HTML5, CSS3, Vanilla JS)
├── draft-logic.js              # Pure math, scoring models, team resolution, pick logic (UMD)
├── players-data.js             # Active dataset (720+ NFL players, schedules, blurbs, ADP)
├── players-data.json           # JSON export of rankings dataset
├── update-rankings.py          # Live consensus rankings fetcher & ETL pipeline
├── merge-data.py               # Local dataset merger (offline pipeline)
├── patch-extras.py             # Schedules and news blurbs ingestion
├── test-runner.mjs             # Automated multi-suite test runner
├── test-draft-logic.mjs        # Baseline unit tests (preserved)
├── package.json                # NPM configuration and workflow scripts
├── .gitignore                  # Git ignore rules for OS, cache, and log files
├── .claude/
│   └── launch.json             # Dev server configuration (Python HTTP server)
├── .agents/
│   └── skills/
│       └── feature-testing/
│           └── SKILL.md        # Feature testing standards and runbook
└── tests/
    ├── test-helper.mjs         # Shared test assertions and suite utilities
    ├── league-setup.test.mjs   # Multi-team 3RR draft simulation test suite
    ├── data-integrity.test.mjs # Player data schema validation test suite
    └── unlisted-picks.test.mjs # Custom unlisted picks and roster tracking test suite
```

### File Details & Responsibilities

| File | Language | Purpose & Functionality |
| :--- | :--- | :--- |
| **`draft-board.html`** | HTML / CSS / JS | Main draft interface featuring a **3-column layout**: permanent user roster on left, ranking board in center, on-the-clock team inspector and draft log on right. Includes League Setup modal (teams 2–24, custom team names, slot reordering), unlisted pick modal, and player profile popups. |
| **`draft-logic.js`** | JavaScript (UMD) | Pure mathematical and algorithmic functions without DOM dependencies: `overallPick`, `slotForOverall`, `picksForSlot`, `roundIsForward`, `normalizeName`, `compositeScore`, `rankToScore`, `defaultTeams`, `teamForOverall`, and `resolvePickPlayer`. |
| **`update-rankings.py`** | Python 3 | Automated ETL fetcher that pulls live consensus data across Dynasty SF, Dynasty 1QB, Redraft, Best-Ball ADP, and Rookies, compiling 720+ active players into `players-data.js`. |
| **`test-runner.mjs`** | Node.js (ESM) | Discovers and executes all test suites (`test-draft-logic.mjs` and all `tests/*.test.mjs`), reporting comprehensive failure and pass metrics. |
| **`tests/league-setup.test.mjs`** | Node.js (ESM) | Validates 8-, 10-, 12-, 14-, and 16-team 3RR draft simulations, pick allocations, slot reversibility, and team name resolution. |
| **`tests/data-integrity.test.mjs`** | Node.js (ESM) | Validates `players-data.js` schema integrity, positions, NFL team codes, bye weeks (1–18), and rank metrics. |
| **`tests/unlisted-picks.test.mjs`** | Node.js (ESM) | Tests custom player pick recording, position selection, NFL team attribution, custom bye weeks, and live team roster counters. |
| **`test-draft-logic.mjs`** | Node.js (ESM) | Baseline unit tests verifying 3RR direction, slot-to-pick inversion, name normalization, and non-linear score curves. |
| **`players-data.js`** | JavaScript | Data container (`window.DRAFT_DATA`) holding 720+ active NFL players with multi-format rankings, age, bye weeks, and schedules. |
| **`package.json`** | JSON | Standard project metadata and run scripts (`npm test`, `npm run test:baseline`, `npm run update`, `npm start`). |

---

## 3. Current Feature Set & Capabilities

### 3.1 3-Column Dashboard Layout
- **Left Panel — "⭐ My Roster" (Always Visible):**
  - Displays our team's roster, slot position, and total pick count.
  - Lists all drafted players with position badges, player names, NFL team codes, and bye weeks.
  - Live positional needs counter (`QB 1/2+`, `RB 2/4+`, `WR 3/5+`, `TE 1/1+`).
  - Starter requirements guide (`QB · 2RB · 2WR · TE · 3FLEX · SF`).
  - Bye-week clash warning alerts.
- **Center Panel — "Player Pool & Draft Rankings":**
  - Real-time search, position tabs (`ALL`, `QB`, `RB`, `WR`, `TE`, `ROOKIE`), sorting (`score`, `dyn`, `red`, `adp`), and "Hide taken" toggle.
  - Dynamic draft buttons: displays **"Select our Player"** (green highlight) when user is on the clock, and **"Pick Player"** when an opponent is drafting.
  - Non-linear composite scores, tier breaks (`T1`, `T2`, etc.), and ADP value indicators (`▼X vs ADP`).
- **Right Panel — "🕒 On The Clock / League Inspector & Draft Log":**
  - **Auto-Following On-The-Clock Inspector:** Displays the live roster and positional breakdown of whichever team is currently picking.
  - **Full League Inspector:** Dropdown allows inspecting any team's roster and position count across the league at any time.
  - **"Follow Clock" Quick Switch:** Instant button to resume auto-following the on-the-clock team.
  - **Draft Log:** Reverse chronological history showing pick number, round.slot, drafting team, player name, position, and NFL team.

### 3.2 Dynamic League Setup & Custom Teams
- Accessible via the **⚙️ League Setup** header button:
  - Custom League / Board Name with real-time branding updates.
  - Team count selector (2 to 24 teams) and round count selector (1 to 40 rounds).
  - Draft order toggle: **3rd-Round Reversal (3RR)** or **Normal Snake**.
  - Interactive team manager: customize all team names, designate user slot, and reorder draft slots using `▲` / `▼` buttons.

### 3.3 Unlisted Pick & Custom Player Engine
- Supports drafting sleepers or deep rookies not in the default rankings:
  - Click `Unlisted pick for [Team Name] ➜` in the sidebar.
  - **Quick Position Selector:** One-click assignment for `QB`, `RB`, `WR`, `TE`, `K`, `DST`, `OTHER`.
  - **Custom Player Name (Optional):** Enter name or leave blank for automatic fallback (e.g. `Unlisted WR`).
  - **NFL Team & Bye Week (Optional):** Assign NFL team and bye week (1–18) for clash tracking.
  - Fully integrates into that team's roster, positional needs counters, and draft history log.

### 3.4 Live Consensus Rankings Pipeline
- Run `python update-rankings.py` (or `npm run update`) to pull live daily consensus data:
  - Dynasty Superflex & 1QB rankings from DynastyProcess / FantasyPros.
  - Redraft consensus and Best-Ball ADP.
  - 2026 Rookie rankings and NFL regular season schedules.
  - Outputs 720+ active players into `players-data.js` and `players-data.json`.

---

## 4. Testing Infrastructure

The project includes an automated test runner following the **feature-testing** skill guidelines:

```powershell
npm test
```

### Test Suite Summary

| Test Suite | File | Tests / Assertions | Status |
| :--- | :--- | :--- | :--- |
| **Baseline Draft Logic** | `test-draft-logic.mjs` | 23 assertions | ✅ Passing |
| **Data Integrity** | `tests/data-integrity.test.mjs` | 721 player records validated | ✅ Passing |
| **League Setup & 3RR** | `tests/league-setup.test.mjs` | 8/10/12/14/16-team simulations | ✅ Passing |
| **Unlisted Picks & Roster Tracking** | `tests/unlisted-picks.test.mjs` | Custom resolution & team counts | ✅ Passing |

**Total:** 4 suites passing (0 failures).

---

## 5. Development & Execution Quickstart

### 1. Run Unit Tests
```powershell
npm test
```

### 2. Update to Latest Live Rankings
```powershell
npm run update
```

### 3. Launch Local Web Server
```powershell
npm start
```
Then open [http://127.0.0.1:8517/draft-board.html](http://127.0.0.1:8517/draft-board.html) in any web browser.

---

## 6. Recommended Future Enhancements

1. **Draft State Export / Import (JSON / CSV):**
   - Provide export/import buttons to save and restore drafts across different browsers or devices.
2. **Draft Pick Trading:**
   - Allow trading future picks between slots (e.g. Slot 1 trades Pick 2.11 to Slot 6 for Pick 3.06).
3. **Queue / Target Shortlist:**
   - Add a "Queue" tab so the user can star/flag top targets for upcoming rounds.
