# 🏈 Fantasy Drafter

> **Superflex & Dynasty Fantasy Football Draft Board and Real-Time Decision Assistant**

Fantasy Drafter is a fast, responsive fantasy football draft board designed for live drafts, mock drafts, and dynasty startups. It features real-time draft synchronization with **ESPN** and **Sleeper**, dynamic Value Over Replacement Player (VORP) calculation, positional scarcity tracking, pick trading, and customizable roster configurations (Superflex, PPR, 3RR, and custom bench depths).

---

## ✨ Key Features

### 📋 Live Interactive Draft Board
- **Full Visual Grid Matrix**: Color-coded by position (`QB`, `RB`, `WR`, `TE`, `K`, `DST`) with custom team names, round/pick indicators, and personal pick highlighting.
- **Draft Order Formats**: Full support for **3rd-Round Reversal (3RR)** and **Standard Snake** drafting.
- **Pick Trading & Ownership**: Trade individual draft picks between teams with automatic grid updates and traded-pick tracking.
- **Dynamic Roster Allocation**: Live starter slots calculation (`QB`, `RB`, `WR`, `TE`, `FLEX`, `Superflex`, `K`, `DST`) with automatic spillover into bench slots.
- **Bye Week & Conflict Analysis**: Highlights roster bye week overlaps and stack opportunities in real time.
- **Unlisted Player Resolution**: Seamlessly record and track custom/unlisted players without breaking consensus ranking data.
- **Support for Keepers**: Easily add/modify delete keepers for leagues that have keeper rules. Full support for draft modification after keeper addition.

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
  - Auditory chime when your team is on the clock.
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
├── draft-logic.js                  # Pure core draft calculations, snake/3RR, and roster slots
├── players-data.js                 # Master consensus player rankings and metadata
│
├── js/                             # Client-side modular UI and sync components
│   ├── draft-state.js              # State store, schema normalization, and persistence
│   ├── draft-ui.js                 # DOM rendering, modals, roster tables, and board interactions
│   └── draft-sync-client.js        # SSE stream listener, Sleeper polling, and ESPN bridge
│
├── css/                            # Application styling and dark-theme tokens
│   ├── main.css                    # Core typography, layout, and position badges
│   └── board.css                   # Grid matrix, roster cards, and trade overlays
│
├── extensions/                     # Browser extensions
│   └── espn-sync/                  # ESPN Live Sync Manifest V3 Chrome/Edge extension
│       ├── manifest.json
│       ├── background.js           # Background service worker (PNA loopback relay)
│       └── content-script.js       # Live DOM observer and pick parser
│
├── tests/                          # Automated test suites
│   ├── bye-conflicts.test.mjs
│   ├── data-integrity.test.mjs
│   ├── data-pipeline.test.mjs
│   ├── draft-queue.test.mjs
│   ├── draft-serialization.test.mjs
│   ├── espn-sync-robustness.test.mjs
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

Fantasy Drafter includes a comprehensive suite of 15 automated test suites covering draft matrix calculations, 3RR order, live synchronization, pick trading, roster slots, and data integrity.

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

