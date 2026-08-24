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
├── draft-board.html            # 3-column interactive UI + Live Sync & Web Audio Chime
├── draft-logic.js              # Pure math, scoring models, pick logic, and remote sync reconciliation
├── sync-bookmarklet.js         # 1-Click ESPN Draft Room live sync observer script
├── DRAFT_SYNC_API_OVERVIEW.md  # Live draft synchronization architecture & API reference
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
    ├── unlisted-picks.test.mjs # Custom unlisted picks and roster tracking test suite
    ├── roster-slots.test.mjs   # Starter slots and bench allocation test suite
    ├── watchlist.test.mjs      # Draft watchlist management test suite
    ├── bye-conflicts.test.mjs  # Bye clash detection test suite
    ├── league-formats.test.mjs # 1QB vs Superflex and scoring format test suite
    └── live-sync.test.mjs      # Live draft synchronization and player resolution test suite
```

### File Details & Responsibilities

| File | Language | Purpose & Functionality |
| :--- | :--- | :--- |
| **`draft-board.html`** | HTML / CSS / JS | Main draft interface featuring a **3-column layout**: permanent user roster on left, ranking board in center, on-the-clock team inspector and draft log on right. Includes Live Sync modal (Sleeper polling, ESPN bookmarklet, cross-tab BroadcastChannel), League Setup modal, unlisted pick modal, Web Audio API chimes, and glowing clock pulse cues. |
| **`draft-logic.js`** | JavaScript (UMD) | Pure mathematical, scoring, and sync algorithms: `overallPick`, `slotForOverall`, `picksForSlot`, `roundIsForward`, `normalizeName`, `compositeScore`, `rankToScore`, `defaultTeams`, `teamForOverall`, `resolvePickPlayer`, `assignRosterSlots`, `parseSleeperDraft`, `resolveRemotePick`, and `reconcileDraftLog`. |
| **`sync-bookmarklet.js`** | JavaScript | Standalone 1-Click DOM observer script that broadcasts picks from ESPN Live Draft Rooms to Fantasy Drafter across browser tabs. |
| **`DRAFT_SYNC_API_OVERVIEW.md`** | Markdown | Technical specification covering Sleeper REST API polling and ESPN BroadcastChannel synchronization. |
| **`update-rankings.py`** | Python 3 | Automated ETL fetcher that pulls live consensus data across Dynasty SF, Dynasty 1QB, Redraft, Best-Ball ADP, and Rookies, compiling 720+ active players into `players-data.js`. |
| **`test-runner.mjs`** | Node.js (ESM) | Discovers and executes all test suites (`test-draft-logic.mjs` and all `tests/*.test.mjs`), reporting comprehensive failure and pass metrics. |
| **`tests/live-sync.test.mjs`** | Node.js (ESM) | Validates Sleeper draft/user parsing, 3RR reversal detection, remote player matching, suffix handling, defenses, unlisted fallbacks, and log reconciliation. |

---

## 3. Current Feature Set & Capabilities

### 3.1 Live Draft Synchronization & Audio/Visual Cues
- **⚡ Live Sync Hub (`#syncModal` & Header Pill):**
  - **Sleeper API Mode:** In-browser 2s polling of `/picks` and one-click import of league name, team count, draft order, team names, user slot, and 3RR mode.
  - **ESPN 1-Click Sync Mode:** Draggable bookmarklet and cross-tab `BroadcastChannel` receiver for instant sub-second pick synchronization from ESPN draft rooms.
  - **Reconciliation & Rollback Engine:** Automatically syncs additions and handles commissioner pick resets cleanly.
  - **Full Manual Mode Preservation:** Manual drafting, undo, reset, and setup work seamlessly whether sync is offline, paused, or active.
- **🔔 Audio & Visual Turn Cues:**
  - **Web Audio Chime:** Synthesizes an offline ascending major triad chime whenever the user's team goes on the clock.
  - **Clock Pulse Glow:** Header clock pulses with an animated green glowing border during your turn.

### 3.2 3-Column Dashboard Layout
- **Left Panel — "⭐ My Roster" (Always Visible):**
  - Displays our team's roster, slot position, and total pick count.
  - Interactive Watchlist with instant ⭐ toggling, filtering, and auto-cleanup.
  - Live positional needs counters and starter requirements guide (`QB · 2RB · 2WR · TE · 3FLEX · SF`).
  - Bye-week clash warning alerts.
- **Center Panel — "Player Pool & Draft Rankings":**
  - Real-time search, position tabs (`ALL`, `QB`, `RB`, `WR`, `TE`, `ROOKIE`, `DST`, `WATCHLIST`), multi-format sorting (`score`, `dyn`, `red`, `rookie`, `adp`), and "Hide taken" toggle.
  - Dynamic draft buttons: displays **"Select our Player"** (green highlight) when user is on the clock, and **"Pick Player"** when an opponent is drafting.
  - Non-linear composite scores, tier breaks (`T1`, `T2`, etc.), and ADP value indicators (`▼X vs ADP`).
- **Right Panel — "🕒 On The Clock / League Inspector & Draft Log":**
  - **Auto-Following On-The-Clock Inspector:** Displays the live roster and positional breakdown of whichever team is currently picking.
  - **Full League Inspector:** Dropdown allows inspecting any team's roster and position count across the league at any time.
  - **Draft Log:** Reverse chronological history showing pick number, round.slot, drafting team, player name, position, and NFL team.

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
| **Starter Slots & Lineup Allocation** | `tests/roster-slots.test.mjs` | Roster filling, flex, and bench | ✅ Passing |
| **Watchlist Management** | `tests/watchlist.test.mjs` | Star toggle, cleanup, persistence | ✅ Passing |
| **Bye-Week Clash Detection** | `tests/bye-conflicts.test.mjs` | Positional and cross-position clashes | ✅ Passing |
| **League Formats & Scoring** | `tests/league-formats.test.mjs` | 1QB vs Superflex, PPR/Half/Std | ✅ Passing |
| **Live Draft Synchronization** | `tests/live-sync.test.mjs` | Sleeper/ESPN parsing, resolution, rollbacks | ✅ Passing |

**Total:** 9 suites passing (0 failures).

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
