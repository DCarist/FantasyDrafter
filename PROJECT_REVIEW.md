# Fantasy Drafter — Codebase Review & Functionality Report

**Date:** August 24, 2026  
**Project:** Ken's Draft Board (Superflex Dynasty Fantasy Football Drafter)  
**Repository:** `d:\Programming\FantasyDrafter`  
**Git Branch:** `dev` (clean working tree)  

---

## 1. Executive Summary

**Fantasy Drafter** is a high-performance, zero-dependency, browser-based draft board and decision-support assistant designed for live fantasy football drafts. It is specifically tailored for **Superflex Dynasty**, **1QB Dynasty**, and **Redraft** leagues (PPR, Half-PPR, Standard) employing **3rd-Round Reversal (3RR)** or standard snake draft orders.

The application operates completely offline with static files, persisting draft state to browser `localStorage`, and provides real-time value scoring (blending dynasty and redraft rankings with non-linear valuation curves), a 3-column dashboard layout (permanent user roster on left, player rankings in center, live on-the-clock / opponent inspector & draft log on right), custom league configuration, automated player data freshness validation (auto-refreshing consensus rankings on startup if >2 days old), real-time zero-poll Server-Sent Events (SSE) live synchronization with Sleeper and ESPN, and colorized terminal draft logging with Windows UTF-8 console support.

---

## 2. Architecture & File Structure

The codebase is organized into modular layers: **Pure Logic Layer**, **Modular Client-Side UI & State Layer**, **Testing Infrastructure**, **Automated Data Pipelines**, and **Local Live Relay Server**.

```
FantasyDrafter/
├── draft-board.html            # Lightweight semantic HTML skeleton (<125 lines)
├── draft-logic.js              # Pure math, pick trading, draft queue, scoring models, and sync reconciliation
├── DRAFT_SYNC_API_OVERVIEW.md  # Live draft synchronization architecture & API reference
├── players-data.js             # Active dataset (1,050+ NFL players, schedules, blurbs, multi-format ADP)
├── players-data.json           # JSON export of rankings dataset
├── server.py                   # Local HTTP relay server with auto browser launch, SSE stream & data age checks
├── start.bat                   # 1-Click Windows batch launcher (starts server and opens browser)
├── start.ps1                   # PowerShell launcher (starts server and opens browser)
├── update-rankings.py          # Live consensus rankings fetcher & ETL pipeline with offline file ingestion
├── merge-data.py               # Local dataset merger (offline pipeline)
├── patch-extras.py             # Schedules and news blurbs ingestion
├── test-runner.mjs             # Automated multi-suite test runner
├── test-draft-logic.mjs        # Baseline unit tests (strictly preserved)
├── package.json                # NPM configuration and workflow scripts
├── .gitignore                  # Git ignore rules for OS, cache, and log files
├── css/
│   └── draft-board.css         # Extracted modular stylesheet (color tokens, tables, modals, animations)
├── js/
│   ├── draft-audio.js          # Web Audio API turn chime synthesis
│   ├── draft-state.js          # Reactive state container, localStorage persistence, and pick actions
│   ├── draft-sync-client.js    # Sleeper REST polling, ESPN SSE listener & HTTP relay networking
│   ├── draft-ui.js             # DOM renderers, position tabs, roster views & interactive modals
│   └── app.js                  # Application initialization and global keyboard shortcut binding
├── data/
│   └── google_sheet_rankings_2026-08-23.csv # Offline rankings data snapshot
├── extensions/
│   └── espn-sync/
│       ├── manifest.json       # Chrome/Edge Manifest V3 extension configuration
│       └── content-script.js   # Real-time DOM observer relaying ESPN picks to Fantasy Drafter
├── .agents/
│   └── skills/
│       ├── csv-data-inspection/ # Standard procedure for inspecting remote tabular data
│       ├── feature-testing/    # Feature testing standards and runbook
│       └── git-commit-workflow/# Git commit standards and workflow
└── tests/
    ├── test-helper.mjs         # Shared test assertions and suite utilities
    ├── baseline-logic (in root)# test-draft-logic.mjs baseline pick math
    ├── bye-conflicts.test.mjs  # Bye clash detection and alignment test suite
    ├── data-integrity.test.mjs # Player data schema & defense canonicalization test suite
    ├── data-pipeline.test.mjs  # Data pipeline CLI, offline file ingestion & schema test suite
    ├── draft-queue.test.mjs    # Target queue ordering, deduplication & pick cleanup test suite
    ├── draft-serialization.test.mjs # V2 schema serialization, deserialization & legacy V1 migration test suite
    ├── league-formats.test.mjs # Multi-format rankings and scoring models test suite
    ├── league-setup.test.mjs   # Multi-team 3RR draft simulation test suite
    ├── live-sync.test.mjs      # Live draft synchronization and player resolution test suite
    ├── pick-trading.test.mjs   # Draft pick trading & dynamic ownership grid test suite
    ├── roster-slots.test.mjs   # Starter slots, bench allocation, and badge UI test suite
    ├── server-startup.test.mjs # 1-click startup, CLI flags, favicon, SSE & age check test suite
    ├── unlisted-picks.test.mjs # Custom unlisted picks and roster tracking test suite
    └── watchlist.test.mjs      # Draft watchlist management test suite
```

### File Details & Responsibilities

| File | Language | Purpose & Functionality |
| :--- | :--- | :--- |
| **`draft-board.html`** | HTML5 | Clean semantic skeleton (<125 lines) defining the 3-column layout and modal targets. Links external modular styles and scripts. |
| **`css/draft-board.css`** | CSS3 | Complete presentation layer: dark-mode tokens, responsive grids, tier breaks, position badges, pulse animations, and modal overlays. |
| **`js/draft-audio.js`** | JavaScript | Web Audio API synthesizer for offline ascending major triad turn chimes with automatic browser gesture unlocking. |
| **`js/draft-state.js`** | JavaScript | State normalization, local storage persistence, pick actions (`draftPlayer`, `undo`, `jumpTo`, `resetDraft`), player indexing, and unlisted draft resolution. |
| **`js/draft-sync-client.js`** | JavaScript | Real-time live synchronization networking: zero-poll SSE stream receiver, Sleeper REST API polling, BroadcastChannel fallback, and server pick logging. |
| **`js/draft-ui.js`** | JavaScript | DOM rendering engine: player pool table, my roster, inspect roster, draft log, watchlist panel, player detail modal, unlisted pick modal, and league setup dialog. |
| **`js/app.js`** | JavaScript | Entry point: controls binding, keyboard shortcuts (`Esc` modal close, `/` quick search, `Ctrl+Z` undo), and initialization sequence. |
| **`draft-logic.js`** | JavaScript (UMD) | Pure mathematical, scoring, trading, queue, and sync algorithms: `overallPick`, `slotForOverall`, `picksForSlot`, `generateDraftPicks`, `applyPickTrade`, `getPicksForTeam`, `isQueued`, `addToQueue`, `removeFromQueue`, `reorderQueue`, `cleanQueue`, `getAvailableQueue`, `serializeDraftState`, `deserializeDraftState`, `compositeScore`, `computeFormatScore`, `assignRosterSlots`, `getByeClashStatus`, `parseSleeperDraft`, `resolveRemotePick`, and `reconcileDraftLog`. |
| **`server.py`** | Python 3 | Local HTTP relay server providing CORS-enabled endpoints (`/api/sync/ping`, `/api/sync/pick`, `/api/sync/status`, `/api/sync/events`, `/api/sync/log`), directory anchoring, automatic browser tab launching (`webbrowser.open`), SVG football favicon (`/favicon.ico`), automated player data age validation (`ensure_player_data_fresh`), and real-time terminal draft activity feed with Windows UTF-8 support. |
| **`start.bat`** | Windows Batch | **1-Click Opener** for Windows Explorer. Sets working directory to project root, starts Python server, and opens the draft board in the default web browser with automatic fallbacks for `python`/`py`/`python3`. |
| **`start.ps1`** | PowerShell | PowerShell script to anchor script root location and start `server.py`. |
| **`extensions/espn-sync/`** | JavaScript / Manifest V3 | Chrome & Edge unpacked browser extension that observes picks in ESPN Live Draft Rooms and streams them in real-time to Fantasy Drafter via local HTTP relay and Server-Sent Events. |
| **`DRAFT_SYNC_API_OVERVIEW.md`** | Markdown | Technical specification covering Sleeper REST API polling, ESPN extension synchronization, and local HTTP relay endpoints. |
| **`update-rankings.py`** | Python 3 | Automated ETL fetcher supporting both live URLs and offline local CSV files (`--ecr-source`, `--values-source`, `--sheet-source`, `--dry-run`), compiling 1,050+ active players into `players-data.js` and `players-data.json`. |
| **`test-runner.mjs`** | Node.js (ESM) | Discovers and executes all test suites (`test-draft-logic.mjs` and all `tests/*.test.mjs`), reporting comprehensive failure and pass metrics. |

---

## 3. Current Feature Set & Capabilities

### 3.1 Modular Separation & Client Architecture
- **📦 Clean Decoupling:**
  - Separated inline CSS and 1,670+ lines of JavaScript into focused single-responsibility modules (`css/draft-board.css`, `js/draft-audio.js`, `js/draft-state.js`, `js/draft-sync-client.js`, `js/draft-ui.js`, `js/app.js`).
  - Zero build step or bundler requirement; preserves 100% offline static file execution while enabling modular testing and seamless feature expansion.
  - Semantic HTML skeleton reduced from 1,934 lines to 120 lines.

### 3.2 Extensible Draft Engines
- **🏈 Pick Ownership & Trading Engine (`draft-logic.js`):**
  - Generates comprehensive pick ownership grids across all rounds (`generateDraftPicks`).
  - Supports trading pick numbers between teams (`applyPickTrade`) and dynamic slot pick re-computation (`picksForSlot` with traded picks map).
  - Maintains strict backwards compatibility with baseline tests when trades are not active.
- **🎯 Target Queue & Shortlist Engine:**
  - Manages prioritized target queues with deduplication, drag-and-drop reordering, and automated cleanup upon player selection (`addToQueue`, `removeFromQueue`, `reorderQueue`, `cleanQueue`, `getAvailableQueue`).
- **💾 State Serialization & Schema Migration:**
  - Versioned draft state storage (`DRAFT_SCHEMA_VERSION = 2`) with automated migration from legacy V1 stores (`serializeDraftState`, `deserializeDraftState`).

### 3.3 Server, 1-Click Launchers & Automated Data Freshness
- **🚀 1-Click Windows Launchers:**
  - `start.bat` and `start.ps1` anchor to the script directory, verify Python installation, launch `server.py`, and automatically open `draft-board.html` in the user's default browser.
- **🔄 Automated Player Data Freshness Check:**
  - On startup, `server.py` evaluates the age of `players-data.json`/`players-data.js`.
  - If data is older than **2 days** (configurable via `--max-age <days>`) or missing, it automatically executes `update-rankings.py` before starting the server.
  - Supports `--update` to force-refresh rankings immediately and `--skip-update` for rapid offline startup.
- **⚡ Smart Zero-Poll SSE Stream (`/api/sync/events`):**
  - Instant Server-Sent Events push stream eliminates unnecessary network polling loops from the browser while connected.
  - Automatic quiet logging filters noisy polling heartbeats from terminal logs.
  - Automatic fallback REST polling activates seamlessly if SSE connection is ever interrupted.
- **🏈 Real-Time Terminal Activity Feed:**
  - Live picks made via ESPN extension, Sleeper polling, or manual clicks are logged directly to the server terminal.
  - Windows console UTF-8 reconfigured to ensure emojis and special characters render cleanly without crashing CP-1252 shells.

### 3.4 Live Draft Synchronization & Audio/Visual Turn Cues
- **⚡ Live Sync Hub (`#syncModal` & Header Pill):**
  - **Sleeper API Mode:** In-browser 2s polling of `/picks` and one-click import of league name, team count, draft order, team names, user slot, and 3RR mode.
  - **ESPN Live Extension Mode:** Unpacked Chrome/Edge Manifest V3 extension automatically relays picks from ESPN live draft rooms to Fantasy Drafter via local HTTP relay and Server-Sent Events.
  - **Reconciliation & Rollback Engine:** Automatically syncs additions and handles commissioner pick resets cleanly.
- **🔔 Audio & Visual Turn Cues:**
  - **Web Audio Chime:** Synthesizes an offline ascending major triad chime whenever the user's team goes on the clock.
  - **Clock Pulse Glow:** Header clock pulses with an animated green glowing border during your turn.

### 3.5 3-Column Dashboard Layout
- **Left Panel — "⭐ My Roster" (Always Visible):**
  - Displays our team's roster, slot position, and total pick count.
  - Interactive Watchlist with instant ⭐ toggling, filtering, and auto-cleanup.
  - Live positional needs counters and starter requirements guide (`QB · 2RB · 2WR · TE · 3FLEX · SF · K · DST`).
  - Starter vs. Bench roster allocation with clean inline position badges for drafted players.
  - Bye-week clash warning alerts with same-position and cross-position conflict detection.
- **Center Panel — "Player Pool & Draft Rankings":**
  - Real-time search, position tabs (`ALL`, `QB`, `RB`, `WR`, `TE`, `K`, `DST`, `ROOKIE`, `WATCHLIST`), multi-format sorting (`score`, `dyn`, `red`, `rookie`, `adp`), and "Hide taken" toggle.
  - Dynamic draft buttons: displays **"Select our Player"** (green highlight) when user is on the clock, and **"Pick Player"** when an opponent is drafting.
  - Non-linear composite scores, tier breaks (`T1`, `T2`, etc.), ADP value indicators (`▼X vs ADP`), NFL team tags, bye weeks, and age.
- **Right Panel — "🕒 On The Clock / League Inspector & Draft Log":**
  - **Auto-Following On-The-Clock Inspector:** Displays the live roster and positional breakdown of whichever team is currently picking.
  - **Full League Inspector:** Dropdown allows inspecting any team's roster and position count across the league at any time.
  - **Draft Log:** Reverse chronological history showing pick number, round.slot, drafting team, player name, position, and NFL team.

---

## 4. Testing Infrastructure

The project includes an automated test runner executing **14 comprehensive test suites** covering over 2,800 assertions:

```powershell
npm test
```

### Test Suite Summary

| Test Suite | File | Tests / Assertions | Status |
| :--- | :--- | :--- | :--- |
| **Baseline Draft Logic** | `test-draft-logic.mjs` | 23 assertions (3RR math, reversal direction, slot coverage, scoring curves) | ✅ Passing |
| **Bye-Week Conflict Detection** | `tests/bye-conflicts.test.mjs` | 29 assertions (same-pos clashes, cross-pos alignments, self-exclusion) | ✅ Passing |
| **Data Pipeline & Schema Integrity** | `tests/data-integrity.test.mjs` | 1,071 assertions (1,050+ player schemas, byes, 32 unique D/ST defenses) | ✅ Passing |
| **Data Pipeline Ingestion & CLI** | `tests/data-pipeline.test.mjs` | 12 assertions (CLI help, offline CSV ingestion, dry-run, schema output) | ✅ Passing |
| **Draft Target Queue** | `tests/draft-queue.test.mjs` | 20 assertions (queue insertion, deduplication, removal, reordering, pick cleanup) | ✅ Passing |
| **Draft State Serialization & V1 Migration** | `tests/draft-serialization.test.mjs` | 22 assertions (V2 state serialization, deserialization, legacy V1 migration) | ✅ Passing |
| **Draft Pick Trading & Ownership Grid** | `tests/pick-trading.test.mjs` | 24 assertions (grid generation, trade assignments, reverting, team picks) | ✅ Passing |
| **Multi-Format League Scoring** | `tests/league-formats.test.mjs` | 27 assertions (1QB vs SF, PPR/Half/Std, TE Premium, rookie ranks) | ✅ Passing |
| **League Setup & 3RR Simulation** | `tests/league-setup.test.mjs` | 1,572 assertions (8/10/12/14/16-team 25-round simulations) | ✅ Passing |
| **Live Draft Synchronization** | `tests/live-sync.test.mjs` | 49 assertions (Sleeper/ESPN parsing, suffixes Jr/III, defenses, rollbacks) | ✅ Passing |
| **Starter Slots & Lineup Allocation** | `tests/roster-slots.test.mjs` | 56 assertions (starter/bench allocation, inline badges, round totals) | ✅ Passing |
| **Server Startup & 1-Click Launchers** | `tests/server-startup.test.mjs` | 33 assertions (`start.bat`, `start.ps1`, `--help`, favicon, SSE, age check) | ✅ Passing |
| **Unlisted Picks & Custom Resolution** | `tests/unlisted-picks.test.mjs` | 13 assertions (custom name/pos/bye/team resolution, fallback naming) | ✅ Passing |
| **Draft Watchlist Management** | `tests/watchlist.test.mjs` | 18 assertions (star toggle, add/remove, auto-cleanup on draft, persistence) | ✅ Passing |

**Total:** 14 suites passing (0 failures).

---

## 5. Development & Execution Quickstart

### 1. Run Automated Test Suite
```powershell
npm test
```

### 2. Launch Local Web Server & Draft Board
**Option A: 1-Click Batch (Windows Explorer)**  
Double-click `start.bat` in the project folder.

**Option B: NPM / CLI**
```powershell
npm start
```
*Note: Automatically opens [http://127.0.0.1:8517/draft-board.html](http://127.0.0.1:8517/draft-board.html) in your default browser and verifies player data freshness.*

**Option C: Headless Server (No Browser Auto-Launch)**
```powershell
npm run start:headless
```

### 3. Update to Latest Live Consensus Rankings
```powershell
npm run update
```
*(Runs automatically on server startup if existing data is older than 2 days).*
