# Fantasy Drafter — Codebase Review & Functionality Report

**Date:** September 1st, 2026  
**Project:** DK's Draft Board (Superflex Dynasty Fantasy Football Drafter)  
**Repository:** [Fantasy Drafter](https://github.com/DCarist/FantasyDrafter)  

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
├── tests/
│   ├── test-helper.mjs         # Shared test assertions and suite utilities
│   ├── baseline-logic (in root)# test-draft-logic.mjs baseline pick math
│   ├── bye-conflicts.test.mjs  # Bye clash detection and alignment test suite
│   ├── data-integrity.test.mjs # Player data schema & defense canonicalization test suite
│   ├── data-pipeline.test.mjs  # Data pipeline CLI, offline file ingestion & schema test suite
│   ├── draft-board-grid.test.mjs # Draft board matrix generation, 3RR reversal, and keeper styles test suite
│   ├── draft-queue.test.mjs    # Target queue ordering, deduplication & pick cleanup test suite
│   ├── draft-serialization.test.mjs # V2 schema serialization, deserialization & legacy V1 migration test suite
│   ├── draft-strategy-radar.test.mjs # Live draft strategy radar, opponent threat timeline & user needs test suite
│   ├── draft-summary-analysis.test.mjs # Post-draft summary, positional value ranks, letter grades & superlatives test suite
│   ├── espn-sync-robustness.test.mjs # ESPN live sync robustness, autopicker burst & event logging test suite
│   ├── keepers.test.mjs        # Keeper player selection, trade slot remapping, and inline roster allocation test suite
│   ├── league-formats.test.mjs # Multi-format rankings and scoring models test suite
│   ├── league-setup.test.mjs   # Multi-team 3RR draft simulation test suite
│   ├── live-sync.test.mjs      # Live draft synchronization and player resolution test suite
│   ├── pick-trading.test.mjs   # Draft pick trading & dynamic ownership grid test suite
| **`extensions/espn-sync/`** | JavaScript / Manifest V3 | Chrome & Edge unpacked browser extension that observes picks in ESPN Live Draft Rooms and streams them in real-time to Fantasy Drafter via local HTTP relay and Server-Sent Events. |
| **`DRAFT_SYNC_API_OVERVIEW.md`** | Markdown | Technical specification covering Sleeper REST API polling, ESPN extension synchronization, and local HTTP relay endpoints. |
| **`update-rankings.py`** | Python 3 | Automated ETL fetcher supporting both live URLs and offline local CSV files (`--ecr-source`, `--values-source`, `--sheet-source`, `--dry-run`), compiling 1,050+ active players into `players-data.js` and `players-data.json`. |
| **`test-runner.mjs`** | Node.js (ESM) | Discovers and executes all test suites (`test-draft-logic.mjs` and all `tests/*.test.mjs`), reporting comprehensive failure and pass metrics. |

```
---


## 3. Current Feature Set & Capabilities
### 3.1 Modular Separation & Client Architecture
- **📦 Clean Decoupling:**
  - Separated inline CSS and 1,670+ lines of JavaScript into focused single-responsibility modules (`css/draft-board.css`, `js/draft-audio.js`, `js/draft-state.js`, `js/draft-sync-client.js`, `js/draft-ui.js`, `js/app.js`).
  - Zero build step or bundler requirement; preserves 100% offline static file execution while enabling modular testing and seamless feature expansion.
  - Semantic HTML skeleton reduced from 1,934 lines to 120 lines.

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

### 3.6 Keepers & Pre-Drafted Players Management
- **🔒 Flexible Keeper Configuration (`#keepersModal`):**
  - Configurable max keepers per team (`maxKeepers`, default `2`, range `0–10`). Teams can have 0, 1, or multiple keepers up to the league limit.
  - Search and select real NFL players from the player pool or input custom unlisted players with custom name, position, NFL team, and bye week.
  - Cost round validation (`validateKeeperAssignment`) ensures teams have sufficient owned picks in the assigned round (accounting for traded picks) and prevents assigning duplicate players.
  - In-place keeper editing allows modifying an existing keeper's round, team slot, or player without self-collision errors or needing to delete and re-add.
  - Automatic team slot remapping (`remapKeepersOnSlotSwap`) when draft order is rearranged in League Setup, ensuring keepers stay attached to their teams.
- **⚡ Pre-Draft Inline Lineup Allocation & Dynamic Countdown:**
  - Configured keepers populate directly into team rosters from pick 1 of the draft, immediately occupying starter slots (`[QB badge] Josh Allen BUF 🔒 9.09 bye 7`) and factoring into positional needs and starter capacity.
  - Automated draft execution (`autoAdvanceKeepers`): automatically records keeper picks to `draftLog` and syncs them via local relay when the draft reaches that pick number.
  - Accurate countdown & clock alerts (`getNextDraftPicks`): skips automated keeper picks when determining the user's next active draft selection, preventing premature `soon` clock alerts.

### 3.7 Interactive Draft Board Grid Modal (`generateDraftBoardGrid`)
- **📊 Sleeper/ESPN Style Matrix:** 2-axis sticky scrolling draft board modal displaying all rounds and teams with position-colored pick cards, team ownership headers, pick numbers (`#overall` & `R.Slot`), and traded pick tags (`via Team X`).
- **🗜️ Normal & Compact Views:** One-click density toggle between detailed card layout and compact layout to fit full rounds onto laptop and monitor displays without clipping player names.
- **🎨 Position & Team Highlighting:** Instant filter buttons to highlight `QB`, `RB`, `WR`, `TE`, `K`, `D/ST` or `⭐ My Team`, dimming all unselected picks.
- **⚡ On-The-Clock Focus:** Glowing animated pulse outline on the currently active draft pick with a 1-click **"⚡ Jump to On-Clock"** auto-scroller.
- **🔒 Keeper Selections:** Displays assigned keepers with lock icons (`🔒`), dashed border styling, and position background colors.

### 3.8 Live Team Strategy Radar & Post-Draft Assessment
- **🎯 Live Team-Centric Strategy Radar (`analyzeLiveDraftStrategy`):**
  - **Pick Distance Proximity Counter:** Computes picks until user's turn, next pick number/format, and on-clock state.
  - **Opponent Threat Timeline:** Chronological strip of all upcoming picks between turns, identifying each drafting opponent's open starter holes with position-colored badges (`QB`, `RB`, `WR`, `TE`).
  - **Unique Opponent Run Danger Alerts:** Aggregate risk badges flagging when multiple unique upcoming opponents need the same starting position (e.g. `🚨 High QB Run Risk`).
  - **K & D/ST Noise Suppression:** Suppresses kicker and defense requirements in early/mid rounds so managers focus on skill starters and depth first.
  - **Tailored Target Suggestions:** Recommends top available value players matching the user's highest roster urgency.
- **🏆 Post-Draft League Value Assessment & Power Rankings (`generateDraftSummaryAnalysis`):**
  - **Auto-Trigger on Conclusion:** Automatically opens directly to the summary view when the draft concludes.
  - **"My Team" Report Card:** Overall Letter Grade (`A+` to `D`), League Rank, Starters vs Bench score splits, and Net ADP Value Surplus.
  - **Draft Superlatives:** Projected Champion, Steal of the Draft, Biggest Reach, and Best Positional Units (`QB`, `RB`, `WR`, `TE`).
  - **Sortable Power Rankings Table:** Sortable by Rank, Score, Starters, Bench, Positional Scores, and ADP Value, with clickable accordion drawers to inspect any team's full lineup.

---
| **Live Draft Strategy Radar & Threats** | `tests/draft-strategy-radar.test.mjs` | 19 assertions (next pick distance, opponent threat predictions, run danger alerts, user needs) | ✅ Passing |
| **Post-Draft Summary & Positional Value** | `tests/draft-summary-analysis.test.mjs` | 17 assertions (positional value totals, league unit ranks #1..N, grades, superlatives) | ✅ Passing |
| **Draft Pick Trading & Ownership Grid** | `tests/pick-trading.test.mjs` | 24 assertions (grid generation, trade assignments, reverting, team picks) | ✅ Passing |
| **ESPN Live Sync Robustness & Event Logging** | `tests/espn-sync-robustness.test.mjs` | 28 assertions (pick format parsing, autopicker burst reconciliation, out-of-order guard, server log persistence) | ✅ Passing |
| **Keepers & Pre-Drafted Players** | `tests/keepers.test.mjs` | 42 assertions (assignment validation, traded pick round capacity, slot swaps, in-place edit, inline roster, countdown) | ✅ Passing |
| **League Setup & 3RR Simulation** | `tests/league-setup.test.mjs` | 1,572 assertions (8/10/12/14/16-team 25-round simulations) | ✅ Passing |
| **Live Draft Synchronization** | `tests/live-sync.test.mjs` | 49 assertions (Sleeper/ESPN parsing, suffixes Jr/III, defenses, rollbacks) | ✅ Passing |
| **Starter Slots & Lineup Allocation** | `tests/roster-slots.test.mjs` | 56 assertions (starter/bench allocation, inline badges, round totals) | ✅ Passing |
| **Server Startup & 1-Click Launchers** | `tests/server-startup.test.mjs` | 33 assertions (`start.bat`, `start.ps1`, `--help`, favicon, SSE, age check) | ✅ Passing |
| **Unlisted Picks & Custom Resolution** | `tests/unlisted-picks.test.mjs` | 13 assertions (custom name/pos/bye/team resolution, fallback naming) | ✅ Passing |
| **Draft Watchlist Management** | `tests/watchlist.test.mjs` | 18 assertions (star toggle, add/remove, auto-cleanup on draft, persistence) | ✅ Passing |

**Total:** 19 suites passing (0 failures).

---

## 5. Development & Execution Quickstart

```powershell
npm test
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
```

### 3. Update to Latest Live Consensus Rankings
```powershell
npm run update
```
*(Runs automatically on server startup if existing data is older than 2 days).*
