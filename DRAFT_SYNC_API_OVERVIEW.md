# Live Draft Synchronization — API & Architecture Overview

**Date:** August 23, 2026  
**Project:** Fantasy Drafter  
**Targets:** Sleeper & ESPN Fantasy Live Draft Sync  

---

## 1. Executive Summary & Feasibility Comparison

This document outlines the API capabilities, authentication models, real-time pick delivery mechanisms, and architectural approaches for synchronizing **Fantasy Drafter** with active, online drafts on **Sleeper** and **ESPN Fantasy Football**.

| Platform | Direct In-Browser Fetch (CORS) | Auth Requirements | Live Pick Latency | Best Implementation Approach |
| :--- | :--- | :--- | :--- | :--- |
| **Sleeper** | ✅ **Yes** (`Access-Control-Allow-Origin: *`) | **None** (Public endpoints) | **1–2 seconds** (polling) | **Native In-Browser REST Poller** (Zero dependencies / 100% client-side) |
| **ESPN** | ❌ **No** (Strict CORS / Private cookies) | **`espn_s2` + `SWID`** (for private leagues) | Sub-second (DOM / Tab Messaging) | **Manifest V3 Chrome Extension** or **1-Click Bookmarklet** (Cross-Tab Broadcast) |

---

## 2. Sleeper Live Sync Specification

Sleeper provides a developer-friendly, open REST API with permissive CORS headers. Fantasy Drafter can interact with Sleeper directly from `draft-board.html` without requiring any proxy server, browser extension, or backend daemon.

### 2.1 API Endpoints

#### A. Draft Metadata & Configuration
`GET https://api.sleeper.app/v1/draft/<draft_id>`

- **Purpose:** Automatically configures league settings, team names, user slot, and draft order.
- **Key Response Fields:**
  - `status`: `"pre_draft"`, `"drafting"`, `"paused"`, `"complete"`
  - `type`: `"snake"`, `"linear"`, `"auction"`
  - `settings.teams`: Number of teams (e.g. `12`)
  - `settings.rounds`: Total draft rounds (e.g. `25`)
  - `settings.reversal_round`: `3` indicates **3rd-Round Reversal (3RR)**; `0` / omitted indicates standard snake.
  - `draft_order`: Object mapping user ID to draft slot (`{ "user_id_1": 1, "user_id_2": 2, ... }`).
  - `slot_to_roster_id`: Maps draft slots to league roster IDs.
  - `league_id`: Associated Sleeper league ID.

#### B. League User Profiles
`GET https://api.sleeper.app/v1/league/<league_id>/users`

- **Purpose:** Resolves Sleeper user IDs to display names and custom team names.
- **Key Response Fields:**
  - `user_id`: Unique identifier matching `draft_order`.
  - `display_name`: Sleeper username.
  - `metadata.team_name`: Custom team nickname (if set).

#### C. Live Draft Picks Stream
`GET https://api.sleeper.app/v1/draft/<draft_id>/picks`

- **Purpose:** Returns the complete chronological sequence of picks made in the draft.
- **Key Response Fields:**
  ```json
  [
    {
      "pick_no": 1,
      "round": 1,
      "draft_slot": 1,
      "player_id": "6794",
      "picked_by": "user_id_123",
      "roster_id": 1,
      "is_keeper": null,
      "metadata": {
        "first_name": "Bijan",
        "last_name": "Robinson",
        "position": "RB",
        "team": "ATL",
        "years_exp": "1",
        "status": "Active"
      }
    }
  ]
  ```

### 2.2 Sleeper Sync Lifecycle
1. **Import Settings:** User enters a Sleeper Draft ID (or URL). Fantasy Drafter fetches the draft metadata, identifies the user's slot, sets 3RR vs Snake, initializes team names, and configures total rounds.
2. **Polling Loop:** When live sync is active, a `setInterval` poller queries `/picks` every 2,000ms.
3. **Player Resolution:** For each new pick:
   - Formats `first_name + ' ' + last_name`.
   - Runs fuzzy/exact matching using `draft-logic.js:normalizeName()` and `pos`.
   - If present in `PLAYERS`, calls `draftPlayer(id)`.
   - If unlisted (e.g. unranked rookie or deep kicker/DST), invokes `draftUnlistedPlayer(pos, name, team)`.
4. **Reconciliation & Rollback Handling:** If the commissioner rolls back a pick on Sleeper, `picks.length` will be less than `state.log.length`. Fantasy Drafter automatically rewinds `state.log` to match the exact Sleeper pick history.

---

## 3. ESPN Live Sync Specification

ESPN Fantasy Football does not expose a public real-time draft socket or permissive CORS endpoints.

### 3.1 Technical Challenges with ESPN
1. **Authentication & Private Leagues:** Most ESPN leagues are private, requiring authentication via `espn_s2` and `SWID` cookies.
2. **CORS Enforcement:** Direct browser `fetch()` requests from `http://localhost:8517` or other local origins to ESPN domains are blocked by browser Same-Origin Policy.
3. **REST API Delay:** The unofficial ESPN REST API (`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/<YEAR>/segments/0/leagues/<LEAGUE_ID>?view=mDraftDetail`) is cached aggressively and typically updates in delayed batches rather than providing sub-second live pick streaming.
4. **Live Draft Room Client:** The ESPN Draft Room web application renders picks in real time via internal React state and WebSocket messaging.

### 3.2 Integration Approaches for ESPN

```
┌────────────────────────────────────────────────────────┐
│                   ESPN Draft Room                      │
│            (fantasy.espn.com/football/draft)           │
│                                                        │
│   ┌────────────────────────────────────────────────┐   │
│   │     Pick Observer Content Script Injected      │   │
│   │   (via Manifest V3 Chrome / Edge Extension)    │   │
│   │                                                │   │
│   │   - Watches live pick feed / DOM changes       │   │
│   │   - Extracts pickNumber, playerName, pos, team │   │
│   └───────────────────────┬────────────────────────┘   │
└───────────────────────────┼────────────────────────────┘
                            │
               HTTP Relay / BroadcastChannel
                            │
┌───────────────────────────▼────────────────────────────┐
│              Fantasy Drafter Board Tab                 │
│         (http://127.0.0.1:8517/draft-board.html)       │
│                                                        │
│   - Receives pick events via local HTTP relay/SSE      │
│   - Resolves player against rankings dataset           │
│   - Automatically logs pick & updates rosters / board  │
└────────────────────────────────────────────────────────┘
```

#### Chrome/Edge Browser Extension (Primary for ESPN)
- **Architecture:** Manifest V3 extension with a content script targeting `*://fantasy.espn.com/*draft*` in [`extensions/espn-sync`](file:///d:/Programming/FantasyDrafter/extensions/espn-sync).
- **How it works:**
  1. The content script mounts a `MutationObserver` on the ESPN pick history table, draft board cells, and active clock banner.
  2. As each pick is completed, the extension extracts player name, position, and NFL team:
     `{ source: 'espn', type: 'PICK_MADE', overall: 14, name: 'CeeDee Lamb', pos: 'WR', team: 'DAL' }`
  3. Transmits the payload to Fantasy Drafter on `http://127.0.0.1:8517/api/sync/pick` (or `/api/sync/snapshot` for rapid bursts/autopickers).
  4. Fantasy Drafter receives the event and executes the draft action instantly with out-of-order guards and snapshot reconciliation.
- **Advantages:** Sub-second response time, works with 100% of private and public ESPN leagues, handles fast autopicker bursts via batch snapshot sync, requires zero cookie entry.
- **Setup:** Loaded once via Chrome/Edge `chrome://extensions` or `edge://extensions` -> **Load unpacked** pointing to `extensions/espn-sync`.

---

## 4. Unified Sync Architecture for Fantasy Drafter

The unified architecture allows Fantasy Drafter to operate as a central draft hub, agnostic of the draft platform.

```
                           ┌─────────────────────────────────────────┐
                           │      Unified Live Sync Manager          │
                           │       (draft-board.html UI)             │
                           └────┬───────────────────────────────┬────┘
                                │                               │
                ┌───────────────▼──────────────┐ ┌──────────────▼──────────────┐
                │        Sleeper Adapter       │ │         ESPN Adapter        │
                │  - Direct /v1/picks poller   │ │  - Extension / Beacon Relay │
                │  - League setup auto-importer│ │  - Batch Snapshot Ingestion │
                └───────────────┬──────────────┘ └──────────────┬──────────────┘
                                │                               │
                                └───────────────┬───────────────┘
                                                │
                                                ▼
                           ┌─────────────────────────────────────────┐
                           │    Player Resolution & Sync Engine      │
                           │                                         │
                           │  1. Exact Name + Pos Normalization      │
                           │  2. DST Canonical Resolver              │
                           │  3. Automatic Unlisted Player Fallback  │
                           │  4. Pick Order & Rollback Reconciler    │
                           │  5. Out-of-Order Settled Pick Guards    │
                           └────────────────────┬────────────────────┘
                                                │
                                                ▼
                           ┌─────────────────────────────────────────┐
                           │      Draft State & Roster Engine        │
                           │  (state.log, localStorage, UI Render)   │
                           └─────────────────────────────────────────┘
```

### 4.1 Player Matching & Fallback Rules
1. **Primary Match:** Clean string matching using `normalizeName(remoteName) === normalizeName(localName)` and matching position (`QB`, `RB`, `WR`, `TE`, `K`, `DST`).
2. **Defense Match:** Pass defense strings (`"San Francisco 49ers"`, `"49ers DST"`, `"SF"`) through `resolveDstCanonical()`.
3. **Unlisted / Sleeper Fallback:** If a drafted player is not in the rankings dataset (e.g. an obscure rookie or third-string kicker), Fantasy Drafter automatically records a custom unlisted pick with the player's name, position, and NFL team so that draft slots and team rosters stay 100% aligned.
4. **Reconciliation & Undo:** If the remote draft removes or changes a pick, the engine compares the remote pick array with `state.log` and updates `state.log` to match.
5. **Autopicker Burst & Out-of-Order Safety Guards:** Protects settled earlier picks (e.g. pick #9) from ever being overwritten by late, misindexed single-pick events (e.g. pick #37). Reconciles multiple rapid autopicker picks in exact chronological sequence.

