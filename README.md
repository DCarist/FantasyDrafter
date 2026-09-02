# 🏈 Fantasy Drafter

> **Superflex & Dynasty Fantasy Football Draft Board and Real-Time Decision Assistant**

Fantasy Drafter is a fast, responsive fantasy football draft board designed for live drafts, mock drafts, and dynasty startups. It features real-time draft synchronization with **ESPN** and **Sleeper**, dynamic Value Over Replacement Player (VORP) calculation, positional scarcity tracking, pick trading, and customizable roster configurations (Superflex, PPR, 3RR, and custom bench depths).

---

## ✨ Key Features

### 📋 Live Interactive Draft Board & Strategy Suite
- **Full Visual Grid Matrix**: Sleeper/ESPN-style interactive draft board with 2-axis sticky scrolling, custom team names, round/pick indicators, personal pick badges, and on-the-clock pulse animation.
- **Normal & Compact Densities**: Toggle between detailed view and compact view optimized for high-resolution screens and large draft sizes.
- **Position & Team Highlighting**: One-click filters to highlight specific positions (`QB`, `RB`, `WR`, `TE`, `K`, `D/ST`) or your team picks across the board.
- **Draft Order Formats**: Full support for **3rd-Round Reversal (3RR)** and **Standard Snake** drafting.
- **Pick Trading & Ownership**: Trade individual draft picks between teams with automatic matrix recalculation, trade tags (`via Team X`), and accurate next-turn countdowns.
- **Dynamic Roster Allocation**: Live starter slots calculation (`QB`, `RB`, `WR`, `TE`, `FLEX`, `Superflex`, `K`, `DST`) with automatic spillover into bench slots.
- **Pre-Drafted Keepers**: In-place keeper assignment across rounds/slots with custom keeper limits, lock icons, position-colored pending keeper cards, and draft order retention.
- **Unlisted Player Resolution**: Seamlessly record and track custom/unlisted players without breaking consensus ranking data.
- **Support for Keepers**: Easily add/modify delete keepers for leagues that have keeper rules. Full support for draft modification after keeper addition.

### 🎯 Live Team-Centric Strategy Radar
- **Proximity Counter**: Real-time distance to your next draft turn (e.g. `⏳ 5 Picks Until Your Turn · Pick #28 (3.08)`), switching to an active on-the-clock banner on your pick.
- **Opponent Threat Timeline**: Chronological strip detailing upcoming opponent picks between turns and predicting what starting spots they urgently need with position-colored badges.
- **Position Run Danger Alerts**: Aggregate risk badges flagging when multiple upcoming opponents need the same starting position (e.g. `🚨 High QB Run Risk`).
- **Context-Aware K & D/ST Suppression**: Suppresses kicker and defense noise in early/mid rounds so users and opponents focus on offensive skill starters and depth first.
- **Tailored Target Suggestions**: Recommends top available value players from the pool that directly solve your most critical starting lineup needs.

### 🏆 Post-Draft Assessment & League Power Rankings
- **Automatic Completion Trigger**: Auto-opens the Draft Board modal directly to the League Value tab upon completion of the final draft pick.
- **"My Team" Final Report Card**: Overall letter grade (`A+` to `D`), league rank (`#2 of 10`), total value score, starter points, and net ADP value surplus.
- **Draft Superlatives & Awards**: Projected League Champion, Steal of the Draft, Biggest Reach, and Best Positional Unit Rooms (`QB`, `RB`, `WR`, `TE`).
- **Sortable Power Rankings Table**: Sortable by rank, score, starter points, and individual positions, featuring expandable team roster drawers.

### ⚡ Automated Live Draft Sync
- **📺 ESPN Live Sync (Chrome / Edge Extension)**:
  - Manifest V3 extension located in [`extensions/espn-sync`](extensions/espn-sync).
  - Automatically monitors live and mock ESPN draft rooms with 0 clicks required during the draft.
  - Automatically detects league size (8–16 teams), team names in slot order, and user draft position across all draft room tabs (Board, Players, Pick History).
  - Handles commissioner pick rollbacks, auto-pick events, and real-time snapshot reconciliation.
- **🏈 Sleeper API Sync**:
  - Direct 2-second live polling by Sleeper Draft ID or League URL.
  - One-click import of league settings, user slot matching, and pick history.
- **🔔 Turn Alerts & Cues**:
  - Auditory chime synthesized via Web Audio API when your team is on the clock.
  - Pulsing green visual indicator on header countdown and draft board.

### 📈 Positional Tiers & Scarcity Cliff Detection
- **1D Natural Breaks (Fisher-Jenks) Clustering**: Calculates mathematical tiers per position based on natural statistical cliffs in composite player draft scores, guaranteeing strict monotonicity ($T_1 \le T_2 \le \dots$).
- **Dedicated POS TIER Column**: High-contrast, harmonized dark-text green-to-red gradient pills (`T1` to `T6+`) matching the visual style of position badges.
- **Pre-Computed & Stable Tiers**: Positional tiers (`posTier`) and overall board tiers (`overallTier`) remain invariant when players are drafted or hidden.
- **Impending Cliff Scarcity Alerts**: Badges flag critical drop-offs in real time (`⚡ Last in T1`, `⚠️ 2 left in T2`) when available tier players dwindle.

### ⭐ Interactive Watchlist & Priority Drag-and-Drop
- **Two-Way Drag-and-Drop Reordering**: Rearrange player priority on the fly via fluid native HTML5 drag-and-drop in both the left sidebar Watchlist panel and the main draft board table.
- **Expanded Hit Target**: Generous ~28x28px clickable star button area with hover feedback and strict click event isolation, preventing accidental player modal popups.
- **Watchlist Priority Sorting**: Dedicated "Watchlist priority" sorting option in the table sort dropdown with automatic sync when switching to the `★ WATCH` tab.

### 🏈 NFL Injury Tracking & 32-Team Depth Charts
- **Live NFL Injury Reports**: Live tracking of official NFL injury statuses (`OUT`, `IR`, `Q`, `D`), injury types, detail descriptions, and estimated return dates.
- **Roster & Board Injury Badges**: Visible status tags in table rows, roster slots, and dedicated collapsible injury drawers in player modals.
- **32-Team ESPN Depth Charts**: Real-time positional depth chart strings (e.g. `RB1 · Starter`, `WR2 · Slot`) embedded directly into player profile cards.

### ⚙️ League Formats & Dynamic Data Pipeline
- **League Type Setting**: Tailor composite draft scores and ranking blends specifically for **Dynasty** vs. **Redraft** formats in League Setup.
- **In-App On-Demand Refresh**: One-click **🔄 Refresh Data Now** button in League Setup communicating directly with the Python server to update consensus rankings, depth charts, and injury reports without leaving the browser.
- **Automated Data Fetchers in `scripts/`**:
  - `scripts/update_rankings.py`: Multi-source consensus rankings aggregator.
  - `scripts/fetch_depth_charts.py`: 32-team ESPN depth charts extractor.
  - `scripts/fetch_injuries.py`: ESPN NFL injury report extractor.
  - `scripts/merge_data.py`: Data merger and normalization engine.
  - `scripts/patch_extras.py`: Metadata, bye weeks, and stat projection patcher.

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.8+** (for local relay server and rankings updater)
- **Node.js 18+** (for running the automated test suite)
- Google Chrome or Microsoft Edge (for ESPN Live Sync extension)

### 1. Launch Fantasy Drafter
You can launch the app using any of the convenient 1-click launchers:

#### Windows 1-Click Launchers
Double-click `start.bat` or run:
```powershell
.\start.ps1
```

#### npm / Command Line
```bash
# Start server and auto-launch browser at http://127.0.0.1:8517
npm start

# Or start headless without auto-launching browser
npm run start:headless
```

---

## 🔌 Setting Up ESPN Live Sync

1. Open `chrome://extensions` (or `edge://extensions`) in your browser.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the [`extensions/espn-sync`](extensions/espn-sync) folder in this repository.
4. Open your ESPN Draft Room. The sync pill (**`⚡ Fantasy Drafter: Connected & Synced`**) will appear in the top-left corner of the window.
5. Fantasy Drafter will automatically detect your league teams, draft slot, and stream all picks in real time.

---

## 🛠️ Project Structure

```
FantasyDrafter/
├── draft-board.html                # Main single-page draft board application
├── server.py                       # Python HTTP relay, SSE streaming, and sync server
├── draft-logic.js                  # Pure core draft calculations, snake/3RR, roster slots & analytics
├── test-draft-logic.mjs            # Baseline unit test suite
├── test-runner.mjs                 # Test runner discovering all 22 test suites
│
├── js/                             # Client-side modular UI and sync components
│   ├── draft-state.js              # State store, schema normalization, and persistence
│   ├── draft-ui.js                 # DOM rendering, modals, roster tables, and draft board matrix
│   ├── draft-sync-client.js        # SSE stream listener, Sleeper polling, and ESPN bridge
│   ├── draft-audio.js              # Turn chime audio synthesizer
│   └── app.js                      # Event binding and global keyboard shortcuts
│
├── css/                            # Application styling and dark-theme tokens
│   └── draft-board.css             # Consolidated stylesheet (color tokens, tables, matrix & modals)
│
├── extensions/                     # Browser extensions
│   └── espn-sync/                  # ESPN Live Sync Manifest V3 Chrome/Edge extension
│       ├── manifest.json
│       ├── background.js           # Background service worker (PNA loopback relay)
│       └── content-script.js       # Live DOM observer and pick parser
│
├── tests/                          # Automated test suites (21 modular suites)
│   ├── bye-conflicts.test.mjs
│   ├── data-integrity.test.mjs
│   ├── data-pipeline.test.mjs
│   ├── depth-chart-and-league-type.test.mjs
│   ├── draft-board-grid.test.mjs
│   ├── draft-queue.test.mjs
│   ├── draft-serialization.test.mjs
│   ├── draft-strategy-radar.test.mjs
│   ├── draft-summary-analysis.test.mjs
│   ├── draft-tiers.test.mjs
│   ├── espn-sync-robustness.test.mjs
│   ├── injury-tracking.test.mjs
│   ├── keepers.test.mjs
│   ├── league-formats.test.mjs
│   ├── league-setup.test.mjs
│   ├── live-sync.test.mjs
│   ├── pick-trading.test.mjs
│   ├── roster-slots.test.mjs
│   ├── server-startup.test.mjs
│   ├── unlisted-picks.test.mjs
│   └── watchlist.test.mjs
│
├── scripts/                        # Automated data pipelines and fetchers
│   ├── update_rankings.py          # Master consensus rankings updater
│   ├── fetch_depth_charts.py       # 32-team ESPN depth charts fetcher
│   ├── fetch_injuries.py           # ESPN NFL injury reports fetcher
│   ├── merge_data.py               # Dataset merger and normalization
│   └── patch_extras.py             # Schedules, byes, and projections patcher
│
├── start.bat                       # Windows Batch 1-click launcher
├── start.ps1                       # Windows PowerShell 1-click launcher
└── package.json                    # Project configuration and npm scripts
```

---

## 🧪 Testing

Fantasy Drafter includes a comprehensive suite of **22 automated test suites** covering draft matrix calculations, 3RR order, live synchronization, pick trading, keepers, roster slots, depth charts, injury tracking, natural breaks tiering, watchlist priority reordering, and post-draft league assessment.

Run the full test suite with:
```bash
npm test
```

---

## 🔄 Updating Rankings Data

To fetch the latest consensus rankings, 32-team depth charts, and injury reports before your draft:
- **In-App:** Open **League Setup** and click **🔄 Refresh Data Now**.
- **Via npm:** `npm run update`
- **Via Python:** `python scripts/update_rankings.py`

This updates `players-data.js` and `players-data.json` with fresh player values, depth charts, and injury reports while preserving custom adjustments.

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.

