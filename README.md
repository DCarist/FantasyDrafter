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

### 📊 Master Consensus Player Rankings & Data Pipeline
- Aggregates consensus draft rankings, positional projections, bye weeks, and average draft position (ADP).
- Includes automated data fetchers:
  - `update-rankings.py`: Multi-source data pipeline aggregator.
  - `fetch_fantasypros.py`: FantasyPros consensus cheat sheet extractor.
  - `fetch_sleeper.py`: Sleeper trending ADP and player metadata extractor.
  - `fetch_adp.py`: Consensus average draft position aggregator.

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
├── players-data.js                 # Master consensus player rankings and metadata
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
├── tests/                          # Automated test suites (19 suites)
│   ├── bye-conflicts.test.mjs
│   ├── data-integrity.test.mjs
│   ├── data-pipeline.test.mjs
│   ├── draft-board-grid.test.mjs
│   ├── draft-queue.test.mjs
│   ├── draft-serialization.test.mjs
│   ├── draft-strategy-radar.test.mjs
│   ├── draft-summary-analysis.test.mjs
│   ├── espn-sync-robustness.test.mjs
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
├── test-runner.mjs                 # Test runner discovering all test suites
├── update-rankings.py              # Automated data pipeline updater
├── start.bat                       # Windows Batch 1-click launcher
├── start.ps1                       # Windows PowerShell 1-click launcher
└── package.json                    # Project configuration and npm scripts
```

---

## 🧪 Testing

Fantasy Drafter includes a comprehensive suite of **19 automated test suites** covering draft matrix calculations, 3RR order, live synchronization, pick trading, keepers, roster slots, live strategy radar, and post-draft league assessment.

Run the full test suite with:
```bash
npm test
```

---

## 🔄 Updating Rankings Data

To fetch the latest consensus rankings and ADP before your draft:
```bash
npm run update
# or
python update-rankings.py
```

This updates `players-data.js` with fresh player values, bye weeks, and team assignments while preserving custom adjustments.

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.

