#!/usr/bin/env python3
"""In-Season Roster Management & Multi-League Engine for Fantasy Drafter.

Provides SQLite persistence for in-season leagues, date-partitioned snapshots,
Sleeper/ESPN roster syncing, player news aggregation, multi-league waiver wire
matrix calculation, lineup optimization, and league power rankings with trade matchmaking.
"""

import datetime
import json
import os
import re
import sqlite3
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
DB_PATH = os.path.join(DATA_DIR, "in_season_store.db")
PLAYERS_JSON = os.path.join(DATA_DIR, "players-data.json")

# In-memory player index cache
_PLAYERS_CACHE: list[dict[str, Any]] | None = None
_PLAYER_BY_NAME: dict[str, dict[str, Any]] | None = None
_SLEEPER_PLAYERS_CACHE: dict[str, dict[str, Any]] | None = None


def get_db_connection(db_path: str = DB_PATH) -> sqlite3.Connection:
    """Creates a connection to the SQLite database, ensuring directory exists."""
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str = DB_PATH) -> None:
    """Initializes the database schema if tables do not exist."""
    conn = get_db_connection(db_path)
    try:
        with conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS leagues (
                    id TEXT PRIMARY KEY,
                    platform TEXT NOT NULL,
                    name TEXT NOT NULL,
                    season TEXT NOT NULL,
                    settings_json TEXT NOT NULL DEFAULT '{}',
                    my_team_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS roster_snapshots (
                    snapshot_date TEXT NOT NULL,
                    league_id TEXT NOT NULL,
                    team_id TEXT NOT NULL,
                    owner_name TEXT NOT NULL DEFAULT '',
                    team_name TEXT NOT NULL DEFAULT '',
                    starters_json TEXT NOT NULL DEFAULT '[]',
                    bench_json TEXT NOT NULL DEFAULT '[]',
                    taxi_json TEXT NOT NULL DEFAULT '[]',
                    ir_json TEXT NOT NULL DEFAULT '[]',
                    points REAL NOT NULL DEFAULT 0.0,
                    wins INTEGER NOT NULL DEFAULT 0,
                    losses INTEGER NOT NULL DEFAULT 0,
                    refreshed_at TEXT NOT NULL,
                    PRIMARY KEY (snapshot_date, league_id, team_id),
                    FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS player_news (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    player_id TEXT,
                    player_name TEXT NOT NULL,
                    headline TEXT NOT NULL,
                    body TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'FantasyDrafter',
                    impact TEXT NOT NULL DEFAULT 'info',
                    timestamp TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS waiver_snapshots (
                    snapshot_date TEXT NOT NULL,
                    league_id TEXT NOT NULL,
                    available_players_json TEXT NOT NULL DEFAULT '[]',
                    refreshed_at TEXT NOT NULL,
                    PRIMARY KEY (snapshot_date, league_id),
                    FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_roster_date ON roster_snapshots(snapshot_date);
                CREATE INDEX IF NOT EXISTS idx_roster_league ON roster_snapshots(league_id);
                CREATE INDEX IF NOT EXISTS idx_news_player ON player_news(player_name);
            """)
    finally:
        conn.close()


def load_players_data() -> list[dict[str, Any]]:
    """Loads player dataset from data/players-data.json with caching."""
    global _PLAYERS_CACHE, _PLAYER_BY_NAME
    if _PLAYERS_CACHE is not None:
        return _PLAYERS_CACHE

    target = (
        PLAYERS_JSON
        if os.path.exists(PLAYERS_JSON)
        else os.path.join(PROJECT_ROOT, "players-data.json")
    )
    if os.path.exists(target):
        try:
            with open(target, encoding="utf-8") as f:
                data = json.load(f)
                _PLAYERS_CACHE = data.get("players", [])
        except Exception:
            _PLAYERS_CACHE = []
    else:
        _PLAYERS_CACHE = []

    _PLAYER_BY_NAME = {}
    for p in _PLAYERS_CACHE:
        n = normalize_name(p.get("name", ""))
        if n and n not in _PLAYER_BY_NAME:
            _PLAYER_BY_NAME[n] = p

    return _PLAYERS_CACHE


def normalize_name(name: str) -> str:
    """Normalizes player name for fuzzy matching across Sleeper/ESPN datasets."""
    s = str(name).lower().strip()
    for char in [".", "'", "’", "-", ",", "/", "`"]:
        s = s.replace(char, "")
    for suffix in [" jr", " sr", " ii", " iii", " iv", " v"]:
        if s.endswith(suffix):
            s = s[: -len(suffix)].strip()
    return " ".join(s.split())


def get_player_by_name(name: str) -> dict[str, Any] | None:
    """Look up player details from consensus dataset."""
    load_players_data()
    if not _PLAYER_BY_NAME:
        return None
    return _PLAYER_BY_NAME.get(normalize_name(name))


# ==============================================================================
# LEAGUE MANAGEMENT
# ==============================================================================


def save_league(
    league_id: str,
    platform: str,
    name: str,
    season: str = "2026",
    settings: dict[str, Any] | None = None,
    my_team_id: str | None = None,
    db_path: str = DB_PATH,
) -> dict[str, Any]:
    """Saves or updates a league in SQLite."""
    init_db(db_path)
    conn = get_db_connection(db_path)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    settings_json = json.dumps(settings or {})

    try:
        with conn:
            conn.execute(
                """
                INSERT INTO leagues (id, platform, name, season, settings_json, my_team_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    platform = excluded.platform,
                    name = excluded.name,
                    season = excluded.season,
                    settings_json = excluded.settings_json,
                    my_team_id = coalesce(excluded.my_team_id, leagues.my_team_id),
                    updated_at = excluded.updated_at
            """,
                (league_id, platform, name, season, settings_json, my_team_id, now, now),
            )
    finally:
        conn.close()

    return {
        "id": league_id,
        "platform": platform,
        "name": name,
        "season": season,
        "my_team_id": my_team_id,
        "updated_at": now,
    }


def get_leagues(db_path: str = DB_PATH) -> list[dict[str, Any]]:
    """Retrieves all registered leagues with team count and latest refresh info."""
    init_db(db_path)
    conn = get_db_connection(db_path)
    results = []
    try:
        cur = conn.execute("SELECT * FROM leagues ORDER BY updated_at DESC")
        rows = cur.fetchall()
        for r in rows:
            league = dict(r)
            league["settings"] = json.loads(league.get("settings_json") or "{}")

            # Check latest snapshot for this league
            snap_cur = conn.execute(
                """
                SELECT count(team_id) as team_count, max(snapshot_date) as latest_date, max(refreshed_at) as last_refreshed
                FROM roster_snapshots
                WHERE league_id = ? AND snapshot_date = (
                    SELECT max(snapshot_date) FROM roster_snapshots WHERE league_id = ?
                )
            """,
                (league["id"], league["id"]),
            )
            snap_info = snap_cur.fetchone()
            league["team_count"] = snap_info["team_count"] if snap_info else 0
            league["latest_snapshot_date"] = snap_info["latest_date"] if snap_info else None
            league["last_refreshed"] = snap_info["last_refreshed"] if snap_info else None
            results.append(league)
    finally:
        conn.close()
    return results


def delete_league(league_id: str, db_path: str = DB_PATH) -> bool:
    """Deletes a league and cascades its snapshots."""
    init_db(db_path)
    conn = get_db_connection(db_path)
    try:
        with conn:
            conn.execute("DELETE FROM roster_snapshots WHERE league_id = ?", (league_id,))
            conn.execute("DELETE FROM waiver_snapshots WHERE league_id = ?", (league_id,))
            cur = conn.execute("DELETE FROM leagues WHERE id = ?", (league_id,))
            return cur.rowcount > 0
    finally:
        conn.close()


# ==============================================================================
# ROSTER SNAPSHOTS (DATE-PARTITIONED HISTORICAL AGGREGATION)
# ==============================================================================


def save_roster_snapshots(
    league_id: str,
    rosters: list[dict[str, Any]],
    snapshot_date: str | None = None,
    db_path: str = DB_PATH,
) -> int:
    """Saves daily roster snapshots.

    Multiple refreshes on the same snapshot_date upsert that day's records,
    while historical entries across different dates are preserved for trend tracking.
    """
    init_db(db_path)
    if not snapshot_date:
        snapshot_date = datetime.date.today().isoformat()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    conn = get_db_connection(db_path)
    inserted_count = 0
    try:
        with conn:
            for r in rosters:
                team_id = str(r.get("team_id", ""))
                if not team_id:
                    continue
                owner_name = str(r.get("owner_name", ""))
                team_name = str(r.get("team_name", ""))
                starters_json = json.dumps(r.get("starters", []))
                bench_json = json.dumps(r.get("bench", []))
                taxi_json = json.dumps(r.get("taxi", []))
                ir_json = json.dumps(r.get("ir", []))
                points = float(r.get("points", 0.0))
                wins = int(r.get("wins", 0))
                losses = int(r.get("losses", 0))

                conn.execute(
                    """
                    INSERT INTO roster_snapshots (
                        snapshot_date, league_id, team_id, owner_name, team_name,
                        starters_json, bench_json, taxi_json, ir_json,
                        points, wins, losses, refreshed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(snapshot_date, league_id, team_id) DO UPDATE SET
                        owner_name = excluded.owner_name,
                        team_name = excluded.team_name,
                        starters_json = excluded.starters_json,
                        bench_json = excluded.bench_json,
                        taxi_json = excluded.taxi_json,
                        ir_json = excluded.ir_json,
                        points = excluded.points,
                        wins = excluded.wins,
                        losses = excluded.losses,
                        refreshed_at = excluded.refreshed_at
                """,
                    (
                        snapshot_date,
                        league_id,
                        team_id,
                        owner_name,
                        team_name,
                        starters_json,
                        bench_json,
                        taxi_json,
                        ir_json,
                        points,
                        wins,
                        losses,
                        now_iso,
                    ),
                )
                inserted_count += 1

            conn.execute(
                "UPDATE leagues SET updated_at = ? WHERE id = ?",
                (now_iso, league_id),
            )
    finally:
        conn.close()

    return inserted_count


def get_roster_snapshots(
    league_id: str,
    snapshot_date: str | None = None,
    db_path: str = DB_PATH,
) -> list[dict[str, Any]]:
    """Retrieves roster snapshots for a league on a given date (or latest available)."""
    init_db(db_path)
    conn = get_db_connection(db_path)
    results = []
    try:
        if not snapshot_date:
            cur_date = conn.execute(
                "SELECT max(snapshot_date) as max_date FROM roster_snapshots WHERE league_id = ?",
                (league_id,),
            )
            row = cur_date.fetchone()
            snapshot_date = row["max_date"] if row and row["max_date"] else None

        if not snapshot_date:
            return []

        cur = conn.execute(
            """
            SELECT * FROM roster_snapshots
            WHERE league_id = ? AND snapshot_date = ?
            ORDER BY wins DESC, points DESC
        """,
            (league_id, snapshot_date),
        )
        for r in cur.fetchall():
            item = dict(r)
            item["starters"] = json.loads(item.get("starters_json") or "[]")
            item["bench"] = json.loads(item.get("bench_json") or "[]")
            item["taxi"] = json.loads(item.get("taxi_json") or "[]")
            item["ir"] = json.loads(item.get("ir_json") or "[]")
            results.append(item)
    finally:
        conn.close()
    return results


def get_roster_history(
    league_id: str,
    team_id: str,
    limit: int = 14,
    db_path: str = DB_PATH,
) -> list[dict[str, Any]]:
    """Retrieves historical snapshots for a team across multiple dates."""
    init_db(db_path)
    conn = get_db_connection(db_path)
    results = []
    try:
        cur = conn.execute(
            """
            SELECT snapshot_date, points, wins, losses, refreshed_at,
                   length(starters_json) as starters_len
            FROM roster_snapshots
            WHERE league_id = ? AND team_id = ?
            ORDER BY snapshot_date ASC
            LIMIT ?
        """,
            (league_id, team_id, limit),
        )
        for r in cur.fetchall():
            results.append(dict(r))
    finally:
        conn.close()
    return results


# ==============================================================================
# PLAYER NEWS AGGREGATOR
# ==============================================================================


def save_player_news(news_list: list[dict[str, Any]], db_path: str = DB_PATH) -> int:
    """Inserts fresh player news items into the database."""
    init_db(db_path)
    conn = get_db_connection(db_path)
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    count = 0
    try:
        with conn:
            for item in news_list:
                p_name = str(item.get("player_name", "")).strip()
                headline = str(item.get("headline", "")).strip()
                if not p_name or not headline:
                    continue
                p_id = str(item.get("player_id", ""))
                body = str(item.get("body", ""))
                source = str(item.get("source", "FantasyDrafter"))
                impact = str(item.get("impact", "info"))
                ts = str(item.get("timestamp", now_iso))

                conn.execute(
                    """
                    INSERT INTO player_news (player_id, player_name, headline, body, source, impact, timestamp, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (p_id, p_name, headline, body, source, impact, ts, now_iso),
                )
                count += 1
    finally:
        conn.close()
    return count


def get_player_news(
    player_names: list[str] | None = None,
    impact: str | None = None,
    limit: int = 50,
    db_path: str = DB_PATH,
) -> list[dict[str, Any]]:
    """Retrieves player news items, optionally filtered by player names or impact category."""
    init_db(db_path)
    conn = get_db_connection(db_path)
    results = []
    try:
        query = "SELECT * FROM player_news"
        params: list[Any] = []
        conditions = []

        if impact:
            conditions.append("impact = ?")
            params.append(impact)

        if player_names:
            normalized_targets = {normalize_name(n) for n in player_names if n}
            # Fetch candidates and filter in Python for robust fuzzy name matching
            if conditions:
                query += " WHERE " + " AND ".join(conditions)
            query += " ORDER BY timestamp DESC LIMIT 200"
            cur = conn.execute(query, params)
            for r in cur.fetchall():
                d = dict(r)
                if normalize_name(d["player_name"]) in normalized_targets:
                    results.append(d)
                    if len(results) >= limit:
                        break
            return results

        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        cur = conn.execute(query, params)
        for r in cur.fetchall():
            results.append(dict(r))
    finally:
        conn.close()
    return results


# ==============================================================================
# WAIVER SNAPSHOTS & CROSS-LEAGUE WAIVER MATRIX
# ==============================================================================


def save_waiver_snapshot(
    league_id: str,
    available_players: list[dict[str, Any] | str],
    snapshot_date: str | None = None,
    db_path: str = DB_PATH,
) -> None:
    """Stores available free agents in a league for waiver wire calculations."""
    init_db(db_path)
    if not snapshot_date:
        snapshot_date = datetime.date.today().isoformat()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    conn = get_db_connection(db_path)
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO waiver_snapshots (snapshot_date, league_id, available_players_json, refreshed_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(snapshot_date, league_id) DO UPDATE SET
                    available_players_json = excluded.available_players_json,
                    refreshed_at = excluded.refreshed_at
            """,
                (snapshot_date, league_id, json.dumps(available_players), now_iso),
            )
    finally:
        conn.close()


def get_waiver_matrix(
    limit: int = 50,
    db_path: str = DB_PATH,
) -> list[dict[str, Any]]:
    """Calculates cross-league waiver wire recommendations.

    Aggregates top unowned players across all configured leagues, ranks them
    by consensus score and trending value, tags which leagues they are available in,
    and highlights direct team need matches (e.g. injured starter holes).
    """
    init_db(db_path)
    leagues = get_leagues(db_path)
    if not leagues:
        return []

    conn = get_db_connection(db_path)
    league_rosters: dict[str, list[dict[str, Any]]] = {}
    league_my_teams: dict[str, dict[str, Any] | None] = {}
    league_free_agents: dict[str, set[str]] = {}

    try:
        for lg in leagues:
            lid = lg["id"]
            rosters = get_roster_snapshots(lid, db_path=db_path)
            league_rosters[lid] = rosters

            my_team_id = lg.get("my_team_id")
            my_team = next((r for r in rosters if str(r["team_id"]) == str(my_team_id)), None)
            if not my_team and rosters:
                # Default to first team if not explicitly tagged
                my_team = rosters[0]
            league_my_teams[lid] = my_team

            # Check waiver snapshot
            cur = conn.execute(
                """
                SELECT available_players_json FROM waiver_snapshots
                WHERE league_id = ? ORDER BY snapshot_date DESC LIMIT 1
            """,
                (lid,),
            )
            row = cur.fetchone()
            if row and row["available_players_json"]:
                raw_avail = json.loads(row["available_players_json"])
                avail_names = set()
                for item in raw_avail:
                    name = item.get("name") if isinstance(item, dict) else str(item)
                    if name:
                        avail_names.add(normalize_name(name))
                league_free_agents[lid] = avail_names
            else:
                # Compute free agents from all drafted/owned players in rosters
                owned_names = set()
                for r in rosters:
                    for group in [
                        r.get("starters", []),
                        r.get("bench", []),
                        r.get("taxi", []),
                        r.get("ir", []),
                    ]:
                        for p in group:
                            name = p.get("name") if isinstance(p, dict) else str(p)
                            if name:
                                owned_names.add(normalize_name(name))
                league_free_agents[lid] = owned_names  # Inverse will be evaluated against pool
    finally:
        conn.close()

    # Load master player pool
    pool = load_players_data()
    recommendations = []

    for p in pool:
        p_name = p.get("name", "")
        norm = normalize_name(p_name)
        if not norm:
            continue

        available_in: list[dict[str, str]] = []
        need_matches: list[dict[str, str]] = []

        for lg in leagues:
            lid = lg["id"]
            lname = lg["name"]
            is_avail = False

            # If explicit waiver snapshot exists
            if (
                lid in league_free_agents
                and isinstance(league_free_agents[lid], set)
                and len(league_free_agents[lid]) > 0
            ):
                # Check if this set contains free agents or owned agents
                cur_set = league_free_agents[lid]
                is_avail = True if norm in cur_set else norm not in cur_set

            if is_avail:
                available_in.append({"league_id": lid, "league_name": lname})

                # Check if this player fulfills a direct need for my team in this league
                my_t = league_my_teams.get(lid)
                if my_t:
                    pos = p.get("pos", "").upper()
                    # Check for injured starters at that position
                    starters = my_t.get("starters", [])
                    has_injured_starter = any(
                        s.get("pos") == pos
                        and s.get("injury")
                        and s.get("injury", {}).get("status") in ("OUT", "IR", "DOUBTFUL")
                        for s in starters
                        if isinstance(s, dict)
                    )
                    starter_count_at_pos = sum(
                        1 for s in starters if isinstance(s, dict) and s.get("pos") == pos
                    )

                    if has_injured_starter:
                        need_matches.append(
                            {
                                "league_id": lid,
                                "league_name": lname,
                                "reason": f"Fills injured {pos} starter hole",
                            }
                        )
                    elif starter_count_at_pos == 0 and pos in ("QB", "TE", "K", "DST"):
                        need_matches.append(
                            {
                                "league_id": lid,
                                "league_name": lname,
                                "reason": f"Fills empty {pos} slot",
                            }
                        )

        if available_in:
            recommendations.append(
                {
                    "player": p,
                    "name": p_name,
                    "pos": p.get("pos", ""),
                    "team": p.get("team", ""),
                    "score": p.get("score", 0),
                    "rank": p.get("rank", 999),
                    "dynSF": p.get("dynSF"),
                    "redraft": p.get("redraft"),
                    "injury": p.get("injury"),
                    "available_in": available_in,
                    "available_count": len(available_in),
                    "need_matches": need_matches,
                    "is_priority": len(need_matches) > 0 or p.get("score", 0) > 60,
                }
            )

    def _rec_sort_key(item: dict[str, Any]) -> tuple[bool, int, float, float]:
        matches = item.get("need_matches")
        has_needs = bool(matches and isinstance(matches, list) and len(matches) > 0)
        avail = int(item.get("available_count", 0))
        score = float(item.get("score") or 0.0)
        rank_val = float(item.get("rank") or 999.0)
        return (has_needs, avail, score, -rank_val)

    # Sort recommendations: first by presence of need matches, then score/rank
    recommendations.sort(key=_rec_sort_key, reverse=True)

    return recommendations[:limit]


# ==============================================================================
# LINEUP OPTIMIZATION & TEAM VIEW HUB
# ==============================================================================


def get_team_view_data(
    league_id: str,
    team_id: str | None = None,
    db_path: str = DB_PATH,
) -> dict[str, Any]:
    """Provides complete Team View details: starters, bench, IR, taxi,

    injury alerts, start/sit optimization recommendations, and drop candidates.
    """
    init_db(db_path)
    rosters = get_roster_snapshots(league_id, db_path=db_path)
    if not rosters:
        return {"error": f"No roster data found for league {league_id}"}

    leagues = get_leagues(db_path)
    cur_league = next((lg for lg in leagues if lg["id"] == league_id), None)
    target_team_id = team_id or (cur_league.get("my_team_id") if cur_league else None)

    my_roster = next((r for r in rosters if str(r["team_id"]) == str(target_team_id)), None)
    if not my_roster:
        my_roster = rosters[0]

    # Enrich players with master ranking, depth chart, injury, and schedule data
    def enrich_player(p_raw: Any) -> dict[str, Any]:
        if isinstance(p_raw, dict):
            name = p_raw.get("name", "")
            base = get_player_by_name(name) or {}
            merged = dict(base)
            merged.update(p_raw)
            return merged
        name = str(p_raw)
        base = get_player_by_name(name) or {"name": name, "pos": "FLEX", "team": "FA"}
        return dict(base)

    starters = [enrich_player(p) for p in my_roster.get("starters", [])]
    bench = [enrich_player(p) for p in my_roster.get("bench", [])]
    taxi = [enrich_player(p) for p in my_roster.get("taxi", [])]
    ir = [enrich_player(p) for p in my_roster.get("ir", [])]

    # 1. Start/Sit Optimization Advice
    start_sit_advice = []
    # Identify bench players who outrank or outscore starting players at same pos / flex
    for b in bench:
        b_pos = b.get("pos", "")
        b_score = float(b.get("score") or (1000 - int(b.get("rank", 999))))
        b_status = b.get("injury", {}).get("status") if isinstance(b.get("injury"), dict) else None

        if b_status in ("OUT", "IR"):
            continue

        for s in starters:
            s_pos = s.get("pos", "")
            s_score = float(s.get("score") or (1000 - int(s.get("rank", 999))))
            s_status = (
                s.get("injury", {}).get("status") if isinstance(s.get("injury"), dict) else None
            )

            # High alert: Starter is OUT/IR while bench player is active
            if s_status in ("OUT", "IR"):
                start_sit_advice.append(
                    {
                        "type": "INJURY_SUB",
                        "severity": "high",
                        "bench_player": b.get("name"),
                        "bench_pos": b_pos,
                        "starter_player": s.get("name"),
                        "starter_pos": s_pos,
                        "message": f"🚨 Starter {s.get('name')} is {s_status}! Swap in {b.get('name')} from bench.",
                    }
                )
                break

            # Upgrade recommendation: Bench player has significantly higher rank/score
            if (b_pos == s_pos or s_pos in ("FLEX", "SUPERFLEX")) and b_score > (s_score + 15):
                start_sit_advice.append(
                    {
                        "type": "UPGRADE_START",
                        "severity": "medium",
                        "bench_player": b.get("name"),
                        "starter_player": s.get("name"),
                        "message": f"💡 Consider starting {b.get('name')} ({b_pos}) over {s.get('name')} based on score/matchup edge.",
                    }
                )
                break

    # 2. Drop Candidates (lowest score bench assets with no keeper/dynasty upside)
    bench_ranked = sorted(
        bench,
        key=lambda x: float(x.get("score") or (1000 - int(x.get("rank", 999)))),
    )
    drop_candidates = []
    for cand in bench_ranked[:3]:
        drop_candidates.append(
            {
                "name": cand.get("name"),
                "pos": cand.get("pos"),
                "team": cand.get("team"),
                "rank": cand.get("rank"),
                "score": cand.get("score"),
                "reason": "Lowest rest-of-season projected value on bench",
            }
        )

    # 3. Aggregated news for players on this team
    team_player_names = [p.get("name", "") for p in starters + bench + taxi + ir if p.get("name")]
    team_news = get_player_news(player_names=team_player_names, limit=15, db_path=db_path)

    return {
        "league_id": league_id,
        "team_id": my_roster.get("team_id"),
        "team_name": my_roster.get("team_name") or f"Team {my_roster.get('team_id')}",
        "owner_name": my_roster.get("owner_name"),
        "points": my_roster.get("points"),
        "wins": my_roster.get("wins"),
        "losses": my_roster.get("losses"),
        "starters": starters,
        "bench": bench,
        "taxi": taxi,
        "ir": ir,
        "start_sit_advice": start_sit_advice[:5],
        "drop_candidates": drop_candidates,
        "news": team_news,
    }


# ==============================================================================
# POWER RANKINGS & TRADE MATCHMAKER
# ==============================================================================


def get_league_power_rankings(
    league_id: str,
    snapshot_date: str | None = None,
    db_path: str = DB_PATH,
) -> dict[str, Any]:
    """Calculates league power rankings with starter grades, depth scores,

    positional room percentiles, and complementary trade partner matching.
    """
    init_db(db_path)
    rosters = get_roster_snapshots(league_id, snapshot_date=snapshot_date, db_path=db_path)
    if not rosters:
        return {"error": f"No rosters available for league {league_id}"}

    leagues = get_leagues(db_path)
    cur_league = next((lg for lg in leagues if lg["id"] == league_id), None)
    my_team_id = cur_league.get("my_team_id") if cur_league else None

    # Load master player dictionary
    load_players_data()

    team_evaluations = []
    league_pos_scores: dict[str, list[float]] = {
        "QB": [],
        "RB": [],
        "WR": [],
        "TE": [],
    }

    for r in rosters:
        starters = r.get("starters", [])
        bench = r.get("bench", [])

        pos_totals: dict[str, float] = {"QB": 0.0, "RB": 0.0, "WR": 0.0, "TE": 0.0}
        pos_counts: dict[str, int] = {"QB": 0, "RB": 0, "WR": 0, "TE": 0}
        starter_scores = []
        bench_scores = []

        for p in starters:
            name = p.get("name") if isinstance(p, dict) else str(p)
            info = get_player_by_name(name) or {}
            sc = float(info.get("score") or (1000 - int(info.get("rank", 999))))
            pos = str(info.get("pos") or p.get("pos", "")).upper()
            starter_scores.append(sc)
            if pos in pos_totals:
                pos_totals[pos] += sc
                pos_counts[pos] += 1

        for p in bench:
            name = p.get("name") if isinstance(p, dict) else str(p)
            info = get_player_by_name(name) or {}
            sc = float(info.get("score") or (1000 - int(info.get("rank", 999))))
            pos = str(info.get("pos") or p.get("pos", "")).upper()
            bench_scores.append(sc)
            if pos in pos_totals:
                pos_totals[pos] += sc * 0.5  # Weight bench assets at 50%
                pos_counts[pos] += 1

        starter_power = sum(starter_scores)
        depth_power = sum(bench_scores)
        composite_score = starter_power * 0.7 + depth_power * 0.3

        team_pos_totals: dict[str, float] = dict(pos_totals)
        t_id_str = str(r.get("team_id", ""))
        team_evaluations.append(
            {
                "team_id": t_id_str,
                "team_name": r.get("team_name") or f"Team {t_id_str}",
                "owner_name": r.get("owner_name", ""),
                "wins": r.get("wins", 0),
                "losses": r.get("losses", 0),
                "points": r.get("points", 0.0),
                "starter_score": round(starter_power, 1),
                "depth_score": round(depth_power, 1),
                "composite_score": round(composite_score, 1),
                "pos_totals": team_pos_totals,
                "power_rank": 0,
                "tier": "Bubble",
                "tier_color": "warn",
                "room_grades": {},
                "is_my_team": t_id_str == str(my_team_id),
            }
        )

    def _team_sort_key(item: dict[str, Any]) -> float:
        val = item.get("composite_score")
        if isinstance(val, (int, float)):
            return float(val)
        return 0.0

    # Sort by composite power score
    team_evaluations.sort(key=_team_sort_key, reverse=True)

    # Assign ranks and tiers
    total_teams = len(team_evaluations)
    team_room_grades: dict[str, dict[str, dict[str, Any]]] = {}

    for idx, t in enumerate(team_evaluations):
        t_id = str(t.get("team_id", ""))
        rank = idx + 1
        t["power_rank"] = rank
        if rank <= max(1, int(total_teams * 0.25)):
            t["tier"] = "Contender"
            t["tier_color"] = "good"
        elif rank <= max(2, int(total_teams * 0.50)):
            t["tier"] = "Playoff Lock"
            t["tier_color"] = "accent"
        elif rank <= max(3, int(total_teams * 0.75)):
            t["tier"] = "Bubble"
            t["tier_color"] = "warn"
        else:
            t["tier"] = "Rebuilder"
            t["tier_color"] = "bad"

        # Calculate positional room percentiles
        t_grades: dict[str, dict[str, Any]] = {}
        pt = t.get("pos_totals")
        pt_dict: dict[str, float] = pt if isinstance(pt, dict) else {}

        for pos in ("QB", "RB", "WR", "TE"):
            all_scores = sorted(league_pos_scores[pos])
            val = float(pt_dict.get(pos, 0.0))
            less_count = sum(1 for s in all_scores if s < val)
            percentile = (
                int((less_count / max(1, len(all_scores) - 1)) * 100) if len(all_scores) > 1 else 50
            )

            if percentile >= 80:
                letter = "A"
            elif percentile >= 60:
                letter = "B"
            elif percentile >= 40:
                letter = "C"
            else:
                letter = "D"

            t_grades[pos] = {
                "percentile": percentile,
                "grade": letter,
                "score": round(val, 1),
            }

        team_room_grades[t_id] = t_grades
        t["room_grades"] = t_grades

    # Trade Matchmaker: find teams with complementary surplus and deficits
    my_eval = next((t for t in team_evaluations if t.get("is_my_team")), team_evaluations[0])
    my_id = str(my_eval.get("team_id", ""))
    trade_recommendations = []

    # Identify my strongest position (surplus) and weakest position (deficit)
    my_grades = team_room_grades.get(my_id, {})
    sorted_my_rooms = sorted(
        my_grades.items(),
        key=lambda item: int(item[1].get("percentile", 0)),
        reverse=True,
    )
    my_surplus_pos = sorted_my_rooms[0][0] if sorted_my_rooms else "WR"
    my_deficit_pos = sorted_my_rooms[-1][0] if sorted_my_rooms else "RB"

    for opp in team_evaluations:
        opp_id = str(opp.get("team_id", ""))
        if opp_id == my_id:
            continue
        opp_grades = team_room_grades.get(opp_id, {})
        opp_deficit_room = opp_grades.get(my_deficit_pos, {})
        opp_surplus_room = opp_grades.get(my_surplus_pos, {})
        my_surplus_room = my_grades.get(my_surplus_pos, {})

        if (
            int(opp_deficit_room.get("percentile", 0)) >= 60
            and int(opp_surplus_room.get("percentile", 0)) <= 40
        ):
            trade_recommendations.append(
                {
                    "target_team_id": opp_id,
                    "target_team_name": str(opp.get("team_name", f"Team {opp_id}")),
                    "target_owner": str(opp.get("owner_name", "")),
                    "my_give_pos": my_surplus_pos,
                    "my_receive_pos": my_deficit_pos,
                    "rationale": (
                        f"Win-Win Fit: You have a surplus at {my_surplus_pos} "
                        f"({my_surplus_room.get('grade', 'B')}) where they are weak ({opp_surplus_room.get('grade', 'D')}), "
                        f"while they have depth at {my_deficit_pos} ({opp_deficit_room.get('grade', 'A')}) where you need help."
                    ),
                }
            )

    return {
        "league_id": league_id,
        "total_teams": total_teams,
        "teams": team_evaluations,
        "my_team": my_eval,
        "trade_matches": trade_recommendations[:4],
    }


# ==============================================================================
# SLEEPER & ESPN PLATFORM SYNC ADAPTERS
# ==============================================================================


def extract_sleeper_league_id(raw_id: str | int | None) -> str:
    """Extracts numeric Sleeper league ID from a raw ID, prefixed string, or full URL."""
    s = str(raw_id or "").strip()
    match = re.search(r"(\d{15,22})", s)
    return match.group(1) if match else s.replace("sleeper_", "").strip()


def load_sleeper_players(cache_dir: str | None = None) -> dict[str, dict[str, Any]]:
    """Loads or fetches Sleeper NFL player database mapping sleeper_id -> player info."""
    global _SLEEPER_PLAYERS_CACHE
    if _SLEEPER_PLAYERS_CACHE is not None and len(_SLEEPER_PLAYERS_CACHE) > 0:
        return _SLEEPER_PLAYERS_CACHE

    c_dir = cache_dir or os.path.join(PROJECT_ROOT, "data")
    cache_file = os.path.join(c_dir, "sleeper_players_cache.json")

    # 1. Try loading from local cache file if available
    if os.path.exists(cache_file):
        try:
            with open(cache_file, encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict) and len(loaded) > 0:
                    _SLEEPER_PLAYERS_CACHE = loaded
                    return _SLEEPER_PLAYERS_CACHE
        except Exception:
            pass

    # 2. Fetch from Sleeper API
    try:
        url = "https://api.sleeper.app/v1/players/nfl"
        req = urllib.request.Request(url, headers={"User-Agent": "FantasyDrafter/1.1"})
        with urllib.request.urlopen(req, timeout=15) as res:
            raw = json.loads(res.read().decode("utf-8"))
            if isinstance(raw, dict):
                _SLEEPER_PLAYERS_CACHE = raw
                try:
                    os.makedirs(c_dir, exist_ok=True)
                    with open(cache_file, "w", encoding="utf-8") as f:
                        json.dump(raw, f)
                except Exception:
                    pass
                return _SLEEPER_PLAYERS_CACHE
    except Exception as e:
        print(f"Warning: Could not fetch Sleeper player dictionary: {e}")

    _SLEEPER_PLAYERS_CACHE = {}
    return _SLEEPER_PLAYERS_CACHE


def discover_sleeper_leagues(
    username: str,
    season: str | None = None,
) -> list[dict[str, Any]]:
    """Fetches user ID and auto-discovers all NFL leagues for a Sleeper username."""
    user_url = f"https://api.sleeper.app/v1/user/{urllib.parse.quote(username.strip())}"
    req = urllib.request.Request(user_url, headers={"User-Agent": "FantasyDrafter/1.1"})

    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            user_data = json.loads(res.read().decode("utf-8"))
    except Exception as e:
        raise RuntimeError(f"Could not find Sleeper user '{username}': {e}") from e

    user_id = user_data.get("user_id")
    if not user_id:
        raise RuntimeError(f"Invalid Sleeper user response for '{username}'")

    seasons_to_check: list[str] = [season] if season else []
    for s_candidate in ["2026", "2025", "2024"]:
        if s_candidate not in seasons_to_check:
            seasons_to_check.append(s_candidate)

    discovered = []
    seen_ids = set()

    for s_year in seasons_to_check:
        leagues_url = f"https://api.sleeper.app/v1/user/{user_id}/leagues/nfl/{s_year}"
        req2 = urllib.request.Request(leagues_url, headers={"User-Agent": "FantasyDrafter/1.1"})
        try:
            with urllib.request.urlopen(req2, timeout=10) as res:
                leagues_data = json.loads(res.read().decode("utf-8"))
                if isinstance(leagues_data, list):
                    for lg in leagues_data:
                        lid = lg.get("league_id")
                        if lid and str(lid) not in seen_ids:
                            seen_ids.add(str(lid))
                            discovered.append(
                                {
                                    "id": f"sleeper_{lid}",
                                    "remote_id": str(lid),
                                    "platform": "sleeper",
                                    "name": lg.get("name", "Sleeper League"),
                                    "season": lg.get("season", s_year),
                                    "teams": lg.get("total_rosters", 12),
                                    "scoring": lg.get("scoring_settings", {}),
                                    "roster_positions": lg.get("roster_positions", []),
                                    "status": lg.get("status"),
                                }
                            )
                    if discovered and season:
                        break
        except Exception:
            continue

    return discovered


def sync_sleeper_league(
    remote_league_id: str | int,
    my_username: str | None = None,
    db_path: str = DB_PATH,
    target_league_id: str | None = None,
) -> dict[str, Any]:
    """Syncs a Sleeper league's rosters, users, and standings into SQLite."""
    clean_id = extract_sleeper_league_id(str(remote_league_id))
    if not clean_id:
        return {"ok": False, "error": f"Invalid Sleeper league ID '{remote_league_id}'"}

    # 1. Fetch league metadata
    league_url = f"https://api.sleeper.app/v1/league/{clean_id}"
    req = urllib.request.Request(league_url, headers={"User-Agent": "FantasyDrafter/1.1"})
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            lg_data = json.loads(res.read().decode("utf-8"))
    except Exception as e:
        return {"ok": False, "error": f"Could not fetch Sleeper league {clean_id}: {e}"}

    # 2. Fetch users
    users_url = f"https://api.sleeper.app/v1/league/{clean_id}/users"
    req_u = urllib.request.Request(users_url, headers={"User-Agent": "FantasyDrafter/1.1"})
    try:
        with urllib.request.urlopen(req_u, timeout=10) as res:
            users_data = json.loads(res.read().decode("utf-8"))
    except Exception:
        users_data = []

    user_map = {}
    my_user_id = None
    for u in users_data:
        uid = u.get("user_id")
        dname = u.get("display_name", "")
        tname = u.get("metadata", {}).get("team_name") or dname
        user_map[uid] = {"display_name": dname, "team_name": tname}
        if my_username and (
            normalize_name(dname) == normalize_name(my_username)
            or normalize_name(tname) == normalize_name(my_username)
        ):
            my_user_id = uid

    # 3. Fetch rosters
    rosters_url = f"https://api.sleeper.app/v1/league/{clean_id}/rosters"
    req_r = urllib.request.Request(rosters_url, headers={"User-Agent": "FantasyDrafter/1.1"})
    try:
        with urllib.request.urlopen(req_r, timeout=10) as res:
            rosters_data = json.loads(res.read().decode("utf-8"))
    except Exception as e:
        return {"ok": False, "error": f"Could not fetch Sleeper rosters: {e}"}

    load_players_data()
    sleeper_player_dict = load_sleeper_players()

    roster_rows = []
    my_team_id = None

    for r in rosters_data:
        roster_id = str(r.get("roster_id", ""))
        owner_id = r.get("owner_id")
        user_info = user_map.get(owner_id, {})
        owner_name = user_info.get("display_name", f"Team {roster_id}")
        team_name = user_info.get("team_name", owner_name)

        if (owner_id and owner_id == my_user_id) or (
            my_username
            and (
                my_username == roster_id
                or normalize_name(owner_name) == normalize_name(my_username)
                or normalize_name(team_name) == normalize_name(my_username)
            )
        ):
            my_team_id = roster_id

        starters_raw = r.get("starters") or []
        players_raw = r.get("players") or []
        taxi_raw = r.get("taxi") or []
        reserve_raw = r.get("reserve") or []

        def resolve_player(pid: Any) -> dict[str, Any]:
            pid_str = str(pid).strip()
            # 1. Lookup in Sleeper player dictionary
            sp = sleeper_player_dict.get(pid_str, {})
            pname = (
                sp.get("full_name")
                or f"{sp.get('first_name', '')} {sp.get('last_name', '')}".strip()
                or sp.get("name")
            )
            ppos = sp.get("position") or "FLEX"
            if ppos == "DEF":
                ppos = "DST"
            pteam = sp.get("team") or "FA"

            # 2. Match against consensus dataset
            if pname:
                consensus_match = get_player_by_name(pname)
                if consensus_match:
                    item = dict(consensus_match)
                    item["id"] = pid_str
                    return item
                return {
                    "id": pid_str,
                    "name": pname,
                    "pos": ppos,
                    "team": pteam,
                    "rank": 999,
                    "score": 50,
                }

            # 3. Fallback to name search directly
            consensus_match = get_player_by_name(pid_str)
            if consensus_match:
                item = dict(consensus_match)
                item["id"] = pid_str
                return item

            return {"id": pid_str, "name": f"Player {pid_str}", "pos": ppos, "team": pteam}

        starters = [resolve_player(pid) for pid in starters_raw if pid]
        starters_set = set(str(p) for p in starters_raw if p)
        taxi_set = set(str(p) for p in taxi_raw if p)
        reserve_set = set(str(p) for p in reserve_raw if p)

        bench_ids = [
            pid
            for pid in players_raw
            if str(pid) not in starters_set
            and str(pid) not in taxi_set
            and str(pid) not in reserve_set
        ]
        bench = [resolve_player(pid) for pid in bench_ids]
        taxi = [resolve_player(pid) for pid in taxi_raw]
        ir = [resolve_player(pid) for pid in reserve_raw]

        settings_meta = r.get("settings", {})
        wins = int(settings_meta.get("wins", 0))
        losses = int(settings_meta.get("losses", 0))
        fpts = (
            float(settings_meta.get("fpts", 0))
            + float(settings_meta.get("fpts_decimal", 0)) / 100.0
        )

        roster_rows.append(
            {
                "team_id": roster_id,
                "owner_name": owner_name,
                "team_name": team_name,
                "starters": starters,
                "bench": bench,
                "taxi": taxi,
                "ir": ir,
                "wins": wins,
                "losses": losses,
                "points": round(fpts, 2),
            }
        )

    # Save league and snapshots
    local_lid = target_league_id or f"sleeper_{clean_id}"
    new_settings = {
        "platformLeagueId": clean_id,
        "total_rosters": lg_data.get("total_rosters"),
        "roster_positions": lg_data.get("roster_positions"),
        "scoring_settings": lg_data.get("scoring_settings"),
    }
    existing_list = get_leagues(db_path=db_path)
    existing_league = next((lg for lg in existing_list if lg.get("id") == local_lid), None)
    if existing_league and existing_league.get("settings"):
        merged = dict(existing_league["settings"])
        merged.update(new_settings)
        new_settings = merged

    save_league(
        league_id=local_lid,
        platform="sleeper",
        name=lg_data.get("name", "Sleeper League"),
        season=str(lg_data.get("season", "2026")),
        settings=new_settings,
        my_team_id=my_team_id or "1",
        db_path=db_path,
    )
    save_roster_snapshots(local_lid, roster_rows, db_path=db_path)

    return {
        "ok": True,
        "league_id": local_lid,
        "remote_league_id": clean_id,
        "name": lg_data.get("name"),
        "teams_synced": len(roster_rows),
        "my_team_id": my_team_id or "1",
    }


# ==============================================================================
# SEED / DEMO LEAGUE GENERATOR
# ==============================================================================


def seed_demo_data(db_path: str = DB_PATH) -> dict[str, Any]:
    """Populates realistic demo Sleeper and ESPN leagues with 12 teams each,

    historical snapshots across 2 dates (to demonstrate daily aggregation),
    live injury badges, news feed updates, and waiver wire recommendations.
    """
    init_db(db_path)
    pool = load_players_data()
    if not pool:
        # Fallback minimal pool if players dataset is empty
        pool = [
            {
                "name": "Patrick Mahomes",
                "pos": "QB",
                "team": "KC",
                "rank": 15,
                "score": 88,
                "bye": 6,
            },
            {
                "name": "Christian McCaffrey",
                "pos": "RB",
                "team": "SF",
                "rank": 3,
                "score": 96,
                "bye": 9,
                "injury": {"status": "QUESTIONABLE", "detail": "Calf tightness"},
            },
            {
                "name": "Justin Jefferson",
                "pos": "WR",
                "team": "MIN",
                "rank": 2,
                "score": 97,
                "bye": 6,
            },
            {
                "name": "CeeDee Lamb",
                "pos": "WR",
                "team": "DAL",
                "rank": 4,
                "score": 95,
                "bye": 7,
            },
            {"name": "Travis Kelce", "pos": "TE", "team": "KC", "rank": 32, "score": 82, "bye": 6},
            {
                "name": "Breece Hall",
                "pos": "RB",
                "team": "NYJ",
                "rank": 5,
                "score": 94,
                "bye": 12,
            },
            {
                "name": "Amon-Ra St. Brown",
                "pos": "WR",
                "team": "DET",
                "rank": 6,
                "score": 93,
                "bye": 5,
            },
            {
                "name": "Josh Allen",
                "pos": "QB",
                "team": "BUF",
                "rank": 8,
                "score": 91,
                "bye": 12,
            },
            {
                "name": "Tua Tagovailoa",
                "pos": "QB",
                "team": "MIA",
                "rank": 65,
                "score": 72,
                "bye": 6,
                "injury": {"status": "OUT", "detail": "Concussion protocol"},
            },
            {"name": "Sam LaPorta", "pos": "TE", "team": "DET", "rank": 28, "score": 84, "bye": 5},
            {
                "name": "Kyren Williams",
                "pos": "RB",
                "team": "LAR",
                "rank": 14,
                "score": 89,
                "bye": 6,
            },
            {"name": "Puka Nacua", "pos": "WR", "team": "LAR", "rank": 12, "score": 90, "bye": 6},
        ]

    # Partition players into 12 demo rosters
    today_date = datetime.date.today().isoformat()
    yesterday_date = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()

    # 1. League 1: Sleeper Dynasty Superflex
    lid_sleeper = "league_demo_sleeper_dynasty"
    save_league(
        league_id=lid_sleeper,
        platform="sleeper",
        name="🏆 Apex Dynasty Superflex",
        season="2026",
        settings={"qbFormat": "sf", "teams": 12, "scoring": "half"},
        my_team_id="1",
        db_path=db_path,
    )

    team_names = [
        "Your Superflex Empire",
        "Gridiron Gods",
        "Windy City Blitz",
        "Bay Area Ballers",
        "Motor City Lions",
        "Gotham Giants",
        "Lone Star Cowboys",
        "Mile High Magic",
        "Steel City Strikers",
        "Philly Phantoms",
        "Neon Knights",
        "Red Zone Renegades",
    ]

    demo_rosters_yesterday = []
    demo_rosters_today = []

    for i in range(12):
        t_id = str(i + 1)
        # Select players from pool for this team
        p_offset = (i * 7) % max(1, len(pool) - 10)
        t_players = [dict(p) for p in pool[p_offset : p_offset + 10]]
        starters: list[dict[str, Any]] = [dict(p) for p in t_players[:6]]
        bench: list[dict[str, Any]] = [dict(p) for p in t_players[6:9]]
        taxi: list[dict[str, Any]] = [dict(p) for p in t_players[9:10]]

        # Team 1 has an injured starter to verify Start/Sit advice
        if t_id == "1" and starters:
            starters[0]["injury"] = {"status": "OUT", "detail": "Hamstring strain - Ruled OUT"}

        demo_rosters_yesterday.append(
            {
                "team_id": t_id,
                "owner_name": "You" if t_id == "1" else f"Manager {t_id}",
                "team_name": team_names[i],
                "starters": starters,
                "bench": bench,
                "taxi": taxi,
                "ir": [],
                "wins": max(0, 3 - (i % 3)),
                "losses": i % 3,
                "points": round(380.5 + (12 - i) * 15.2, 1),
            }
        )

        demo_rosters_today.append(
            {
                "team_id": t_id,
                "owner_name": "You" if t_id == "1" else f"Manager {t_id}",
                "team_name": team_names[i],
                "starters": starters,
                "bench": bench,
                "taxi": taxi,
                "ir": [],
                "wins": max(0, 4 - (i % 3)),
                "losses": i % 3,
                "points": round(512.8 + (12 - i) * 18.4, 1),
            }
        )

    # Save historical snapshot for yesterday and current snapshot for today
    save_roster_snapshots(
        lid_sleeper, demo_rosters_yesterday, snapshot_date=yesterday_date, db_path=db_path
    )
    save_roster_snapshots(
        lid_sleeper, demo_rosters_today, snapshot_date=today_date, db_path=db_path
    )

    # 2. League 2: ESPN Redraft League
    lid_espn = "league_demo_espn_redraft"
    save_league(
        league_id=lid_espn,
        platform="espn",
        name="🏈 Champions Redraft PPR",
        season="2026",
        settings={"qbFormat": "1qb", "teams": 12, "scoring": "ppr"},
        my_team_id="2",
        db_path=db_path,
    )

    espn_rosters = []
    for i in range(12):
        t_id = str(i + 1)
        p_offset = ((i + 3) * 6) % max(1, len(pool) - 8)
        t_players = pool[p_offset : p_offset + 8]
        espn_rosters.append(
            {
                "team_id": t_id,
                "owner_name": "You" if t_id == "2" else f"Coach {t_id}",
                "team_name": f"ESPN Squad {t_id}",
                "starters": t_players[:5],
                "bench": t_players[5:8],
                "taxi": [],
                "ir": [],
                "wins": max(0, 3 - ((i + 1) % 3)),
                "losses": (i + 1) % 3,
                "points": round(410.2 + (12 - i) * 12.0, 1),
            }
        )
    save_roster_snapshots(lid_espn, espn_rosters, snapshot_date=today_date, db_path=db_path)

    # 3. Seed Realistic News Items for Owned Players
    demo_news = [
        {
            "player_name": pool[0].get("name", "Patrick Mahomes"),
            "headline": f"{pool[0].get('name')} sharp in Wednesday team practice",
            "body": "Looked fully in sync with first-team receivers and threw with high velocity during red-zone drills.",
            "source": "Rotowire",
            "impact": "outlook",
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        },
        {
            "player_name": pool[1].get("name", "Christian McCaffrey"),
            "headline": f"ALERT: {pool[1].get('name')} limited with calf tightness",
            "body": "Held out of 11-on-11 scrimmages as a precautionary measure. Head coach expects him to be a game-time decision.",
            "source": "ESPN NFL",
            "impact": "injury",
            "timestamp": (
                datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=2)
            ).isoformat(),
        },
        {
            "player_name": pool[2].get("name", "Justin Jefferson"),
            "headline": f"{pool[2].get('name')} projected for double-digit targets vs secondary",
            "body": "Matchup preview indicates Minnesota will feature Jefferson heavily out of the slot against favorable coverage.",
            "source": "FantasyDrafter",
            "impact": "outlook",
            "timestamp": (
                datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=5)
            ).isoformat(),
        },
        {
            "player_name": pool[3].get("name", "CeeDee Lamb"),
            "headline": f"BREAKING: {pool[3].get('name')} fully cleared from protocol",
            "body": "Officially removed from injury report and will start without any snap restrictions this weekend.",
            "source": "NFL Media",
            "impact": "breaking",
            "timestamp": (
                datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=8)
            ).isoformat(),
        },
    ]
    save_player_news(demo_news, db_path=db_path)

    return {
        "ok": True,
        "leagues_seeded": 2,
        "rosters_seeded": 24,
        "news_items_seeded": len(demo_news),
        "snapshots": [yesterday_date, today_date],
    }


if __name__ == "__main__":
    print("Initializing Fantasy Drafter In-Season SQLite Store...")
    init_db()
    seed_res = seed_demo_data()
    print("Seed result:", json.dumps(seed_res, indent=2))
