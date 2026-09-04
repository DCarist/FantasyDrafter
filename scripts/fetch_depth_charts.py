#!/usr/bin/env python3
"""Fetch official NFL depth charts for all 32 teams from ESPN and integrate into players-data.js / players-data.json.

Usage:
    python scripts/fetch_depth_charts.py [--out-js players-data.js] [--out-json players-data.json]
"""

import argparse
import json
import os
import re
import sys
from datetime import date

# Ensure UTF-8 console output on Windows
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

try:
    from espn_client import fetch_espn_json
except ImportError:
    from scripts.espn_client import fetch_espn_json

ESPN_TEAM_MAP = {
    "ARI": "ari",
    "ATL": "atl",
    "BAL": "bal",
    "BUF": "buf",
    "CAR": "car",
    "CHI": "chi",
    "CIN": "cin",
    "CLE": "cle",
    "DAL": "dal",
    "DEN": "den",
    "DET": "det",
    "GB": "gb",
    "HOU": "hou",
    "IND": "ind",
    "JAX": "jax",
    "KC": "kc",
    "LAC": "lac",
    "LAR": "lar",
    "LV": "lv",
    "MIA": "mia",
    "MIN": "min",
    "NE": "ne",
    "NO": "no",
    "NYG": "nyg",
    "NYJ": "nyj",
    "PHI": "phi",
    "PIT": "pit",
    "SEA": "sea",
    "SF": "sf",
    "TB": "tb",
    "TEN": "ten",
    "WAS": "wsh",  # ESPN uses 'wsh' for Washington
}


def norm_name(name):
    s = str(name).lower()
    s = re.sub(r"[.'’,-]", "", s)
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def build_player_lookup(players):
    """Build lookup maps to match depth chart athletes to players in the dataset."""
    lookup_exact = {}
    lookup_name = {}
    for i, p in enumerate(players):
        nn = norm_name(p.get("name", ""))
        team = p.get("team", "").upper()
        if team:
            lookup_exact[(nn, team)] = i
        if nn not in lookup_name:
            lookup_name[nn] = i
    return lookup_exact, lookup_name


def fetch_team_depth_chart(team_abbr, espn_code, lookup_exact, lookup_name):
    url = f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{espn_code}/depthcharts"
    data = fetch_espn_json(url, timeout=12, delay_before=0.08)

    off = next(
        (d for d in data.get("depthchart", []) if "qb" in d.get("positions", {})),
        None,
    )
    sp = next(
        (d for d in data.get("depthchart", []) if "pk" in d.get("positions", {})),
        None,
    )

    def parse_athletes(pos_container, pos_key, role=None):
        if not pos_container or pos_key not in pos_container.get("positions", {}):
            return []
        athletes = []
        pos_entry = pos_container["positions"][pos_key]
        for rank, ath in enumerate(pos_entry.get("athletes", []), 1):
            name = ath.get("displayName") or ath.get("shortName") or ""
            nn = norm_name(name)
            pid = lookup_exact.get((nn, team_abbr))
            if pid is None:
                pid = lookup_name.get(nn)

            item = {
                "name": name,
                "rank": rank,
                "espnId": str(ath.get("id", "")),
                "playerId": pid,
            }
            if role:
                item["role"] = role
            athletes.append(item)
        return athletes

    result = {
        "updated": date.today().isoformat(),
        "qb": parse_athletes(off, "qb"),
        "rb": parse_athletes(off, "rb"),
        "wr": {
            "wr1": parse_athletes(off, "wr1", role="WR1"),
            "wr2": parse_athletes(off, "wr2", role="WR2"),
            "wr3": parse_athletes(off, "wr3", role="WR3"),
        },
        "te": parse_athletes(off, "te"),
        "pk": parse_athletes(sp, "pk"),
    }
    return result


def fetch_all_depth_charts(players, verbose=True, existing_depth_charts=None):
    lookup_exact, lookup_name = build_player_lookup(players)
    depth_charts = {}
    total = len(ESPN_TEAM_MAP)
    for idx, (abbr, code) in enumerate(ESPN_TEAM_MAP.items(), 1):
        if verbose:
            print(f"[{idx}/{total}] Fetching depth chart for {abbr} ({code})...")
        try:
            depth_charts[abbr] = fetch_team_depth_chart(
                abbr, code, lookup_exact, lookup_name
            )
        except Exception as e:
            print(f"Warning: Failed to fetch depth chart for {abbr}: {e}")
            if existing_depth_charts and abbr in existing_depth_charts:
                print(f"Retaining existing depth chart for {abbr}.")
                depth_charts[abbr] = existing_depth_charts[abbr]
            else:
                depth_charts[abbr] = {
                    "updated": date.today().isoformat(),
                    "qb": [],
                    "rb": [],
                    "wr": {"wr1": [], "wr2": [], "wr3": []},
                    "te": [],
                    "pk": [],
                }
    return depth_charts


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT_JS = os.path.join(PROJECT_ROOT, "players-data.js")
DEFAULT_OUT_JSON = os.path.join(PROJECT_ROOT, "players-data.json")


def main():
    parser = argparse.ArgumentParser(description="Fetch NFL Depth Charts from ESPN")
    parser.add_argument(
        "--out-js", default=DEFAULT_OUT_JS, help="Path to players-data.js"
    )
    parser.add_argument(
        "--out-json", default=DEFAULT_OUT_JSON, help="Path to players-data.json"
    )
    args = parser.parse_args()

    # Load existing players data
    source_file = (
        args.out_json
        if (args.out_json and os.path.exists(args.out_json))
        else args.out_js
    )
    if not os.path.exists(source_file):
        print(f"Error: {source_file} not found.")
        sys.exit(1)

    if source_file.endswith(".js"):
        with open(source_file, "r", encoding="utf-8") as f:
            content = f.read()
            json_str = content.split("=", 1)[1].rstrip().rstrip(";")
            data = json.loads(json_str)
    else:
        with open(source_file, "r", encoding="utf-8") as f:
            data = json.load(f)

    players = data.get("players", [])
    print(f"Found {len(players)} players in dataset. Fetching depth charts...")

    existing_dc = data.get("depthCharts", {})
    depth_charts = fetch_all_depth_charts(
        players, verbose=True, existing_depth_charts=existing_dc
    )
    data["depthCharts"] = depth_charts

    # Write out JSON
    if args.out_json:
        with open(args.out_json, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print(f"Saved depth charts to {args.out_json}")

    # Write out JS
    if args.out_js:
        with open(args.out_js, "w", encoding="utf-8") as f:
            f.write(
                "// Master players and rankings dataset for Ken's Fantasy Drafter\n"
            )
            f.write("window.DRAFT_DATA = ")
            json.dump(data, f, indent=1)
            f.write(";\n")
        print(f"Saved depth charts to {args.out_js}")

    print(f"Successfully integrated depth charts for {len(depth_charts)} teams.")


if __name__ == "__main__":
    main()
